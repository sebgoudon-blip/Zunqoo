# HighTicket Pilot

Plateforme de coaching pas-à-pas pour lancer une boutique e-commerce
high-ticket sur Shopify, avec Google Shopping comme canal d'acquisition.

## Ce que fait la V1

- **Parcours guidé en 7 modules** (`src/content/modules.ts`) : légal et
  domiciliation, recherche produit, sourcing, boutique Shopify, Google
  Merchant Center, lancement Google Ads, puis scaling et GEO. Une seule
  micro-tâche s'affiche à la fois. L'utilisateur répond « Oui », « Sauter »
  ou « J'ai une question » (FAQ et notes de la tâche). Les tâches suivantes
  restent verrouillées tant que la tâche en cours n'est pas traitée.
- **Parcours adapté au profil** : par exemple, la tâche « Créer ta
  structure » n'apparaît que sans société, et la TVA suisse remplace la TVA
  UE pour la Suisse.
- **Outils intégrés** (`src/tools/`) :
  - un score produit high-ticket sur 100 ;
  - un calculateur de rentabilité (marge, CPA max, ROAS de rentabilité) ;
  - un générateur de pages légales pré-rempli depuis le profil ;
  - une checklist de conformité Merchant Center ;
  - un planificateur Google Ads (budget quotidien, projection, règle de
    coupe).

Il n'y a pas encore de compte utilisateur : le profil et la progression
sont enregistrés dans le navigateur (`localStorage`), et chaque utilisateur
retrouve son parcours sur son appareil.

## Lancer en local

```bash
npm install
npm run dev:high-ticket     # http://localhost:5173
npm run build:high-ticket
```

## Feuille de route

1. **Comptes et sauvegarde dans le cloud** : Firebase Auth et Firestore
   (déjà utilisés dans ce dépôt), pour retrouver sa progression sur
   n'importe quel appareil.
2. **Connexion Shopify** : app Shopify (OAuth, Admin GraphQL API) pour :
   - créer le produit et les pages légales directement dans la boutique ;
   - publier les politiques ;
   - vérifier automatiquement une partie de la checklist Merchant Center
     (domaine, pages présentes, mot de passe retiré).
3. **Assistant IA** sur le bouton « J'ai une question » et génération des
   fiches produit et des titres de flux Shopping.
4. **Monétisation** : abonnement Stripe, une fois l'usage validé.
