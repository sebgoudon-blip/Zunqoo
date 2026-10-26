/**
 * Ressources concrètes rattachées à certaines tâches : exemples, modèles de
 * messages à copier, grilles et checklists. Les marqueurs entre [crochets]
 * sont remplacés par les informations du profil quand elles sont connues.
 */

export type Resource =
  | { kind: "template"; title: string; body: string }
  | { kind: "table"; title: string; note?: string; columns: string[]; rows: string[][] }
  | { kind: "checklist"; id: string; title: string; items: string[] }
  | { kind: "tracker"; title: string };

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
  "4.1": [
    {
      kind: "checklist",
      id: "shopify-setup",
      title: "Réglages Shopify à faire avant d'ouvrir",
      items: [
        "Paramètres > Général : nom de la boutique, email de contact, adresse identique à ton immatriculation",
        "Paramètres > Marchés : pays de vente limités à ceux où tu livres réellement",
        "Paramètres > Taxes : régime de TVA configuré, prix affichés TTC",
        "Paramètres > Expédition : zones et tarifs identiques à ta politique de livraison",
        "Paramètres > Paiements : Shopify Payments activé, coordonnées bancaires pro",
        "Paramètres > Notifications : emails de commande relus et traduits",
        "Paramètres > Politiques : pages légales publiées (tâche 4.5)",
        "Boutique en ligne > Préférences : titre et méta-description de la page d'accueil",
      ],
    },
  ],
  "4.2": [
    {
      kind: "checklist",
      id: "brand-name",
      title: "Choisir un nom de marque solide",
      items: [
        "Court (2 à 3 syllabes) et facile à épeler à l'oral",
        "Aucune marque connue dans le nom (ni dans le domaine)",
        "Recherche faite dans les bases de marques (data.inpi.fr en France, euipo.europa.eu pour l'UE) : pas de marque identique dans ta catégorie",
        "Domaine .fr ou .com disponible",
        "Pseudo disponible sur Instagram, TikTok et Facebook",
        "Fonctionne si tu ajoutes un second produit de la même niche",
      ],
    },
  ],
  "4.4": [
    {
      kind: "template",
      title: "Structure d'une fiche produit high-ticket",
      body: `TITRE
[Marque] [Type de produit] [Caractéristique clé] – [Modèle / couleur]

SOUS LE PRIX (zone d'achat)
✓ Livraison offerte en [délai] jours ouvrés, avec suivi
✓ Retours gratuits pendant [nombre] jours
✓ Garantie [durée] ans
✓ Paiement en une fois ou en plusieurs fois

ACCROCHE (2 phrases)
[Le problème que résout le produit] + [le résultat concret pour le client].

3 À 5 BÉNÉFICES
• [Bénéfice 1] : [preuve chiffrée ou caractéristique qui le justifie]
• [Bénéfice 2] : [preuve]
• [Bénéfice 3] : [preuve]

FICHE TECHNIQUE
Dimensions : […] – Poids : […] – Matériaux : […] – Puissance / capacité : […]
Contenu du colis : […]
Montage : [durée, outils fournis ou non]

VIDÉO
[Vidéo de ton échantillon : déballage, montage, utilisation]

FAQ
Quels sont les délais de livraison ? – [réponse]
Comment fonctionne la garantie ? – [réponse]
Puis-je retourner le produit ? – [réponse]
Le montage est-il difficile ? – [réponse]
Comment vous contacter ? – [Ton email]`,
    },
    {
      kind: "checklist",
      id: "gallery",
      title: "Galerie photos (6 à 8 visuels)",
      items: [
        "Photo 1 : produit seul sur fond blanc, sans texte (obligatoire pour Shopping)",
        "Photo 2 : produit en situation, dans un décor réaliste",
        "Photo 3 : détail des finitions ou de la matière",
        "Photo 4 : schéma des dimensions",
        "Photo 5 : produit utilisé par une personne (échelle)",
        "Photo 6 : contenu du colis",
        "Toutes les images en haute définition, au moins 1 000 px de large",
      ],
    },
  ],
  "4.6": [
    {
      kind: "template",
      title: "Page « À propos »",
      body: `Qui sommes-nous ?

[Ta boutique] est née d'un constat simple : [le problème que tu as vécu ou observé avec ce type de produit].

Plutôt que de proposer des centaines de références, nous avons choisi de sélectionner [le produit], après avoir comparé [nombre] modèles et testé nous-mêmes l'échantillon retenu.

Nos engagements :
• Un produit testé avant d'être mis en vente
• Une livraison suivie en [délai] jours ouvrés
• [nombre] jours pour changer d'avis
• Un service client qui répond sous 24 h

Une question ? Écris-nous à [Ton email].

[Ton prénom et nom], fondateur de [Ta boutique]`,
    },
  ],
  "4.8": [
    {
      kind: "checklist",
      id: "test-order",
      title: "Commande test de bout en bout",
      items: [
        "Commande passée depuis un téléphone, en navigation privée",
        "Prix, TVA et frais de livraison corrects au paiement",
        "Paiement en plusieurs fois proposé et fonctionnel",
        "Email de confirmation reçu, sans faute ni texte en anglais",
        "Commande visible dans Shopify avec la bonne adresse",
        "Remboursement effectué et email de remboursement reçu",
        "Liens du pied de page (CGV, retours, mentions légales) fonctionnels",
      ],
    },
  ],
  "5.3": [
    {
      kind: "table",
      title: "Exemple de configuration livraison et retours",
      note: "À adapter à tes vrais délais : ils doivent être identiques sur ton site et dans Merchant Center.",
      columns: ["Réglage", "Exemple", "Où le régler"],
      rows: [
        ["Pays de livraison", "France", "Merchant Center > Livraison et retours"],
        ["Frais de livraison", "0 € (offerte)", "Service de livraison"],
        ["Délai de traitement", "1 à 2 jours ouvrés", "Service de livraison"],
        ["Délai de transport", "2 à 4 jours ouvrés", "Service de livraison"],
        ["Heure limite de commande", "14 h", "Service de livraison"],
        ["Délai de retour", "30 jours", "Politique de retour"],
        ["Frais de retour", "Gratuits (étiquette fournie)", "Politique de retour"],
        ["Page de la politique", "https://www.tamarque.fr/policies/refund-policy", "Politique de retour"],
      ],
    },
  ],
  "5.4": [
    {
      kind: "table",
      title: "Titres de flux : à éviter et à suivre",
      columns: ["À éviter", "Pourquoi", "Mieux"],
      rows: [
        ["PROMO Bureau électrique -30 % !!!", "Mention promo, majuscules, ponctuation", "Ma Marque Bureau assis-debout électrique double moteur 160 x 80 cm"],
        ["Le meilleur rameur du marché", "Superlatif, pas de caractéristiques", "Ma Marque Rameur d'appartement magnétique pliable 16 niveaux"],
        ["Spa", "Trop vague, Google ne sait pas quand l'afficher", "Ma Marque Spa gonflable rond 4 places 800 L – Gris anthracite"],
        ["Fauteuil ergonomique compatible Herman Miller", "Marque tierce citée sans autorisation", "Ma Marque Fauteuil de bureau ergonomique résille soutien lombaire"],
      ],
    },
  ],
  "5.5": [
    {
      kind: "table",
      title: "Problèmes fréquents dans les Diagnostics",
      note: "Les libellés exacts peuvent varier : lis toujours le détail affiché par Merchant Center.",
      columns: ["Problème", "Cause habituelle", "Correction"],
      rows: [
        ["Prix différent sur la page de destination", "Prix modifié sur le site, flux pas encore mis à jour", "Attendre la synchronisation de l'app ou relancer l'import"],
        ["Disponibilité incorrecte", "Stock à 0 ou produit en brouillon sur Shopify", "Mettre à jour le stock et le statut du produit"],
        ["Image trop petite ou avec texte", "Visuel retouché ou basse définition", "Remplacer la première image par un fond blanc sans texte"],
        ["Identifiant produit manquant", "GTIN non renseigné", "Renseigner le GTIN, ou indiquer qu'il n'existe pas (marque blanche)"],
        ["Déclaration trompeuse", "Informations incomplètes ou incohérentes sur le site", "Repasser la checklist Merchant Center avant de demander un réexamen"],
      ],
    },
  ],
  "6.4": [
    {
      kind: "table",
      title: "Structure de campagne Shopping de départ",
      columns: ["Niveau", "Réglage conseillé", "Pourquoi"],
      rows: [
        ["Campagne", "Shopping standard – [produit] – FR", "Un nom clair pour s'y retrouver"],
        ["Stratégie d'enchères", "CPC manuel", "Contrôle total au démarrage"],
        ["Budget quotidien", "Celui du planificateur (tâche 6.3)", "Budget dépensé de façon régulière sur le mois"],
        ["Réseaux", "Google uniquement (pas de partenaires ni Display)", "Trafic à plus forte intention d'achat"],
        ["Ciblage géographique", "Personnes présentes dans le pays", "Évite les clics de l'étranger"],
        ["Groupe de produits", "Un groupe par produit", "Une enchère par produit"],
        ["Enchère de départ", "Le CPC estimé de la tâche 2.3", "Ajustée ensuite selon les résultats"],
        ["Mots-clés négatifs", "Liste de l'outil Titres Shopping", "Évite les clics sans intention d'achat"],
      ],
    },
  ],
  "6.6": [{ kind: "tracker", title: "Suivi quotidien de la campagne" }],
  "7.1": [
    {
      kind: "checklist",
      id: "weekly-routine",
      title: "Routine hebdomadaire (30 minutes)",
      items: [
        "Termes de recherche : exclure les requêtes non pertinentes",
        "Produits : comparer ROAS réel et ROAS de rentabilité",
        "Merchant Center : aucun produit refusé ni avertissement",
        "Boutique : stock, prix et délais toujours exacts",
        "Avis clients : répondre à chaque nouvel avis",
        "Carnet : noter les chiffres et décisions de la semaine",
      ],
    },
  ],
  "7.4": [
    {
      kind: "template",
      title: "Email de demande d'avis (à envoyer 5 à 7 jours après la livraison)",
      body: `Objet : Ton avis sur ton [produit] ?

Bonjour [prénom du client],

Ton [produit] est arrivé il y a quelques jours : nous espérons qu'il te donne entière satisfaction.

Ton avis aide d'autres clients à faire le bon choix. Il te faudra moins d'une minute : [lien vers le formulaire d'avis]

Un souci ou une question ? Réponds simplement à cet email : nous te répondons sous 24 h.

Merci pour ta confiance,
[Ton prénom et nom]
[Ta boutique]`,
    },
  ],
  "7.5": [
    {
      kind: "template",
      title: "Plan d'un guide d'achat",
      body: `Comment choisir son [produit] en [année] : le guide complet

1. En bref : les 3 critères qui comptent vraiment
2. À quoi sert un [produit] et pour qui
3. Les critères de choix, un par un
   – [Critère 1] : ce qu'il faut regarder, les valeurs conseillées
   – [Critère 2] : …
   – [Critère 3] : …
4. Tableau comparatif des types de [produit] (avantages, limites, budget)
5. Les erreurs fréquentes à éviter
6. Entretien et durée de vie
7. FAQ (5 à 8 questions réelles de clients)
8. Notre sélection : pourquoi nous avons choisi [ton produit], et pour qui il n'est pas fait

Conseils : chiffres vérifiables, sources citées, aucune promesse exagérée.`,
    },
  ],
  "7.6": [
    {
      kind: "table",
      title: "Idées d'upsell et de packs",
      columns: ["Produit principal", "Accessoire / pack", "Argument"],
      rows: [
        ["Bureau assis-debout", "Tapis anti-fatigue, passe-câbles, bras d'écran", "Poste de travail complet"],
        ["Rameur / home-gym", "Tapis de protection du sol, housse", "Protège le sol et l'appareil"],
        ["Spa gonflable", "Bâche isotherme, kit d'entretien, marchepied", "Économies de chauffage et confort"],
        ["Four à pizza", "Pelle, pierre de rechange, housse", "Prêt à l'emploi dès réception"],
        ["Mobilier de jardin", "Housses de protection, coussins", "Durée de vie prolongée"],
        ["Tout produit", "Extension de garantie, installation", "Tranquillité d'esprit"],
      ],
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
  if (r.kind === "checklist") return r.items.map((i) => `☐ ${i}`).join("\n");
  return "";
}
