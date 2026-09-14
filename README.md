# Avis Facile

SaaS d'automatisation de la collecte d'avis Google pour commercants locaux :
recolte du telephone en caisse, SMS de demande d'avis differe, code promo
automatique a la confirmation, module de prospection de leads, et abonnement
via Stripe.

## Stack

- **Next.js 14** (App Router) + TypeScript + Tailwind CSS
- **Prisma** + SQLite en local (facilement migrable vers Postgres en prod)
- **Stripe Billing** pour les abonnements (checkout + portail + webhook)
- **Twilio** (API REST, sans SDK) pour les SMS — simule en console si non configure
- **Resend** (API REST, sans SDK) pour les emails — simule en console si non configure
- **Google Places API** pour la recherche de leads — donnees simulees si non configure

## Demarrage rapide

```bash
npm install
cp .env.example .env      # puis completer les variables si besoin
npm run db:push           # cree la base SQLite locale (prisma/dev.db)
npm run db:seed           # cree un compte commercant de demo
npm run dev
```

L'app est disponible sur http://localhost:3000.

Compte commercant de demo (cree par `db:seed`) :
- email : `demo@avisfacile.fr`
- mot de passe : `motdepasse123`

Espace super-admin (prospection de leads) : http://localhost:3000/super-admin/connexion
avec le mot de passe defini dans `SUPER_ADMIN_PASSWORD`.

## Architecture / parcours

- `/` — page de vente (funnel) : accroche, solution en 3 etapes, preuve sociale,
  offre de lancement avec compte a rebours, appel a l'action.
- `/inscription`, `/connexion` — creation de compte commercant (+ session Stripe
  Checkout si Stripe est configure) et connexion.
- `/dashboard/*` — espace commercant : ajout de clients (numero recolte en
  caisse), suivi des statuts, parametres (lien avis Google, delai d'envoi),
  facturation (portail Stripe).
- `/avis/[token]` — page publique envoyee par SMS au client final pour laisser
  son avis Google puis confirmer.
- `/merci/[code]` — page affichant le code promo genere a la confirmation.
- `/super-admin/*` — espace interne a l'operateur de la plateforme : recherche
  de leads (commerces) par zone geographique, envoi automatique d'un message
  de prospection, tableau de suivi des statuts.

## Taches planifiees

L'envoi differe des SMS de demande d'avis n'est pas declenche par un cron
integre a Next.js (qui n'a pas de scheduler natif). Deux options :

1. **Service de cron externe** (recommande en prod, ex: Vercel Cron, cron-job.org) :
   appeler toutes les 5-15 minutes :
   ```
   GET /api/cron/envoyer-demandes-avis
   Authorization: Bearer <CRON_SECRET>
   ```
2. **En local / sur un serveur avec crontab** :
   ```bash
   npm run cron:envoyer-avis
   ```

## Variables d'environnement

Voir `.env.example` pour la liste complete et les commentaires. Points clefs :

- Sans cle Twilio/Resend/Google Places configuree, ces integrations tournent
  en mode simule (log console) : l'app est utilisable de bout en bout sans
  aucun compte externe pour la demo/dev.
- `DATABASE_URL` pointe vers SQLite par defaut ; passer a une URL Postgres en
  production (changer aussi `provider` dans `prisma/schema.prisma`).
- `JWT_SECRET` et `SUPER_ADMIN_PASSWORD` doivent etre changes en production.

## Conformite RGPD (module prospection)

Le module super-admin envoie des messages de prospection B2B (aux commerces,
pas a des consommateurs) : chaque SMS/email rappelle la possibilite de se
desinscrire ("STOP"). Le modele `Lead` porte un champ `optOut` : un lead
marque comme desinscrit n'est plus recontacte par une nouvelle recherche.
Avant un envoi en volume reel, verifier aupres d'un conseil juridique le
respect complet de la reglementation francaise sur la prospection commerciale
(RGPD, code des postes et communications electroniques, mentions legales).

## Stripe

1. Creer deux Prix (Price) recurrents mensuels dans le Dashboard Stripe :
   19€ (offre de lancement) et 39€ (standard), et renseigner leurs IDs dans
   `STRIPE_PRICE_ID_LANCEMENT` / `STRIPE_PRICE_ID_STANDARD`.
2. Renseigner `STRIPE_SECRET_KEY`.
3. Creer un endpoint webhook Stripe pointant vers `/api/stripe/webhook`,
   ecoutant au minimum : `checkout.session.completed`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.payment_failed`. Renseigner `STRIPE_WEBHOOK_SECRET`.

## Securite / dependances

`npm audit` signale 2 advisories sur `next@14.2.35` (dont un RCE via
l'API d'optimisation d'image AVIF, et une faille du postcss interne a Next
utilise par son pipeline de build). Ce projet n'utilise pas `next/image`, ce
qui limite l'exposition a la premiere. Le correctif complet necessite un
passage a Next 16 (breaking change) : a planifier separement, avec les tests
de non-regression associes, plutot que dans ce build initial.

## Prochaines etapes suggerees

- Migrer vers Next.js 16 pour corriger completement les advisories `npm audit`.
- Passer la base de donnees en Postgres pour la production.
- Ajouter des tests automatises (parcours d'inscription, confirmation d'avis).
- Ajouter une reelle gestion des templates de messages (personnalisation par
  commercant).
- Ajouter la verification du numero de telephone (format E.164) a la saisie.
