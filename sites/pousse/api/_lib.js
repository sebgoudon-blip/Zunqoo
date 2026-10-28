// Shared helpers for the Pousse serverless functions. Files starting with "_"
// in /api are not exposed as routes by Vercel.

export function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

// Every call costs money (Google Places, Claude), so the endpoints are closed
// by default: the caller must send the code stored in POUSSE_ACCESS_CODE.
export function checkAccess(req, res) {
  const expected = process.env.POUSSE_ACCESS_CODE;
  if (!expected) {
    sendJson(res, 503, { error: "POUSSE_ACCESS_CODE n'est pas configuré sur le serveur." });
    return false;
  }
  if (req.headers['x-pousse-code'] !== expected) {
    sendJson(res, 401, { error: "Code d'accès invalide." });
    return false;
  }
  return true;
}

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

export function cleanText(value, max = 80) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function fetchJson(url, options = {}, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...options, signal: ctrl.signal });
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    return { ok: r.ok, status: r.status, data };
  } finally {
    clearTimeout(timer);
  }
}

// Fields requested from Google Places. Each field drives the price tier of the
// request, so keep this list to what the UI really uses.
const SEARCH_FIELDS = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.addressComponents',
  'places.nationalPhoneNumber', 'places.internationalPhoneNumber', 'places.rating',
  'places.userRatingCount', 'places.websiteUri', 'places.googleMapsUri', 'places.location',
  'places.businessStatus', 'places.primaryTypeDisplayName', 'nextPageToken',
].join(',');

export async function placesTextSearch(textQuery, pageToken) {
  const body = { textQuery, languageCode: 'fr', regionCode: 'FR', pageSize: 20 };
  if (pageToken) body.pageToken = pageToken;
  return fetchJson('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY,
      'X-Goog-FieldMask': SEARCH_FIELDS,
    },
    body: JSON.stringify(body),
  });
}

export async function placeDetails(placeId) {
  const fields = [
    'id', 'displayName', 'formattedAddress', 'nationalPhoneNumber', 'rating', 'userRatingCount',
    'googleMapsUri', 'primaryTypeDisplayName', 'regularOpeningHours.weekdayDescriptions',
    'editorialSummary', 'reviews',
  ].join(',');
  return fetchJson(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=fr`, {
    headers: { 'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY, 'X-Goog-FieldMask': fields },
  });
}
