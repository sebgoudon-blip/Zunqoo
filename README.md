# Zunqoo

Application de file d'attente pour foodtrucks et vendeurs événementiels. Le
client commande et paie au comptoir comme d'habitude, puis suit sa commande
sur son téléphone et reçoit une notification quand elle est prête — plus
besoin de faire la queue.

Ce dépôt contient les trois interfaces décrites dans le cahier des charges,
plus le backend Firebase qui les relie :

```
apps/
  mobile/   App cliente (Expo / React Native, Android + iOS)
  web/      Interface caisse (/caisse) + écran d'affichage (/display)
firebase/
  functions/        Cloud Functions (création atomique des numéros, push FCM)
firestore.rules      Règles de sécurité Firestore
firestore.indexes.json
```

## Modèle de données

Le produit est multi-vendeur dès la conception : chaque foodtruck a son
propre espace de données, pour ne jamais mélanger les numéros de deux
commerçants qui utilisent Zunqoo au même moment.

```
vendors/{vendorId}                          { name }
vendors/{vendorId}/sessions/{dayKey}        { counter, updatedAt }
vendors/{vendorId}/orders/{orderId}         { number, status, dayKey, source,
                                               fcmToken, createdAt,
                                               preparingAt, readyAt,
                                               deliveredAt }
```

- `dayKey` (`YYYY-MM-DD`, fuseau Europe/Paris) identifie la journée
  d'événement. Le compteur `sessions/{dayKey}.counter` repart implicitement
  de 1 à chaque nouveau jour — pas d'action manuelle de remise à zéro
  nécessaire.
- Les numéros n'augmentent jamais en arrière : une commande "Délivrée"
  garde son numéro, qui n'est jamais réattribué le même jour.
- `status` suit `waiting → preparing → ready → delivered`, appliqué par la
  Cloud Function côté serveur pour la création, et par l'interface caisse
  (avec règles Firestore qui n'autorisent que les transitions valides) pour
  la suite.

## QR code générique par vendeur

Le cahier des charges demande un système générique : un seul QR code par
vendeur, valable pour tous ses événements, sans reconfiguration à chaque
festival. Le QR encode donc uniquement l'identifiant du vendeur, jamais un
événement ou une commande précise :

```
https://app.zunqoo.com/scan?v=cocorico
```

(ou un lien profond `zunqoo://scan?v=cocorico` si vous préférez ouvrir
directement l'app sans passer par une page web intermédiaire). Le vendeur
imprime ce code une fois et le réutilise à chaque événement.

## Mise en route

### 1. Projet Firebase

1. Créez un projet sur [console.firebase.google.com](https://console.firebase.google.com).
2. Passez au forfait **Blaze** (nécessaire pour les Cloud Functions et FCM).
3. Activez **Firestore** (mode production) et **Cloud Messaging**.
4. Ajoutez une application Web au projet ; copiez la config dans
   `apps/web/.env.local` et `apps/mobile/.env` (voir les fichiers
   `.env.example` correspondants).
5. Mettez à jour `.firebaserc` avec l'ID de votre projet.
6. Créez au moins un document vendeur dans la console Firestore, par
   exemple `vendors/cocorico` avec un champ `name: "Cocorico Rôtisserie"`.
   La création de vendeurs n'a volontairement pas d'interface libre-service
   pour ce MVP (voir "Non prioritaire" ci-dessous).

### 2. Backend (règles + Cloud Functions)

```bash
npm install
npm run build:functions
firebase deploy --only firestore:rules,firestore:indexes,functions
```

### 3. Interface caisse & écran d'affichage (web)

```bash
cp apps/web/.env.example apps/web/.env.local   # puis remplir
npm run dev:web
```

- `/caisse` : interface tablette pour la préparation.
- `/display` : écran à brancher sur une TV/tablette visible des clients.

Au premier lancement sur chaque appareil, un code vendeur (ex. `cocorico`)
est demandé une fois et mémorisé localement — ou passez-le directement en
URL (`/caisse?v=cocorico`, pratique pour épingler un favori sur la TV ou la
tablette caisse).

Déploiement : `npm run build:web && firebase deploy --only hosting`.

### 4. App cliente (mobile)

```bash
cd apps/mobile
cp .env.example .env   # puis remplir
npm install
npx expo start
```

**Important pour les notifications push :** le cahier des charges demande
Firebase Cloud Messaging plutôt que le service de notification propre à
Expo. Cela nécessite un token d'appareil natif, indisponible dans
l'app Expo Go — il faut donc un **build dev client ou EAS** :

- Android : téléchargez `google-services.json` depuis la console Firebase
  et placez-le dans `apps/mobile/`.
- iOS : nécessite un compte développeur Apple, une clé APNs configurée dans
  la console Firebase (Cloud Messaging > iOS app configuration), et un
  build via `eas build` (les notifications natives ne fonctionnent pas dans
  le simulateur iOS).

Sans ce build natif, l'app fonctionne normalement (scan, suivi temps réel)
mais sans notification push — l'écran d'affichage du foodtruck reste le
filet de sécurité prévu par le cahier des charges pour ce cas.

## Fonctionnement hors-ligne

Le réseau est souvent saturé sur les gros événements. Les trois interfaces
s'appuient sur le cache local de Firestore (persistance IndexedDB côté web,
cache natif côté mobile) pour continuer à afficher les dernières données
connues et se resynchroniser automatiquement à la reconnexion :

- **Caisse** : indicateur "En ligne / Hors ligne / Synchronisation…" ;
  la création de commande est retentée automatiquement au retour du réseau.
- **App cliente** : la création de commande après scan retente
  automatiquement avec un backoff croissant, avec un état visible "en
  attente de synchronisation" ; le suivi de commande continue d'afficher
  le dernier statut connu depuis le cache.

## Non prioritaire pour ce MVP

Conformément au cahier des charges, ne sont pas implémentés : paiement in-app,
menu/commande à distance, comptes utilisateurs, statistiques/historique,
multi-événements avec QR codes différents, et une interface libre-service de
création de vendeurs (les vendeurs sont provisionnés manuellement via la
console Firebase pour l'instant).
