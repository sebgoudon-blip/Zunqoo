# HighTicket Pilot

Plateforme de coaching pas-à-pas pour lancer une boutique e-commerce
high-ticket sur Shopify, avec Google Shopping comme canal d'acquisition.

## Statut : mode cloud verrouillé

Tant que le lancement n'est pas validé, **rien ne peut générer de coût** :

- aucun projet Firebase n'est relié, aucune clé (Claude, Shopify) n'est
  configurée, et rien n'est déployé ;
- `CLOUD_LAUNCHED = false` dans `src/lib/cloudConfig.ts` : l'app reste en mode
  local, même si un fichier `.env.local` est présent. Personne ne peut créer
  de compte, ni appeler l'IA ou Shopify ;
- les fonctions HighTicket ne sont pas exportées par
  `firebase/functions/src/index.ts` : un déploiement des fonctions de
  Zunqoo ne les met pas en ligne.

Pour lancer : suivre « Mise en route » ci-dessous, retirer le commentaire
de l'export dans `firebase/functions/src/index.ts`, puis passer
`CLOUD_LAUNCHED` à `true`. Avant d'ouvrir au public, mettre en place :

- des alertes de budget Google Cloud ;
- App Check sur les fonctions ;
- une limite de dépense mensuelle sur la clé Claude, dans la console
  Claude.

## Fonctionnalités

- **Parcours guidé en 7 modules** (`src/content/modules.ts`) : une
  micro-tâche à la fois, à valider par « Oui » ou « Sauter », et adaptée au
  profil de l'utilisateur.
- **Outils** (`src/tools/`) :
  - score produit ;
  - calculateur de rentabilité ;
  - planificateur Google Ads ;
  - générateur de pages légales, téléchargeable en un seul fichier HTML ;
  - checklist Merchant Center ;
  - titres Shopping (contrôle de longueur, mentions promotionnelles,
    majuscules) et mots-clés négatifs Google Ads.
- **FAQ sur chaque tâche**, et **sauvegarde/restauration** de toute la
  progression dans un fichier JSON (page Profil).
- **Ressources** (`src/content/resources.ts`), pré-remplies avec le profil
  et copiables en un clic :
  - exemples de niches high-ticket ;
  - requêtes à tester ;
  - grille d'analyse de la concurrence ;
  - modèles de messages aux fournisseurs (FR/EN) et relance ;
  - tableau comparatif des fournisseurs ;
  - checklist de l'échantillon ;
  - bloc livraison et retours ;
  - réglages Shopify et choix du nom de marque ;
  - structure de fiche produit et galerie photos ;
  - page « À propos » et commande test ;
  - configuration livraison/retours Merchant Center ;
  - exemples de titres et problèmes fréquents des Diagnostics ;
  - structure de campagne Shopping ;
  - routine hebdomadaire, email de demande d'avis, plan de guide d'achat
    et idées d'upsell.
- **Suivi quotidien Google Ads** (tâche 6.6 et page Outils) : saisie des
  chiffres du jour, avec CPC, ROAS et règle de coupe calculés à partir du
  CPA max du calculateur.
- **Carnet de notes** (`/carnet`) : toutes les notes du parcours, avec
  recherche, modification, export Markdown et lien vers chaque tâche
  (`/parcours?tache=2.3`).
- **Comptes et synchronisation** : connexion par Google ou par
  email/mot de passe. La progression, les notes et les outils sont
  synchronisés en temps réel entre appareils (`src/lib/cloudSync.ts`). Ce
  qui a été fait avant la connexion est conservé, et la déconnexion vide
  l'appareil.
- **Assistant IA** : le bouton « J'ai une question » ouvre un chat avec
  Claude, qui répond en tenant compte de la tâche en cours et du profil.
  Quota : 30 questions par jour et par utilisateur.
- **Pages légales renforcées** :
  - contrôle des champs (SIREN/SIRET, TVA, email, URL, médiateur…) ;
  - relecture par l'IA, qui signale les oublis, les incohérences et les
    points sensibles pour Merchant Center (5 par jour) ;
  - publication en un clic dans les politiques Shopify.

  Ce ne sont toujours pas des conseils juridiques : l'app recommande une
  relecture par un professionnel.
