# HighTicket Pilot

Plateforme de coaching pas-à-pas pour lancer une boutique e-commerce
high-ticket sur Shopify, avec Google Shopping comme canal d'acquisition.

## Fonctionnalités

- **Parcours guidé en 7 modules** (`src/content/modules.ts`) : une
  micro-tâche à la fois, à valider par « Oui » ou « Sauter », et adaptée au
  profil de l'utilisateur.
- **Outils** (`src/tools/`) :
  - score produit ;
  - calculateur de rentabilité ;
  - planificateur Google Ads ;
  - générateur de pages légales ;
  - checklist Merchant Center.
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
- **Connexion Shopify** (OAuth) :
  - audit automatique de la boutique (domaine, HTTPS, mot de passe,
    politiques, produits, adresse) ;
  - l'audit coche automatiquement 8 points de la checklist Merchant Center.

  Droits demandés : `read_products`, `read_content`,
  `write_legal_policies`. Les jetons restent côté serveur.

Sans configuration Firebase, l'app fonctionne en **mode local** : pas de
compte, d'IA ni de Shopify, et la progression est enregistrée dans le
navigateur.

## Architecture

```
apps/high-ticket/          App React (Vite)
firebase/functions/src/highTicket/
  ai.ts                    htpAskCoach, htpReviewLegal (Claude)
  shopify.ts               htpShopifyStart / Callback / Audit / PublishLegal / Disconnect
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
3. Accès demandés : `read_products`, `read_content`,
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
```

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
