// Recherche de prospects (commerces locaux) via l'API Google Places (Text Search + Details).
// Si aucune cle API n'est configuree, des donnees simulees sont retournees pour permettre
// de developper/demontrer le module sans compte Google Cloud.

export type LeadTrouve = {
  nom: string;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  ville: string;
  source: string;
};

const VILLES_MOCK = ["Lyon", "Grenoble", "Saint-Etienne", "Annecy", "Valence"];

const TYPES_COMMERCE_MOCK = [
  "Boulangerie",
  "Restaurant",
  "Salon de coiffure",
  "Fleuriste",
  "Boucherie",
  "Cave a vin",
  "Institut de beaute",
];

function leadsSimules(zone: string, limite: number): LeadTrouve[] {
  const leads: LeadTrouve[] = [];
  for (let i = 0; i < limite; i++) {
    const type = TYPES_COMMERCE_MOCK[i % TYPES_COMMERCE_MOCK.length];
    leads.push({
      nom: `${type} ${zone} ${i + 1}`,
      telephone: `+3347${(1000000 + i * 7).toString().slice(0, 7)}`,
      email: null,
      adresse: `${10 + i} rue de la Republique, ${zone}`,
      ville: zone,
      source: "mock",
    });
  }
  return leads;
}

export async function rechercherLeads(
  zone: string,
  limite = 10
): Promise<LeadTrouve[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  if (!apiKey) {
    return leadsSimules(zone, limite);
  }

  try {
    const requeteTexte = `commerces a ${zone}`;
    const urlRecherche = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
      requeteTexte
    )}&key=${apiKey}`;

    const reponseRecherche = await fetch(urlRecherche);
    const dataRecherche = await reponseRecherche.json();

    const resultats: any[] = (dataRecherche.results || []).slice(0, limite);

    const leads: LeadTrouve[] = [];

    for (const place of resultats) {
      let telephone: string | null = null;

      try {
        const urlDetails = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=formatted_phone_number&key=${apiKey}`;
        const reponseDetails = await fetch(urlDetails);
        const dataDetails = await reponseDetails.json();
        telephone = dataDetails?.result?.formatted_phone_number || null;
      } catch {
        // Pas de telephone disponible pour ce commerce, on continue sans bloquer.
      }

      leads.push({
        nom: place.name,
        telephone,
        email: null,
        adresse: place.formatted_address || null,
        ville: zone,
        source: "google_places",
      });
    }

    return leads;
  } catch (err) {
    console.error("[LEADS] Erreur Google Places, fallback simule:", err);
    return leadsSimules(zone, limite);
  }
}

export const VILLES_PRIORITAIRES_RHONE_ALPES = [
  "Lyon",
  "Grenoble",
  "Saint-Etienne",
  "Annecy",
  "Chambery",
  "Valence",
  "Villeurbanne",
  "Bourg-en-Bresse",
];