- **Connexion Shopify** (OAuth) et **audit de conformité Merchant Center** :
  - 38 contrôles (identité, domaine, politiques, produits, tunnel d'achat),
    un score sur 100 et des points classés bloquant / important / conseil,
    avec pour chacun le pourquoi, la correction et la règle Google ;
  - rapport exportable en HTML, exemple sur une boutique fictive
    (`/boutique?exemple`) ;
  - l'audit coche aussi une partie de la checklist Merchant Center ;
  - corrections en un clic (titres, texte provisoire, page Contact) avec
    aperçu avant/après, confirmation et annulation :
    [`docs/phase2/README.md`](../../docs/phase2/README.md).

  Droits demandés par défaut, en lecture seule : `read_products`,
  `read_content`, `read_legal_policies`. Les droits `write_products`,
  `write_online_store_pages` et `write_legal_policies` ne sont demandés que
  si le marchand autorise les corrections. Les jetons restent côté serveur. Détails, sources et limites :
  [`docs/phase1/README.md`](../../docs/phase1/README.md).

Sans configuration Firebase (ou tant que le verrou est actif), l'app fonctionne en **mode local** : pas de
compte, d'IA ni de Shopify, et la progression est enregistrée dans le
navigateur.

## Architecture

```
apps/high-ticket/          App React (Vite)
firebase/functions/src/highTicket/
  ai.ts                    htpAskCoach, htpReviewLegal (Claude)
  shopify.ts               htpShopifyStart / Callback / Audit / PublishLegal / Disconnect
  collect.ts               lecture de la boutique pour l'audit (lecture seule)
  corrections.ts           htpFixPreview / Apply / Undo / History (corrections en un clic)
  audit/                   règles et score, en TypeScript pur (partagé avec l'app)
firestore.rules            htpUsers (propriétaire seul), htpShops, htpOAuthStates,
                           htpUsage (serveur seul)
```

## Mise en route

### 1. Firebase

Le projet Firebase est le même que celui du reste du dépôt (forfait Blaze
requis pour les Cloud Functions).

1. Console Firebase > Authentication : activez les fournisseurs **Google**
   et **Adresse e-mail/Mot de passe**.
2. Ajoutez une application Web, puis copiez sa configuration :
   `cp apps/high-ticket/.env.example apps/high-ticket/.env.local`, et
   remplissez le fichier.
3. Créez un site Hosting dédié, par exemple `hightiket` :
   `firebase hosting:sites:create hightiket`.

### 2. Clé API Claude

Créez une clé sur [platform.claude.com](https://platform.claude.com), puis :

```bash
firebase functions:secrets:set ANTHROPIC_API_KEY
```

Modèle utilisé : `claude-opus-5-5`, avec un effort faible pour le chat et
moyen pour la relecture. Le repli automatique en cas de refus du modèle est
activé (`fallbacks: "default"`). Le quota quotidien limite les coûts. Pour
le changer, modifiez `DAILY_QUESTIONS` et `DAILY_LEGAL_REVIEWS` dans
`ai.ts`.

### 3. App Shopify

1. Sur le [Dev Dashboard Shopify](https://dev.shopify.com), créez une app
   (distribution publique, ou personnalisée pour vos propres boutiques).
2. URL de redirection : `https://<votre-site>.web.app/api/shopify/callback`.
3. Accès demandés : `read_products`, `read_content`, `read_legal_policies`
   et, en option, `write_products`, `write_online_store_pages`,
   `write_legal_policies`.
4. Enregistrez les identifiants et l'URL de l'app :

```bash
firebase functions:secrets:set SHOPIFY_CLIENT_ID
firebase functions:secrets:set SHOPIFY_CLIENT_SECRET
echo "HTP_APP_URL=https://<votre-site>.web.app" >> firebase/functions/.env
```

Les jetons Shopify sont des jetons hors-ligne à durée limitée, renouvelés
automatiquement (`expiring=1`).

### 4. Déploiement

```bash
npm install
npm run build:functions
firebase deploy --only firestore:rules,functions
npm run build:high-ticket
firebase deploy --config apps/high-ticket/firebase.json --only hosting:hightiket
```

Le fichier `apps/high-ticket/firebase.json` redirige
`/api/shopify/callback` vers la fonction `htpShopifyCallback`, sur le même
domaine que l'app.

## Développement local

```bash
npm run dev:high-ticket      # mode local, sans Firebase
npm run test:high-ticket     # tests unitaires (calculs, contrôles, pages légales, sauvegarde, rapport)
npm run test:functions       # moteur d'audit et lecture Shopify
npm run test:e2e             # émulateurs Firebase + faux Shopify (Java requis)
```

Le SDK Firebase n'est chargé qu'à la demande : en mode local, il n'est
jamais téléchargé.

Pour tester le mode cloud avec les émulateurs (auth, Firestore,
functions) :

1. Mettez `VITE_USE_EMULATORS=true` et un projet `demo-…` dans
   `.env.local`.
2. Créez `firebase/functions/.secret.local` avec les trois secrets.
3. Ajoutez `HTP_APP_URL` dans `firebase/functions/.env.local`.
4. Lancez :

```bash
firebase emulators:start --only auth,firestore,functions --project demo-htp
```
