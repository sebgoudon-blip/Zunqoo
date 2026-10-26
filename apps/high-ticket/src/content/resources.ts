/**
 * Ressources concrètes rattachées à certaines tâches : exemples, modèles de
 * messages à copier, grilles et checklists. Les marqueurs entre [crochets]
 * sont remplacés par les informations du profil quand elles sont connues.
 */

export type Resource =
  | { kind: "template"; title: string; body: string }
  | { kind: "table"; title: string; note?: string; columns: string[]; rows: string[][] }
  | { kind: "checklist"; id: string; title: string; items: string[] };

export const RESOURCES: Record<string, Resource[]> = {
  "2.2": [
    {
      kind: "table",
      title: "Exemples de niches high-ticket à explorer",
      note: "Des points de départ à vérifier avec Google Trends et le Planificateur de mots-clés, pas des recommandations garanties.",
      columns: ["Niche", "Prix de vente courant", "Saisonnalité", "Point de vigilance"],
      rows: [
        ["Bureaux assis-debout électriques", "300 – 900 €", "Stable", "Colis lourd : chiffre la livraison avant tout"],
        ["Fauteuils de bureau ergonomiques", "300 – 1 000 €", "Stable", "Beaucoup de concurrence : différencie-toi par la garantie"],
        ["Rameurs et vélos d'appartement", "400 – 1 500 €", "Pic en janvier", "SAV mécanique : exige pièces détachées et notice FR"],
        ["Équipement home-gym (racks, bancs, haltères réglables)", "300 – 1 500 €", "Pic en janvier et septembre", "Poids et volume : coût de transport élevé"],
        ["Fours à pizza d'extérieur et planchas premium", "300 – 1 200 €", "Printemps – été", "Produits gaz : conformité et notice obligatoires"],
        ["Spas gonflables et bains nordiques", "500 – 2 000 €", "Printemps – été", "SAV (fuites, pompes) : choisis un fournisseur européen"],
        ["Abris, enclos et niches premium pour animaux", "300 – 1 000 €", "Stable", "Montage : prévois une notice claire et une vidéo"],
        ["Mobilier de jardin haut de gamme", "500 – 2 000 €", "Printemps – été", "Livraison sur palette, délais à annoncer honnêtement"],
        ["Caves à vin et vitrines réfrigérées", "400 – 1 500 €", "Pic avant les fêtes", "Électroménager : garantie et réparabilité à vérifier"],
        ["Trottinettes électriques haut de gamme", "500 – 1 500 €", "Printemps – été", "Batteries : conformité, transport et SAV exigeants"],
        ["Saunas infrarouges d'intérieur", "1 000 – 2 000 €", "Automne – hiver", "N'affiche aucune promesse de santé (refus Merchant Center)"],
        ["Paddles et kayaks gonflables premium", "400 – 1 200 €", "Été", "Saison courte : prévois un second produit"],
      ],
    },
  ],
  "2.3": [
    {
      kind: "template",
      title: "Requêtes à tester dans le Planificateur de mots-clés",
      body: `acheter [produit]
[produit] prix
[produit] pas cher
meilleur [produit]
[produit] avis
[produit] livraison rapide
[produit] [caractéristique clé]
[produit] [matière ou dimension]`,
    },
  ],
  "2.4": [
    {
      kind: "template",
      title: "Grille d'analyse de la concurrence (à coller dans un tableur)",
      body: `Niche\tBoutique\tPrix\tDélai de livraison\tGarantie\tRetours\tPaiement en plusieurs fois\tAvis (note / nombre)\tPoints faibles de la fiche
[niche]\t[url]\t\t\t\t\t\t\t
[niche]\t[url]\t\t\t\t\t\t\t
[niche]\t[url]\t\t\t\t\t\t\t`,
    },
  ],
  "3.2": [
    {
      kind: "template",
      title: "Premier contact – grossiste européen (français)",
      body: `Objet : Demande de tarifs – [produit] – revente en ligne

Bonjour,

Je suis [Ton prénom et nom], de [Ta société]. Je lance une boutique en ligne spécialisée et je souhaite référencer votre [produit] (référence : [référence]).

Pourriez-vous m'indiquer :
1. le prix unitaire HT, livraison en France incluse, à l'unité et à partir de 5 unités ;
2. le délai de préparation et le délai de livraison moyen en France ;
3. si vous proposez l'expédition directe au client final, sans facture ni publicité à votre nom dans le colis ;
4. les certificats disponibles (déclaration de conformité CE) et l'existence d'une notice en français ;
5. la durée de garantie et la procédure en cas de produit défectueux ou de retour ;
6. si vous pouvez fournir des photos et vidéos HD libres d'utilisation.

Je souhaite d'abord commander un échantillon pour valider la qualité.

Merci par avance,
[Ton prénom et nom]
[Ta société] – [Ton email]`,
    },
    {
      kind: "template",
      title: "First contact – supplier in Asia (anglais)",
      body: `Subject: Price request – [product] – online retail in Europe

Hello,

My name is [Ton prénom et nom] from [Ta société]. I am launching an online store in Europe and I am interested in your [product] (item: [reference]).

Could you please share:
1. Unit price for 1 sample and for orders of 10 / 50 units, with express shipping to France (DDP if possible);
2. Production lead time and shipping time to France with your express line;
3. Whether you can dropship to end customers in Europe with neutral packaging (no invoice or branding from your company);
4. CE certificates / Declaration of Conformity and a user manual in French;
5. Warranty terms and how defective products are handled;
6. HD photos and videos we are allowed to use.

I would like to order one sample first to check the quality.

Best regards,
[Ton prénom et nom]
[Ta société] – [Ton email]`,
    },
    {
      kind: "template",
      title: "Relance après 3 jours sans réponse",
      body: `Objet : Re : Demande de tarifs – [produit]

Bonjour,

Je me permets de revenir vers vous concernant ma demande de tarifs pour votre [produit]. Je finalise ma sélection de fournisseurs cette semaine et je serais ravi de travailler avec vous.

Pouvez-vous me faire un retour, même partiel (prix et délais) ?

Bien cordialement,
[Ton prénom et nom]`,
    },
    {
      kind: "template",
      title: "Tableau comparatif des fournisseurs (à coller dans un tableur)",
      body: `Fournisseur\tPays\tPrix unitaire livré\tDélai total\tExpédition directe\tCE / notice FR\tGarantie\tPhotos HD\tRéactivité\tNote /10
\t\t\t\t\t\t\t\t\t
\t\t\t\t\t\t\t\t\t
\t\t\t\t\t\t\t\t\t`,
    },
  ],
  "3.3": [
    {
      kind: "checklist",
      id: "sample",
      title: "Contrôle de l'échantillon",
      items: [
        "Délai réel mesuré entre la commande et la réception",
        "Colis intact, emballage assez solide pour un produit de cette valeur",
        "Produit conforme à la description et aux photos du fournisseur",
        "Finitions sans défaut visible (rayures, jeu, odeur, bruit)",
        "Marquage CE présent sur le produit ou l'emballage",
        "Notice en français fournie",
        "Montage ou mise en service réalisé sans difficulté",
        "Photos et vidéos maison réalisées sous tous les angles",
        "Produit que tu achèterais toi-même à ce prix",
      ],
    },
  ],
  "3.4": [
    {
      kind: "template",
      title: "Bloc « Livraison & retours » pour ta fiche produit",
      body: `Livraison offerte en [délai] jours ouvrés, avec suivi.
Retours gratuits pendant [nombre] jours : tu changes d'avis, on te rembourse.
Garantie [durée] ans, pièces et main-d'œuvre.
Paiement sécurisé, en une fois ou en plusieurs fois.
Une question ? Notre équipe te répond sous 24 h : [Ton email]`,
    },
  ],
};

export function fillPlaceholders(text: string, p: { firstName?: string; companyName?: string; storeName?: string; email?: string } | null) {
  if (!p) return text;
  const values: Record<string, string | undefined> = {
    "[Ton prénom et nom]": p.firstName,
    "[Ta société]": p.companyName || p.storeName,
    "[Ta boutique]": p.storeName,
    "[Ton email]": p.email,
  };
  return Object.entries(values).reduce((t, [marker, value]) => (value?.trim() ? t.split(marker).join(value.trim()) : t), text);
}

/** Contenu copiable d'une ressource : texte, ou tableau au format tabulé pour un tableur. */
export function resourceText(r: Resource): string {
  if (r.kind === "template") return r.body;
  if (r.kind === "table") return [r.columns, ...r.rows].map((row) => row.join("\t")).join("\n");
  return r.items.map((i) => `☐ ${i}`).join("\n");
}
