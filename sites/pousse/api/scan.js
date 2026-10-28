import { sendJson, checkAccess, readJson, cleanText, fetchJson, placesTextSearch } from './_lib.js';

// Hosts that don't count as a real website: a business whose only "site" is a
// social profile or a directory listing is still a prospect.
const NOT_A_WEBSITE = [
  'facebook.com', 'instagram.com', 'linktr.ee', 'tiktok.com', 'linkedin.com', 'pagesjaunes.fr',
  'business.site', 'g.page', 'wa.me', 'whatsapp.com', 'planity.com', 'treatwell.fr', 'thefork.fr',
  'ubereats.com', 'deliveroo.fr', 'tripadvisor.fr', 'doctolib.fr',
];

const STOP_WORDS = new Set(['les', 'des', 'aux', 'chez', 'sarl', 'sas', 'sasu', 'eurl', 'and', 'the', 'pour', 'sur']);

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function websiteStatus(uri) {
  if (!uri) return { hasSite: false, social: null };
  const host = hostOf(uri);
  const social = NOT_A_WEBSITE.some(d => host === d || host.endsWith('.' + d));
  return social ? { hasSite: false, social: uri } : { hasSite: true, social: null };
}

function tokens(str) {
  return (str || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .split(/[^a-z0-9]+/).filter(t => t.length >= 3 && !STOP_WORDS.has(t));
}

function postalCodeOf(place) {
  const comp = (place.addressComponents || []).find(c => (c.types || []).includes('postal_code'));
  if (comp) return comp.longText;
  return (place.formattedAddress || '').match(/\b\d{5}\b/)?.[0] || '';
}

// Potential score (0-100): many reviews + good rating + no site = active
// business that is losing online customers.
function score(rating, reviews) {
  const r = rating || 0, n = reviews || 0;
  const volume = Math.min(1, Math.log10(1 + n) / 2.3);   // ~200 reviews = max
  const quality = r ? Math.max(0, Math.min(1, (r - 3.5) / 1.5)) : 0.3;
  return Math.round(25 + 50 * volume + 25 * quality);
}

// Look the business up in the official company register (data.gouv) to get
// its legal manager. Only accept a result whose name overlaps the Google name.
async function findManager(name, postalCode, tradeTokens) {
  if (!postalCode) return null;
  const url = `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(name)}`
    + `&code_postal=${postalCode}&per_page=3&limite_matching_etablissements=3&etat_administratif=A`;
  let resp;
  try { resp = await fetchJson(url, {}, 5000); } catch { return null; }
  if (!resp.ok || !resp.data?.results?.length) return null;

  const wanted = new Set(tokens(name).filter(t => !tradeTokens.has(t)));
  for (const company of resp.data.results) {
    const names = [
      company.nom_complet, company.nom_raison_sociale, company.siege?.nom_commercial,
      ...(company.siege?.liste_enseignes || []),
      ...(company.matching_etablissements || []).flatMap(e => [e.nom_commercial, ...(e.liste_enseignes || [])]),
    ].join(' ');
    const found = new Set(tokens(names));
    const overlap = [...wanted].filter(t => found.has(t)).length;
    if (wanted.size && overlap === 0) continue;

    const person = (company.dirigeants || []).find(d => d.type_dirigeant === 'personne physique');
    const fullName = person
      ? `${(person.prenoms || '').split(' ')[0]} ${person.nom || ''}`.trim()
      : null;
    return {
      name: fullName ? fullName.replace(/\b(\p{L})(\p{L}*)/gu, (_, a, b) => a + b.toLowerCase()) : null,
      role: person?.qualite || (company.complements?.est_entrepreneur_individuel ? 'Entrepreneur individuel' : null),
      company: company.nom_complet,
      siren: company.siren,
      exact: overlap >= Math.min(2, wanted.size),
    };
  }
  return null;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST uniquement.' });
  if (!checkAccess(req, res)) return;
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    return sendJson(res, 503, { error: "GOOGLE_PLACES_API_KEY n'est pas configurée sur le serveur." });
  }

  let body;
  try { body = await readJson(req); } catch { return sendJson(res, 400, { error: 'JSON invalide.' }); }
  const city = cleanText(body.city, 60);
  const trade = cleanText(body.trade, 60);
  const maxPages = Math.min(3, Math.max(1, Number(body.pages) || 3));
  if (!city || !trade) return sendJson(res, 400, { error: 'Indiquez une ville et un métier.' });

  // 1. Google Places: up to 3 pages of 20 results.
  const places = [];
  let pageToken;
  for (let page = 0; page < maxPages; page++) {
    const r = await placesTextSearch(`${trade} à ${city}`, pageToken);
    if (!r.ok) {
      const msg = r.data?.error?.message || `Erreur Google Places (${r.status})`;
      return sendJson(res, 502, { error: msg });
    }
    places.push(...(r.data?.places || []));
    pageToken = r.data?.nextPageToken;
    if (!pageToken) break;
  }

  // 2. Keep only open businesses without a real website.
  const seen = new Set();
  const prospects = places.filter(p => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return p.businessStatus !== 'CLOSED_PERMANENTLY' && !websiteStatus(p.websiteUri).hasSite;
  });

  // 3. Add the manager from the company register (gentle concurrency: the API
  // allows ~7 requests per second).
  const tradeTokens = new Set(tokens(trade));
  const managers = body.withManagers === false
    ? prospects.map(() => null)
    : await mapLimit(prospects, 3, p => findManager(p.displayName?.text || '', postalCodeOf(p), tradeTokens));

  const results = prospects.map((p, i) => ({
    id: p.id,
    name: p.displayName?.text || 'Sans nom',
    category: p.primaryTypeDisplayName?.text || trade,
    address: p.formattedAddress || '',
    postalCode: postalCodeOf(p),
    phone: p.nationalPhoneNumber || p.internationalPhoneNumber || null,
    rating: p.rating ?? null,
    reviews: p.userRatingCount ?? 0,
    mapsUrl: p.googleMapsUri || null,
    social: websiteStatus(p.websiteUri).social,
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    manager: managers[i],
    score: score(p.rating, p.userRatingCount),
  })).sort((a, b) => b.score - a.score);

  return sendJson(res, 200, {
    city, trade,
    scanned: seen.size,
    withoutWebsite: results.length,
    results,
  });
}
