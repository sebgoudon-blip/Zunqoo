import type { Module, Profile, Task } from "../types";

const inEu = (p: Profile) => p.country !== "CH";

export const MODULES: Module[] = [
  {
    id: "m1",
    number: 1,
    title: "Validation légale, fiscale & domiciliation",
    summary: "Une base administrative propre et cohérente, condition n°1 pour ne pas être suspendu par Google Merchant Center.",
    tasks: [
      {
        id: "1.0",
        title: "Créer ta structure juridique",
        why: "Google Merchant Center, Shopify Payments et les régies publicitaires exigent une entité identifiable. Vendre sans structure, c'est risquer un blocage des paiements.",
        steps: [
          "France : la micro-entreprise se crée gratuitement sur formalites.entreprise.gouv.fr. La SASU coûte plus cher (frais de greffe et d'annonce légale) mais protège ton patrimoine.",
          "Belgique : SRL ou personne physique via un guichet d'entreprises. Luxembourg : SARL-S ou entreprise individuelle. Suisse : raison individuelle ou Sàrl.",
          "Choisis une activité de type « commerce de détail à distance / vente en ligne ».",
          "Garde précieusement le document d'immatriculation (Kbis, extrait BCE, RCS…).",
        ],
        deliverable: "Ton numéro d'immatriculation (SIREN, BCE, RCS ou IDE).",
        cost: "0 € en micro-entreprise (France). Compter quelques centaines d'euros pour une société.",
        showIf: (p) => !p.hasCompany,
        faq: [
          {
            q: "Micro-entreprise ou société pour du high-ticket ?",
            a: "La micro-entreprise est la plus simple et la moins chère à créer, mais tu es imposé sur ton chiffre d'affaires sans pouvoir déduire tes achats ni ta publicité, et ses plafonds sont vite atteints en high-ticket. Beaucoup démarrent en micro pour tester, puis passent en société. Fais une simulation sur 12 mois avec un expert-comptable avant de choisir.",
          },
        ],
      },
      {
        id: "1.1",
        title: "Vérifier ta domiciliation & la sécurité de ton adresse",
        why: "Ton adresse de siège sera publique : mentions légales, CGV, Merchant Center. Google la compare à ton site et à ta banque. Une incohérence est une cause classique de suspension pour « déclaration trompeuse ».",
        steps: [
          "Ouvre ton document d'immatriculation récent (en France, le Kbis est gratuit sur monidenum.fr) et note l'adresse exacte du siège, au caractère près.",
          "Identifie ton type d'adresse : domicile personnel, société de domiciliation agréée, ou local professionnel.",
          "Si c'est ton domicile : sache qu'il sera visible par tous tes clients. C'est acceptable pour démarrer. Une domiciliation agréée coûte en général 15 à 30 €/mois. Ne la prends pas maintenant, on décidera plus tard.",
          "Vérifie que l'adresse est strictement identique sur ton compte bancaire professionnel. Note tout écart.",
          "Reporte l'adresse dans ton profil (bouton « Mon profil ») : elle sera réutilisée partout.",
        ],
        deliverable: "Une adresse unique, identique partout, enregistrée dans ton profil.",
        cost: "0 €",
        faq: [
          {
            q: "Puis-je mettre une adresse de domiciliation sur Merchant Center ?",
            a: "Oui, une domiciliation agréée est une adresse légale valable. Ce qui compte, c'est qu'elle soit identique sur ton immatriculation, ta banque, ton site et Merchant Center.",
          },
          {
            q: "Mon adresse de retour peut-elle être différente ?",
            a: "Oui. L'adresse de retour (entrepôt, fournisseur en Europe) peut différer du siège. Elle doit simplement être clairement indiquée dans ta politique de retour.",
          },
        ],
      },
      {
        id: "1.2",
        title: "Séparer tes finances avec un compte bancaire pro",
        why: "Shopify Payments verse sur ce compte, Google Ads le débite. Un compte dédié simplifie ta comptabilité et rassure les plateformes lors des vérifications d'identité.",
        steps: [
          "Si tu n'en as pas : ouvre un compte pro en ligne. Plusieurs néobanques ont une offre d'entrée gratuite ou sous 10 €/mois.",
          "Vérifie que le nom de la société et l'adresse correspondent exactement à ton immatriculation.",
          "Commande une carte de paiement : c'est elle qui paiera Google Ads et Shopify.",
        ],
        deliverable: "Un IBAN professionnel et une carte au nom de ta structure.",
        cost: "0 à 10 €/mois",
        faq: [
          {
            q: "Puis-je utiliser mon compte bancaire personnel au début ?",
            a: "En micro-entreprise, un compte dédié devient obligatoire quand le chiffre d'affaires dépasse 10 000 € deux années de suite. En société, un compte au nom de la société est obligatoire dès le départ. Dans tous les cas, séparer tout de suite évite les mélanges et facilite les vérifications de Shopify et Google.",
          },
        ],
      },
      {
        id: "1.3",
        title: "Clarifier ton régime de TVA",
        why: "Ton prix de vente TTC et ta marge réelle en dépendent. Le calculateur de rentabilité en tiendra compte.",
        steps: [
          "Vérifie si tu es en franchise en base de TVA ou assujetti (demande à ton comptable ou consulte ton espace fiscal en ligne).",
          "Si tu vends à des particuliers dans plusieurs pays de l'UE : au-delà de 10 000 € de ventes à distance intra-UE par an, la TVA du pays du client s'applique. Le guichet unique OSS permet de tout déclarer depuis ton pays.",
          "Récupère ton numéro de TVA intracommunautaire si tu en as un et ajoute-le à ton profil.",
        ],
        deliverable: "Ton taux de TVA applicable et ton numéro de TVA (s'il existe).",
        cost: "0 €",
        showIf: inEu,
        faq: [
          {
            q: "Je suis en franchise de TVA, ça change quoi ?",
            a: "Tu ne factures pas de TVA, mais tu ne la récupères pas non plus sur tes achats. Les seuils de chiffre d'affaires sont bas pour du high-ticket : quelques ventes à 500 € peuvent vite t'en faire sortir. Anticipe avec un comptable.",
          },
        ],
      },
      {
        id: "1.3ch",
        title: "Anticiper la TVA et la douane suisses",
        why: "La Suisse est hors UE : tes ventes vers l'UE (et inversement) passent la douane. Une mauvaise configuration crée des frais surprises pour le client, donc des refus de colis.",
        steps: [
          "Vérifie avec ton fiduciaire si tu dois facturer la TVA suisse.",
          "Si tu cibles la France, la Belgique et le Luxembourg depuis la Suisse : prévois une livraison droits acquittés (DDP) ou un entrepôt dans l'UE.",
          "Sinon, commence uniquement par le marché suisse pour la V1.",
        ],
        deliverable: "Un choix clair : marché CH seul, ou UE avec DDP / entrepôt UE.",
        showIf: (p) => p.country === "CH",
      },
      {
        id: "1.4",
        title: "Cocher les obligations de la vente à distance B2C",
        why: "Merchant Center vérifie que ton site affiche des informations légales complètes. Ces mêmes obligations te protègent en cas de litige.",
        steps: [
          "Droit de rétractation de 14 jours minimum pour le client (UE). Beaucoup de boutiques high-ticket offrent 30 jours pour rassurer.",
          "France : adhère à un médiateur de la consommation. C'est obligatoire, et son nom doit apparaître dans tes CGV.",
          "Prévois un bandeau cookies conforme au RGPD. Shopify propose une bannière de consentement gratuite.",
          "Les pages mentions légales, CGV, livraison, retours et confidentialité seront générées au Module 4 avec l'outil intégré.",
        ],
        deliverable: "Un médiateur choisi (France) et la liste des pages légales à produire.",
        cost: "Médiateur : de quelques dizaines à ~100 € par an selon le prestataire.",
        faq: [
          {
            q: "Comment choisir un médiateur de la consommation ?",
            a: "La liste officielle des médiateurs référencés est publiée sur economie.gouv.fr (Commission d'évaluation et de contrôle de la médiation de la consommation). Compare les tarifs : certains facturent une adhésion annuelle, d'autres au dossier. Choisis-en un qui couvre la vente en ligne de ton secteur.",
          },
        ],
      },
      {
        id: "1.5",
        title: "Compléter ta fiche d'identité légale",
        why: "Ces informations alimentent automatiquement le générateur de pages légales et doivent être identiques partout : site, Merchant Center, Google Ads.",
        steps: [
          "Ouvre « Mon profil » et remplis : raison sociale, numéro d'immatriculation, TVA, adresse, email et téléphone de contact.",
          "Utilise un numéro de téléphone joignable : Google peut appeler ou envoyer un SMS de vérification.",
          "Relis chaque champ contre ton document officiel.",
        ],
        deliverable: "Profil légal complet à 100 %.",
        cost: "0 €",
        faq: [
          {
            q: "Dois-je afficher mon numéro de téléphone personnel ?",
            a: "Tu dois proposer un numéro joignable, pas forcément personnel. Une seconde ligne ou un numéro virtuel à petit prix protège ta vie privée, à condition que tu répondes réellement.",
          },
        ],
      },
    ],
  },
  {
    id: "m2",
    number: 2,
    title: "Recherche produit high-ticket",
    summary: "Trouver un produit à 300–2 000 € qui se cherche sur Google, avec assez de marge pour financer la publicité.",
    tasks: [
      {
        id: "2.1",
        title: "Intégrer les critères d'un produit high-ticket rentable",
        why: "Avec un budget publicitaire limité, une seule vente doit couvrir le coût d'acquisition et laisser du profit. Les produits à 30 € ne le permettent pas sur Google Shopping.",
        steps: [
          "Ouvre l'outil « Score produit » et lis les 10 critères.",
          "Retiens les essentiels : prix de vente entre 300 et 2 000 €, au moins 40 % de marge avant publicité, demande recherchée activement sur Google, peu de SAV, pas vendu partout en grande surface.",
          "Évite au démarrage les catégories à risque pour Merchant Center : santé et médical, compléments, armes, produits de marque (contrefaçon), électronique sans conformité CE.",
        ],
        deliverable: "Les critères en tête et les catégories exclues notées.",
        tool: "score",
        cost: "0 €",
        faq: [
          {
            q: "Pourquoi éviter les produits de grandes marques ?",
            a: "Revendre une marque sans être distributeur agréé expose à des litiges pour contrefaçon ou usage de marque, et Merchant Center refuse les produits qui posent ce problème. Pour démarrer, un produit en marque blanche vendu sous le nom de ta boutique est bien plus sûr.",
          },
        ],
      },
      {
        id: "2.2",
        title: "Lister 10 idées de niches avec Google Trends",
        why: "La tendance sur 12 mois révèle si une demande est stable, en croissance ou juste un pic saisonnier.",
        steps: [
          "Va sur trends.google.fr. Règle le pays sur ton marché et la période sur « 12 derniers mois », puis sur « 5 dernières années ».",
          "Teste des univers à panier élevé : mobilité (trottinettes, vélos électriques), maison (saunas, spas, poêles), jardin (abris, robots tondeuses), bureau (bureaux assis-debout, fauteuils ergonomiques), sport (rameurs, home-gym), animaux (enclos, abris premium).",
          "Garde les termes dont la courbe est stable ou en hausse. Écarte ceux qui n'ont qu'un pic saisonnier ou une chute.",
          "Note 10 idées.",
        ],
        deliverable: "Une liste de 10 niches avec leur tendance (stable, hausse, saisonnière).",
        cost: "0 €",
        faq: [
          {
            q: "Une niche saisonnière est-elle à éviter ?",
            a: "Pas forcément, mais lance-la 4 à 8 semaines avant le pic pour avoir le temps de tester, et prévois un autre produit pour le reste de l'année. Avec un petit budget, une demande stable est plus sûre pour apprendre.",
          },
        ],
      },
      {
        id: "2.3",
        title: "Mesurer l'intention d'achat avec le Planificateur de mots-clés",
        why: "Google Shopping capte des gens qui cherchent déjà à acheter. Sans volume de recherche commerciale, pas de ventes, même avec un excellent produit.",
        steps: [
          "Crée un compte Google Ads sans lancer de campagne, puis ouvre Outils > Planificateur de mots-clés (gratuit). Le compte servira au Module 6.",
          "Pour chaque niche, teste des requêtes commerciales : « acheter [produit] », « [produit] prix », « meilleur [produit] ».",
          "Note le volume mensuel et l'enchère « haut de page » estimée. Elle te donne une idée du CPC.",
          "Option : SEMrush propose un essai gratuit pour approfondir. Ne paie pas d'abonnement maintenant.",
          "Garde les 5 niches avec au moins ~1 000 recherches commerciales par mois dans ton pays.",
        ],
        deliverable: "5 niches avec volume mensuel et CPC estimé.",
        cost: "0 € (essais gratuits uniquement)",
        faq: [
          {
            q: "Le planificateur affiche des fourchettes vagues, c'est normal ?",
            a: "Oui, sans campagne active Google affiche des fourchettes (1k–10k). C'est suffisant pour comparer les niches entre elles.",
          },
        ],
      },
      {
        id: "2.4",
        title: "Espionner la concurrence sur Google Shopping",
        why: "Tu vois exactement contre qui tu te bats, à quel prix, et ce que les concurrents font mal.",
        steps: [
          "Recherche chaque niche sur google.fr (ou .be, .ch, .lu), onglet Shopping.",
          "Note pour chaque niche : le nombre de marchands, la fourchette de prix, la présence de grandes enseignes et les avis affichés.",
          "Ouvre 3 boutiques concurrentes : qualité de la fiche produit, délais de livraison, garantie, paiement en plusieurs fois.",
          "Pour aller plus loin, utilise un outil d'espionnage de boutiques (Copify, Trend Track…) en essai gratuit. Les alternatives gratuites sont le Centre de transparence des annonces Google et la bibliothèque publicitaire Meta.",
          "Une niche idéale compte des concurrents (preuve de marché), mais surtout de petites boutiques avec des fiches faibles.",
        ],
        deliverable: "Un tableau concurrence pour tes 5 niches.",
        cost: "0 €",
        faq: [
          {
            q: "Beaucoup de concurrents, c'est mauvais signe ?",
            a: "Non : cela prouve qu'il y a des acheteurs. Le vrai signal d'alerte, c'est quand les premières places sont toutes prises par de grandes enseignes avec des prix que tu ne peux pas suivre. Cherche les requêtes où de petites boutiques apparaissent.",
          },
        ],
      },
      {
        id: "2.5",
        title: "Scorer tes 3 produits finalistes",
        why: "Le scoring transforme ton intuition en décision mesurable, pour éviter de t'attacher à un mauvais produit.",
        steps: [
          "Dans tes meilleures niches, choisis 3 produits précis (modèle, gamme de prix).",
          "Passe chacun dans l'outil « Score produit ».",
          "Élimine tout produit sous 60/100.",
        ],
        deliverable: "3 produits scorés, et un favori.",
        tool: "score",
        cost: "0 €",
        faq: [
          {
            q: "Et si aucun produit ne dépasse 60/100 ?",
            a: "Reviens à la tâche 2.2 avec d'autres niches plutôt que de forcer. Une semaine de recherche en plus coûte bien moins cher qu'un budget publicitaire dépensé sur un mauvais produit.",
          },
        ],
      },
      {
        id: "2.6",
        title: "Valider la rentabilité du produit favori",
        why: "Ton ROAS de rentabilité dit combien chaque euro de pub doit rapporter. Au-dessus de 4, il devient difficile d'être rentable sur Google Shopping au démarrage.",
        steps: [
          "Ouvre le « Calculateur de rentabilité ».",
          "Entre un prix de vente réaliste (aligné sur la concurrence) et un coût produit estimé, livraison comprise.",
          "Vise une marge avant pub ≥ 40 % et un ROAS de rentabilité ≤ 3.",
          "Si ce n'est pas le cas : monte le prix, négocie le coût ou passe au produit suivant.",
        ],
        deliverable: "Ton CPA maximum et ton ROAS de rentabilité.",
        tool: "profit",
        cost: "0 €",
        faq: [
          {
            q: "Pourquoi le ROAS de rentabilité est-il calculé sur le prix TTC ?",
            a: "Google Ads compare tes dépenses à la valeur de conversion envoyée par ta boutique, souvent TTC selon la configuration. Vérifie ce qui est transmis dans Google Ads > Objectifs > Conversions, et compare toujours ton ROAS réel à un seuil calculé sur la même base.",
          },
        ],
      },
    ],
  },
  {
    id: "m3",
    number: 3,
    title: "Sourcing logistique hybride",
    summary: "Des délais de livraison courts et fiables : un argument de vente et une exigence de Merchant Center.",
    tasks: [
      {
        id: "3.1",
        title: "Choisir ton modèle logistique",
        why: "Sur un produit à 800 €, un délai de 3 semaines tue la conversion. Le délai annoncé doit en outre être respecté, sinon Merchant Center peut te pénaliser.",
        steps: [
          "Option A, grossiste ou dropshipper européen (livraison en 48–72 h) : conversion maximale, marge souvent plus faible.",
          "Option B, agent de sourcing en Chine avec ligne express (5–8 jours ouvrés) : meilleure marge, à condition que le délai soit annoncé honnêtement.",
          "Option hybride : lance avec l'option A pour valider le produit, puis bascule vers l'option B (ou du stock en Europe) une fois les ventes prouvées.",
          "Note les délais réels que tu annonceras.",
        ],
        deliverable: "Ton modèle choisi et ton délai de livraison annoncé.",
        cost: "0 €",
        faq: [
          {
            q: "Puis-je annoncer une « livraison rapide » avec un fournisseur en Chine ?",
            a: "Seulement si le délai réel le justifie. Annonce le délai mesuré sur ton échantillon, avec une marge de sécurité. Un délai sous-estimé entraîne des litiges, de mauvais avis et des problèmes avec Merchant Center.",
          },
        ],
      },
      {
        id: "3.2",
        title: "Contacter 3 fournisseurs avec un message structuré",
        why: "Comparer au moins 3 offres te donne un levier de négociation et un fournisseur de secours.",
        steps: [
          "Trouve 3 fournisseurs (plateformes de grossistes européens, Alibaba, ou un agent de sourcing).",
          "Envoie le même message à chacun, en demandant : prix unitaire livré en UE, délai de préparation et d'expédition, certificats CE et notice en français, garantie, possibilité de photos et vidéos HD, et marque blanche.",
          "Demande explicitement s'ils expédient sans publicité ni facture à leur nom dans le colis.",
          "Classe les réponses dans un tableau.",
        ],
        deliverable: "Un tableau comparatif de 3 fournisseurs.",
        cost: "0 €",
        faq: [
          {
            q: "Comment repérer un fournisseur peu fiable ?",
            a: "Méfie-toi des prix très en dessous du marché, des refus d'envoyer un échantillon, de l'absence de certificats et des réponses vagues sur les délais. Demande des photos réelles du produit et une facture pro forma avant tout paiement.",
          },
        ],
      },
      {
        id: "3.3",
        title: "Commander un échantillon",
        why: "Tu ne peux pas vendre honnêtement à 800 € un produit que tu n'as jamais touché. L'échantillon sert aussi à créer tes propres photos et vidéos.",
        steps: [
          "Commande 1 unité chez le fournisseur favori, livrée chez toi, aux conditions réelles.",
          "Mesure le délai réel de bout en bout.",
          "Vérifie la qualité perçue, l'emballage, le marquage CE et la notice en français (obligatoire en France pour les produits grand public).",
          "Filme et photographie le produit sous tous les angles.",
        ],
        deliverable: "Échantillon validé (ou rejeté), photos et vidéos maison.",
        cost: "Le prix d'achat du produit. Prévois-le dans ton budget.",
        faq: [
          {
            q: "Que vérifier en priorité sur l'échantillon ?",
            a: "L'impression au déballage, la conformité à la description, le marquage CE, la notice en français et la solidité de l'emballage. Sur un produit à plusieurs centaines d'euros, un colis abîmé, c'est un retour presque assuré.",
          },
        ],
      },
      {
        id: "3.4",
        title: "Fixer ta politique de livraison et de retours",
        why: "Merchant Center exige que la livraison et les retours soient identiques sur ton site et dans ton compte. Ce sont aussi des arguments de réassurance.",
        steps: [
          "Décide des frais de livraison. Sur du high-ticket, la livraison offerte convertit mieux : intègre-la au prix.",
          "Définis le délai de retour (14 jours légaux minimum, 30 jours recommandés), qui paie le retour et l'adresse de retour (idéalement en Europe).",
          "Définis la garantie : 2 ans de garantie légale de conformité dans l'UE, plus une éventuelle garantie commerciale.",
        ],
        deliverable: "Frais et délais de livraison, conditions de retour, garantie.",
        cost: "0 €",
        faq: [
          {
            q: "Qui paie le retour en cas de rétractation ?",
            a: "Dans l'UE, les frais de retour peuvent rester à la charge du client s'il en a été clairement informé avant l'achat. Les prendre en charge est un argument fort en high-ticket : prévois-le dans la provision retours du calculateur.",
          },
        ],
      },
      {
        id: "3.5",
        title: "Fixer ton prix de vente définitif",
        why: "Avec le vrai coût d'achat, tu peux enfin calculer ton vrai CPA maximum.",
        steps: [
          "Mets à jour le calculateur avec le coût réel (produit, livraison, emballage).",
          "Fixe un prix psychologique (par exemple 749 € plutôt que 750 €), cohérent avec la concurrence relevée au 2.4.",
          "Note ton CPA max : c'est la limite de dépense publicitaire par vente.",
        ],
        deliverable: "Prix de vente TTC et CPA max.",
        tool: "profit",
        cost: "0 €",
      },
    ],
  },
  {
    id: "m4",
    number: 4,
    title: "Création & optimisation CRO de la boutique Shopify",
    summary: "Une boutique mono-produit ou de niche qui inspire assez confiance pour qu'un inconnu y dépense 800 €.",
    tasks: [
      {
        id: "4.1",
        title: "Ouvrir ta boutique Shopify au moindre coût",
        why: "Shopify propose régulièrement un essai gratuit suivi d'une offre de lancement à prix réduit. Pas besoin du plan supérieur pour démarrer.",
        steps: [
          "Crée ton compte sur shopify.com/fr et profite de l'offre d'essai en cours (souvent quelques euros pour les premiers mois, vérifie les conditions).",
          "Choisis le plan de base. Le plan supérieur ne sert à rien tant que tu ne fais pas de volume.",
          "Paramètres > Boutique : renseigne les informations légales exactement comme dans ton profil. Devise : EUR (CHF pour la Suisse seule).",
          "Paramètres > Taxes : configure ton régime de TVA (Module 1.3).",
        ],
        deliverable: "Une boutique Shopify ouverte, informations légales renseignées.",
        cost: "Offre de lancement Shopify (quelques € les premiers mois)",
        faq: [
          {
            q: "Le plan de base de Shopify suffit-il ?",
            a: "Oui pour démarrer : il inclut la boutique, les paiements et les applications. Les plans supérieurs réduisent surtout certains frais et ajoutent des rapports, utiles seulement quand tu as du volume.",
          },
        ],
      },
      {
        id: "4.2",
        title: "Acheter ton nom de domaine",
        why: "Une boutique en .myshopify.com n'inspire pas confiance pour un achat élevé, et Merchant Center doit valider un domaine que tu possèdes.",
        steps: [
          "Choisis un nom de marque court, mémorisable et sans nom de marque déposée (pas de « Dyson-shop.fr »).",
          "Achète le .fr (ou .be, .ch, .lu) ou le .com directement dans Shopify ou chez un registrar (environ 10 à 15 €/an).",
          "Connecte-le dans Paramètres > Domaines et définis-le comme domaine principal.",
          "Crée une adresse email sur ce domaine (contact@tamarque.fr) et ajoute-la à ton profil.",
        ],
        deliverable: "Domaine principal actif et email pro.",
        cost: "≈ 10–15 €/an (domaine)",
        faq: [
          {
            q: ".fr ou .com ?",
            a: "Le .fr rassure les acheteurs français ; le .com est plus neutre si tu vises aussi la Belgique, la Suisse ou le Luxembourg. Si le budget le permet, prends les deux et redirige l'un vers l'autre.",
          },
        ],
      },
      {
        id: "4.3",
        title: "Installer un thème gratuit et une identité sobre",
        why: "Les thèmes gratuits officiels (comme Dawn) sont rapides et fiables. Le high-ticket se vend avec de la sobriété, pas des gadgets.",
        steps: [
          "Boutique en ligne > Thèmes : garde Dawn ou choisis un autre thème gratuit officiel.",
          "Crée un logo texte simple (police élégante, sans clipart).",
          "Limite-toi à 2 couleurs (une neutre, une d'accent) et 1 typographie.",
          "Supprime tout ce qui n'est pas lié à ton produit ou à ta niche.",
        ],
        deliverable: "Thème configuré avec ton logo et tes couleurs.",
        cost: "0 €",
        faq: [
          {
            q: "Faut-il acheter un thème payant ?",
            a: "Pas au départ. Un thème payant ne compense pas une fiche produit faible. Investis plutôt dans de bonnes photos et vidéos de ton échantillon.",
          },
        ],
      },
      {
        id: "4.4",
        title: "Construire la page produit high-ticket",
        why: "C'est sur cette page qu'arrivent les clics Google Shopping. Chaque doute non levé coûte une vente.",
        steps: [
          "Titre clair : Marque + type de produit + caractéristique clé.",
          "Galerie de 6 à 8 visuels : fond blanc en premier (requis pour Shopping), puis mise en situation, détails et dimensions.",
          "Zone d'achat (ATC) : prix, paiement en plusieurs fois s'il est disponible, délai de livraison réel, « Retours 30 jours », garantie, logos de paiement.",
          "Sous la zone d'achat : 3 à 5 bénéfices concrets, une fiche technique complète, le contenu de la boîte, une FAQ (livraison, garantie, montage, SAV) et une vidéo de ton échantillon.",
          "N'invente rien : pas de faux avis, de faux compteur de stock ni de fausse promotion. Merchant Center les sanctionne.",
        ],
        deliverable: "Page produit complète, testée sur mobile.",
        cost: "0 €",
        faq: [
          {
            q: "Faut-il afficher un prix barré ?",
            a: "Seulement si c'est un prix auquel tu as réellement vendu. En France et dans l'UE, le prix de référence doit être le prix le plus bas pratiqué dans les 30 jours précédant la réduction.",
          },
        ],
      },
      {
        id: "4.5",
        title: "Générer et publier tes pages légales",
        why: "Merchant Center refuse un site sans mentions légales, CGV, politique de retour et de livraison accessibles.",
        steps: [
          "Ouvre le « Générateur de pages légales » : il utilise ton profil et tes réponses du Module 3.",
          "Copie chaque texte dans Shopify > Paramètres > Politiques (retours, confidentialité, conditions, livraison, coordonnées).",
          "Crée une page « Mentions légales » et ajoute toutes ces pages au menu du pied de page.",
          "Fais relire les textes par un professionnel dès que possible : ce sont des modèles de départ.",
        ],
        deliverable: "Toutes les pages légales en ligne et dans le footer.",
        tool: "legal",
        cost: "0 €",
        faq: [
          {
            q: "Les modèles de pages légales suffisent-ils ?",
            a: "Ils couvrent les mentions habituelles, mais chaque activité a ses particularités (garanties, produits réglementés, ventes hors UE). Fais-les relire par un professionnel avant de lancer la publicité.",
          },
        ],
      },
      {
        id: "4.6",
        title: "Ajouter les éléments de réassurance",
        why: "Pour un achat de plusieurs centaines d'euros, le visiteur cherche des preuves qu'une vraie entreprise existe derrière le site.",
        steps: [
          "Page Contact : email, téléphone, adresse et horaires de réponse, avec un formulaire.",
          "Page « À propos » : qui tu es et pourquoi ce produit, avec une vraie photo si possible.",
          "Bandeau sous le header : livraison offerte, retours 30 jours, garantie 2 ans, paiement sécurisé.",
          "Installe une application d'avis gratuite. N'importe aucun avis que tu ne peux pas prouver.",
        ],
        deliverable: "Pages Contact et À propos, bandeau de réassurance.",
        cost: "0 €",
        faq: [
          {
            q: "Comment obtenir des avis au démarrage sans en inventer ?",
            a: "Demande un avis à chaque client après la livraison, et propose le produit à quelques testeurs en indiquant clairement qu'ils l'ont reçu gratuitement. N'importe jamais d'avis venant d'un autre site ou d'un fournisseur.",
          },
        ],
      },
      {
        id: "4.7",
        title: "Activer les paiements, dont le paiement fractionné",
        why: "Payer 800 € en 3 ou 4 fois lève la principale objection d'un achat high-ticket.",
        steps: [
          "Active Shopify Payments (cartes, Apple Pay, Google Pay).",
          "Ajoute PayPal.",
          "Ajoute une solution de paiement en 3x/4x disponible dans ton pays, et compare les commissions avant de choisir.",
          "Reporte les frais de paiement réels dans le calculateur de rentabilité.",
        ],
        deliverable: "Les moyens de paiement actifs.",
        tool: "profit",
        cost: "0 € fixe, commission par transaction",
        faq: [
          {
            q: "Le paiement en plusieurs fois coûte-t-il cher ?",
            a: "La commission est plus élevée que pour un paiement par carte classique. Sur du high-ticket, elle est souvent compensée par un meilleur taux de conversion : vérifie l'impact sur ta marge dans le calculateur.",
          },
        ],
      },
      {
        id: "4.8",
        title: "Passer une commande test de bout en bout",
        why: "Une commande qui plante le jour du lancement, c'est du budget publicitaire brûlé.",
        steps: [
          "Retire le mot de passe de la boutique uniquement après ce test.",
          "Passe une vraie commande sur mobile (puis rembourse-toi), ou utilise le mode test de paiement.",
          "Vérifie l'email de confirmation, le montant de la TVA et la page de remerciement.",
          "Vérifie que le site s'affiche sans erreur sur mobile et sur ordinateur.",
        ],
        deliverable: "Une commande test réussie.",
        cost: "0 € (remboursée)",
        faq: [
          {
            q: "Comment tester une commande sans payer ?",
            a: "Active le mode test de ton moyen de paiement dans Shopify (ou la passerelle de test proposée par Shopify) et utilise les numéros de carte de test indiqués dans l'aide Shopify. Pense à le désactiver avant le lancement.",
          },
        ],
      },
    ],
  },
  {
    id: "m5",
    number: 5,
    title: "Blindage Google Merchant Center",
    summary: "Obtenir l'approbation du compte du premier coup et éviter la suspension pour « déclaration trompeuse ».",
    tasks: [
      {
        id: "5.1",
        title: "Passer l'audit de conformité avant de créer le compte",
        why: "La première revue de Merchant Center est la plus importante. Mieux vaut corriger avant qu'après une suspension.",
        steps: [
          "Ouvre la « Checklist Merchant Center » et coche chaque point honnêtement.",
          "Corrige tout point non conforme avant de continuer.",
          "Option : complète par un outil d'audit Merchant Center spécialisé (par exemple Spectta) si tu y as accès.",
        ],
        deliverable: "Checklist à 100 %.",
        tool: "gmc",
        cost: "0 €",
        faq: [
          {
            q: "Que faire si un point ne peut pas être coché ?",
            a: "Corrige-le avant de créer le compte Merchant Center, même si cela retarde le lancement de quelques jours. Une suspension dès la première revue est bien plus longue à lever.",
          },
        ],
      },
      {
        id: "5.2",
        title: "Connecter Shopify à Google via l'app officielle",
        why: "L'app Google & YouTube de Shopify crée le compte Merchant Center, synchronise ton catalogue et installe le suivi des conversions.",
        steps: [
          "Shopify > Applications : installe « Google & YouTube » (gratuite).",
          "Connecte ton compte Google, puis crée ou associe un compte Merchant Center.",
          "Renseigne les informations d'entreprise, strictement identiques à ton profil.",
          "Valide et revendique ton domaine (l'app le fait automatiquement pour un domaine connecté à Shopify).",
        ],
        deliverable: "Merchant Center créé, domaine validé et revendiqué.",
        cost: "0 €",
        faq: [
          {
            q: "L'app Google & YouTube est-elle payante ?",
            a: "Non, elle est gratuite. Tu ne paies que les clics de tes campagnes Google Ads.",
          },
        ],
      },
      {
        id: "5.3",
        title: "Configurer livraison et retours dans Merchant Center",
        why: "Les délais, frais et conditions de retour doivent correspondre exactement à ce qu'affiche ton site.",
        steps: [
          "Merchant Center > Livraison et retours : crée un service de livraison par pays ciblé.",
          "Indique les frais (0 € si offerte) et les délais de traitement et de transport réels.",
          "Crée une politique de retour : délai, frais, URL de ta page Retours.",
        ],
        deliverable: "Livraison et retours configurés pour chaque pays ciblé.",
        cost: "0 €",
        faq: [
          {
            q: "Dois-je livrer dans tous les pays ?",
            a: "Non. Déclare uniquement les pays où tu livres vraiment, avec les vrais frais et délais. Mieux vaut commencer par ton pays seul, puis élargir.",
          },
        ],
      },
      {
        id: "5.4",
        title: "Optimiser ton flux produit",
        why: "Sur Shopping, il n'y a pas de mots-clés : Google s'appuie sur ton titre et tes attributs pour te montrer. Un bon flux fait baisser le CPC et monter le taux de clic.",
        steps: [
          "Titre : Marque + Type de produit + Attribut clé (taille, matière, puissance) + Modèle. Mets les mots les plus recherchés au début.",
          "Description : factuelle, avec caractéristiques, sans majuscules ni promotions.",
          "Image principale : fond blanc, sans texte, sans logo ajouté, sans filigrane.",
          "GTIN : si ton produit en a un, renseigne-le. Sinon (marque blanche), indique qu'il n'a pas d'identifiant.",
          "Catégorie Google, état « neuf » et disponibilité exacte.",
        ],
        deliverable: "Le produit est « Approuvé » dans Merchant Center > Produits.",
        tool: "titles",
        cost: "0 €",
        faq: [
          {
            q: "Mon produit en marque blanche n'a pas de GTIN, est-ce un problème ?",
            a: "Non, si c'est la réalité : indique qu'il n'a pas d'identifiant produit. N'invente jamais de GTIN et n'utilise pas celui d'un autre produit.",
          },
        ],
      },
      {
        id: "5.5",
        title: "Surveiller la revue et les diagnostics",
        why: "La revue initiale prend de quelques jours à plus d'une semaine. Ne modifie pas ton site dans tous les sens pendant ce temps.",
        steps: [
          "Consulte Merchant Center > Produits > Diagnostics et la page Présentation chaque jour.",
          "Traite chaque avertissement un par un.",
          "En cas de suspension pour « déclaration trompeuse » : ne demande pas immédiatement une revue. Repasse la checklist, corrige tout, attends 24–48 h, puis demande une revue. Les tentatives sont limitées.",
        ],
        deliverable: "Le compte approuvé, sans avertissement bloquant.",
        tool: "gmc",
        cost: "0 €",
        faq: [
          {
            q: "Mes produits sont « en attente » depuis plusieurs jours, est-ce normal ?",
            a: "Oui, la première revue peut prendre plusieurs jours, parfois plus d'une semaine. Évite de supprimer ou de recréer tes produits pendant ce temps : cela relance l'examen.",
          },
        ],
      },
    ],
  },
  {
    id: "m6",
    number: 6,
    title: "Lancement publicitaire Google Ads",
    summary: "Une campagne Shopping standard en CPC manuel : un contrôle total sur chaque euro dépensé.",
    tasks: [
      {
        id: "6.1",
        title: "Créer ton compte Google Ads en mode expert",
        why: "Le mode par défaut pousse vers des campagnes automatiques qui consomment vite un petit budget sans données.",
        steps: [
          "Sur ads.google.com, lors de la création, choisis « Passer en mode Expert » puis « Créer un compte sans campagne ».",
          "Renseigne la facturation avec la carte pro. La devise et le fuseau horaire sont définitifs : choisis bien.",
          "Vérifie si une offre de crédit publicitaire pour nouveaux annonceurs est proposée dans ton pays.",
        ],
        deliverable: "Un compte Google Ads vierge, facturation active.",
        cost: "0 € (tu paies au clic)",
        faq: [
          {
            q: "Pourquoi éviter les campagnes automatiques au début ?",
            a: "Elles ont besoin de données de conversion pour bien enchérir. Avec un petit budget et aucun historique, elles dépensent souvent sur des emplacements peu rentables sans que tu puisses voir les requêtes qui coûtent.",
          },
        ],
      },
      {
        id: "6.2",
        title: "Lier Merchant Center et installer le suivi des conversions",
        why: "Sans suivi des achats, tu pilotes à l'aveugle et tu ne peux pas savoir si une campagne est rentable.",
        steps: [
          "Dans l'app Google & YouTube de Shopify, connecte ton compte Google Ads. Le lien Merchant Center et le suivi des conversions sont alors configurés.",
          "Google Ads > Objectifs > Conversions : vérifie qu'une action « Achat » existe et qu'elle utilise la valeur de commande.",
          "Après ta prochaine commande test, vérifie qu'elle remonte (délai de quelques heures).",
        ],
        deliverable: "Une action « Achat » active, avec valeur.",
        cost: "0 €",
        faq: [
          {
            q: "Ma commande test n'apparaît pas dans les conversions, pourquoi ?",
            a: "Il faut souvent quelques heures. Vérifie aussi que tu n'avais pas de bloqueur de publicités et que tu avais accepté la bannière cookies lors de la commande test.",
          },
        ],
      },
      {
        id: "6.3",
        title: "Calculer ton budget et ton CPC de départ",
        why: "Le budget quotidien et l'enchère se déduisent de tes chiffres, pas d'une intuition.",
        steps: [
          "Ouvre le « Planificateur Google Ads ».",
          "Entre le budget publicitaire de ton premier mois (sur 1 000 € au total, vise environ 600 à 700 € de publicité) et le CPC estimé au 2.3.",
          "Note le budget quotidien, le nombre de clics attendus et ta règle de coupe.",
        ],
        deliverable: "Budget quotidien, CPC max de départ, règle de coupe.",
        tool: "ads",
        cost: "0 €",
        faq: [
          {
            q: "Quel budget quotidien minimum ?",
            a: "Assez pour obtenir plusieurs dizaines de clics par semaine, sinon les données arrivent trop lentement pour décider. Le planificateur calcule ce chiffre à partir de ton CPC.",
          },
        ],
      },
      {
        id: "6.4",
        title: "Lancer ta campagne Shopping standard",
        why: "En Shopping standard avec CPC manuel, tu contrôles l'enchère par produit et tu vois les vraies requêtes : c'est l'idéal pour apprendre avec un petit budget.",
        steps: [
          "Nouvelle campagne > Ventes > Shopping > Campagne Shopping standard (pas Performance Max pour l'instant).",
          "Pays de vente : ton marché principal. Ajoute la Belgique, le Luxembourg et la Suisse seulement si ta livraison et tes politiques les couvrent.",
          "Stratégie d'enchères : CPC manuel. Budget quotidien : celui du planificateur.",
          "Réseaux : décoche le réseau Display et les partenaires du Réseau de Recherche.",
          "Crée un groupe de produits par produit et règle l'enchère au CPC max calculé.",
        ],
        deliverable: "Campagne active.",
        cost: "Budget quotidien défini au 6.3",
        faq: [
          {
            q: "Pourquoi décocher les partenaires du Réseau de Recherche ?",
            a: "Ce sont des sites tiers dont le trafic convertit souvent moins bien. Une fois rentable sur Google, tu pourras les tester à part.",
          },
        ],
      },
      {
        id: "6.5",
        title: "Ajouter les mots-clés négatifs de base",
        why: "Sans négatifs, tu paies des clics de gens qui cherchent une notice, un produit d'occasion ou une location.",
        steps: [
          "Campagne > Mots-clés > Mots-clés à exclure.",
          "Ajoute au minimum : gratuit, occasion, leboncoin, location, louer, notice, pdf, tuto, réparation, pièce détachée, pas cher, emploi.",
          "Ajoute les noms des marques concurrentes que tu ne vends pas.",
        ],
        deliverable: "Liste de mots-clés négatifs appliquée.",
        tool: "titles",
        cost: "0 €",
        faq: [
          {
            q: "Comment trouver d'autres mots-clés négatifs ?",
            a: "Le rapport des termes de recherche (tâche 7.1) montre les requêtes réelles qui ont déclenché tes annonces. Exclus chaque terme sans intention d'achat. L'outil « Titres Shopping » propose une liste de départ à copier.",
          },
        ],
      },
      {
        id: "6.6",
        title: "Appliquer ta règle de coupe pendant 7 jours",
        why: "La pire erreur des débutants : couper trop tôt ou trop tard. La règle chiffrée retire l'émotion de la décision.",
        steps: [
          "Ne touche à rien pendant 3 jours, sauf pour un problème technique.",
          "Si un produit dépense 2 × ton CPA max sans aucune vente : baisse son enchère de 30 % ou mets-le en pause.",
          "Si tu as des ventes avec un ROAS supérieur à ton ROAS de rentabilité : ne change rien.",
          "Consigne chaque jour tes dépenses, clics, ventes et ROAS dans les notes de cette tâche.",
        ],
        deliverable: "7 jours de données et une décision : continuer, ajuster ou changer de produit.",
        tool: "ads",
        cost: "Budget publicitaire",
        faq: [
          {
            q: "J'ai des ventes, mais un ROAS juste sous le seuil : je coupe ?",
            a: "Pas tout de suite. Exclus les termes de recherche non pertinents, baisse l'enchère des produits les moins rentables et améliore la fiche produit, puis réévalue après 7 jours de plus.",
          },
        ],
      },
    ],
  },
  {
    id: "m7",
    number: 7,
    title: "Scaling, optimisation & positionnement GEO",
    summary: "Augmenter ce qui marche, couper ce qui ne marche pas, et devenir la réponse recommandée par les assistants IA.",
    tasks: [
      {
        id: "7.1",
        title: "Analyser le rapport des termes de recherche",
        why: "C'est l'or du Shopping standard : tu découvres les requêtes qui vendent et celles qui brûlent ton budget.",
        steps: [
          "Tous les 2–3 jours : Campagne > Insights et rapports > Termes de recherche.",
          "Exclus chaque terme non pertinent.",
          "Repère les termes qui convertissent : ils serviront à tes titres de flux et à une campagne Search.",
        ],
        deliverable: "Une liste de négatifs à jour et les termes gagnants notés.",
        cost: "0 €",
        faq: [
          {
            q: "À quelle fréquence regarder les termes de recherche ?",
            a: "Tous les 2 à 3 jours au début, puis une fois par semaine quand la liste de négatifs est stable.",
          },
        ],
      },
      {
        id: "7.2",
        title: "Ajuster les enchères par produit, appareil et pays",
        why: "Ton budget doit aller là où le ROAS est le meilleur.",
        steps: [
          "Augmente de 10 à 20 % l'enchère des produits dont le ROAS dépasse nettement ton ROAS de rentabilité.",
          "Compare mobile et ordinateur. Le high-ticket convertit souvent mieux sur ordinateur : ajuste les enchères par appareil.",
          "Fais la même analyse pays par pays.",
          "Augmente le budget quotidien par paliers de 20 % maximum, pas plus d'une fois tous les 3 jours.",
        ],
        deliverable: "Des enchères ajustées et un budget augmenté prudemment.",
        cost: "Budget publicitaire",
        faq: [
          {
            q: "Pourquoi augmenter le budget par petits paliers ?",
            a: "Une hausse brutale perturbe l'équilibre des enchères et peut faire grimper le coût par vente. Des paliers de 20 % maximum permettent de vérifier que la rentabilité tient.",
          },
        ],
      },
      {
        id: "7.3",
        title: "Passer aux enchères automatiques au bon moment",
        why: "Les stratégies automatiques (ROAS cible, Performance Max) ont besoin d'un historique de conversions pour bien fonctionner.",
        steps: [
          "Attends un historique de conversions suffisant (on cite souvent 15 à 30 conversions sur 30 jours).",
          "Teste alors une campagne à ROAS cible, réglé au niveau du ROAS réel observé, à côté de la campagne manuelle et sans la couper.",
          "Compare sur 2 semaines, puis garde la meilleure.",
        ],
        deliverable: "Une décision documentée : enchères manuelles ou automatiques.",
        cost: "Budget publicitaire",
        faq: [
          {
            q: "Performance Max peut-il concurrencer ma campagne Shopping ?",
            a: "Oui, les deux campagnes peuvent se disputer les mêmes produits. Teste Performance Max sur un groupe de produits distinct ou sur une période limitée, et compare le résultat global, pas campagne par campagne.",
          },
        ],
      },
      {
        id: "7.4",
        title: "Collecter de vrais avis clients",
        why: "Les étoiles sur Google Shopping augmentent le taux de clic, et les avis rassurent sur la fiche produit.",
        steps: [
          "Envoie automatiquement une demande d'avis quelques jours après la livraison.",
          "Active le programme d'avis clients de Google ou un service d'avis vérifiés compatible avec Google.",
          "Réponds à chaque avis, y compris les négatifs, factuellement.",
        ],
        deliverable: "Un flux d'avis automatisé.",
        cost: "0 € au départ",
        faq: [
          {
            q: "Combien d'avis faut-il pour afficher les étoiles sur Shopping ?",
            a: "Google exige un nombre minimum d'avis sur l'ensemble de ton catalogue avant d'afficher les étoiles. Ce seuil évolue : vérifie-le dans l'aide Merchant Center, rubrique « avis sur les produits ».",
          },
        ],
      },
      {
        id: "7.5",
        title: "Te positionner pour les assistants IA (GEO)",
        why: "De plus en plus d'acheteurs demandent « quel est le meilleur [produit] ? » à ChatGPT, Gemini ou Claude. Aucune méthode ne garantit d'être cité, mais un contenu clair, factuel et cohérent augmente les chances.",
        steps: [
          "Publie un guide d'achat honnête (« Comment choisir son [produit] ») avec des critères objectifs, des tableaux comparatifs et des chiffres vérifiables.",
          "Ajoute une FAQ détaillée et des données structurées (Product, FAQ) : Shopify et ton thème en gèrent une partie.",
          "Garde des informations de marque identiques partout : site, Merchant Center, réseaux, annuaires.",
          "Obtiens des mentions sur des sites tiers (tests, comparatifs, forums) : les IA s'appuient sur des sources multiples.",
          "Teste tous les mois les questions de ta niche dans plusieurs assistants et note si ta marque apparaît.",
        ],
        deliverable: "Un guide d'achat publié et un suivi mensuel de ta visibilité IA.",
        cost: "0 €",
        faq: [
          {
            q: "Peut-on payer pour être recommandé par les assistants IA ?",
            a: "Aucune méthode ne garantit une recommandation spontanée. Méfie-toi des offres qui le promettent. Ce qui aide vraiment : un contenu utile et factuel, et des mentions sur des sites indépendants.",
          },
        ],
      },
      {
        id: "7.6",
        title: "Augmenter la valeur par client",
        why: "Une fois l'acquisition rentable, chaque euro de panier moyen en plus est du profit pur.",
        steps: [
          "Ajoute des accessoires ou un pack (bundle) sur la fiche produit.",
          "Propose une extension de garantie ou une installation en option si c'est pertinent.",
          "Lance un 2ᵉ produit complémentaire de la même niche, en repassant par le Module 2.",
        ],
        deliverable: "Un upsell actif et un 2ᵉ produit en préparation.",
        cost: "Selon le produit",
        faq: [
          {
            q: "Quand élargir à d'autres pays ?",
            a: "Une fois ton premier marché rentable, et un pays à la fois : chaque pays implique livraison, retours, langue et parfois TVA différents.",
          },
        ],
      },
    ],
  },
];

export function visibleTasks(module: Module, profile: Profile): Task[] {
  return module.tasks.filter((t) => !t.showIf || t.showIf(profile));
}

export function allVisibleTasks(profile: Profile): { module: Module; task: Task }[] {
  return MODULES.flatMap((module) => visibleTasks(module, profile).map((task) => ({ module, task })));
}
