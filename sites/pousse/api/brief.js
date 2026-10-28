import Anthropic from '@anthropic-ai/sdk';
import { sendJson, checkAccess, readJson, cleanText, placeDetails } from './_lib.js';

const STYLES = {
  nature: 'chaleureux et naturel : tons doux, matières, photos lumineuses, typographie élégante',
  minimal: 'minimaliste : beaucoup de blanc, une couleur d\'accent, typographie fine, grille aérée',
  audacieux: 'audacieux : couleurs vives, typographie très grasse, mises en page asymétriques',
};

const SYSTEM = `Tu es directeur artistique et rédacteur web pour une agence qui crée des sites vitrines pour des commerces et artisans français.

À partir des informations réelles d'une entreprise, tu rédiges un brief complet en français, prêt à être collé dans un outil d'IA qui génère des sites web (Claude, Lovable, v0, etc.).

Règles :
- N'invente aucun fait : ni avis, ni horaires, ni prix, ni services, ni années d'expérience. Quand une information manque, écris [À COMPLÉTER AVEC LE CLIENT].
- Les avis fournis sont des extraits Google : propose-les comme témoignages à faire valider par le client avant publication.
- Choisis une direction artistique propre au métier et à la ville, et une « animation signature » originale qui évoque le métier (pas une animation générique).
- Structure le brief avec ces titres : OBJECTIF, INFOS RÉELLES, PUBLIC CIBLE, DIRECTION ARTISTIQUE (palette avec codes hex, typographies Google Fonts, ambiance), ANIMATION SIGNATURE, STRUCTURE DE LA PAGE (section par section, avec les textes d'accroche proposés), SEO LOCAL (balise title, meta description, mots-clés), CONTRAINTES TECHNIQUES (one-page responsive, rapide, accessible, bouton d'appel cliquable sur mobile).
- Réponds uniquement avec le brief, en texte brut, sans préambule.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST uniquement.' });
  if (!checkAccess(req, res)) return;
  if (!process.env.ANTHROPIC_API_KEY) {
    return sendJson(res, 503, { error: "ANTHROPIC_API_KEY n'est pas configurée sur le serveur." });
  }

  let body;
  try { body = await readJson(req); } catch { return sendJson(res, 400, { error: 'JSON invalide.' }); }
  const b = body.business || {};
  const style = STYLES[body.style] || STYLES.nature;
  const placeId = cleanText(b.id, 200);

  // Opening hours and review excerpts are fetched only when a brief is asked
  // for, so the (more expensive) details call is paid only for real leads.
  let details = null;
  if (placeId && process.env.GOOGLE_PLACES_API_KEY) {
    const r = await placeDetails(placeId).catch(() => null);
    if (r?.ok) details = r.data;
  }

  const reviews = (details?.reviews || [])
    .filter(r => r.text?.text && r.rating >= 4)
    .slice(0, 3)
    .map(r => `- ${r.rating}/5, ${r.authorAttribution?.displayName?.split(' ')[0] || 'client'} : « ${r.text.text.slice(0, 400)} »`);

  const facts = [
    `Nom : ${cleanText(b.name, 120)}`,
    `Métier : ${cleanText(details?.primaryTypeDisplayName?.text || b.category, 80)}`,
    `Adresse : ${cleanText(details?.formattedAddress || b.address, 200)}`,
    `Téléphone : ${cleanText(details?.nationalPhoneNumber || b.phone, 30) || 'inconnu'}`,
    b.manager?.name ? `Gérant(e) : ${cleanText(b.manager.name, 80)}${b.manager.role ? ` (${cleanText(b.manager.role, 60)})` : ''}` : 'Gérant(e) : inconnu',
    `Note Google : ${b.rating ?? details?.rating ?? 'aucune'}${b.reviews ? ` (${b.reviews} avis)` : ''}`,
    `Horaires : ${details?.regularOpeningHours?.weekdayDescriptions?.join(' ; ') || 'inconnus'}`,
    details?.editorialSummary?.text ? `Résumé Google : ${details.editorialSummary.text}` : null,
    b.social ? `Réseau social existant : ${cleanText(b.social, 200)}` : null,
    reviews.length ? `Extraits d'avis :\n${reviews.join('\n')}` : 'Extraits d\'avis : aucun',
  ].filter(Boolean).join('\n');

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      output_config: { effort: 'medium' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: `Style souhaité : ${style}.\n\nInformations réelles de l'entreprise :\n${facts}`,
      }],
    });

    if (response.stop_reason === 'refusal') {
      return sendJson(res, 422, { error: 'La génération du brief a été refusée pour cette entreprise.' });
    }
    const brief = response.content.filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
    return sendJson(res, 200, {
      brief,
      hours: details?.regularOpeningHours?.weekdayDescriptions || null,
      usage: { input: response.usage.input_tokens, output: response.usage.output_tokens },
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return sendJson(res, 502, { error: 'Clé Anthropic invalide.' });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return sendJson(res, 429, { error: 'Trop de demandes, réessayez dans un instant.' });
    }
    if (error instanceof Anthropic.APIError) {
      return sendJson(res, 502, { error: `Erreur API Claude (${error.status}) : ${error.message}` });
    }
    throw error;
  }
}
