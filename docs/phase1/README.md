# Phase 1 – Audit gratuit de conformité

État : construit et testé **en local uniquement**. Rien n'est déployé, les
verrous sont en place (`CLOUD_LAUNCHED = false`, fonctions HighTicket non
exportées en production).

## Ce que fait l'audit

1. Le marchand connecte sa boutique. **Accès en lecture seule** :
   `read_products`, `read_content`, `read_legal_policies`.
2. La fonction `htpShopifyAudit` lit la boutique : informations de la boutique,
   politiques, pages, zones de livraison, et jusqu'à 250 produits actifs
   (les plus récemment modifiés).
3. Le moteur `firebase/functions/src/highTicket/audit/` applique 38 contrôles et
   calcule un score sur 100.
4. L'app affiche le rapport : points classés bloquant / important / conseil,
   avec pour chacun le constat, les éléments concernés (liens vers l'admin
   Shopify), pourquoi Google peut le sanctionner, comment corriger, et la page
   officielle Google de référence. Le rapport s'exporte en un fichier HTML
   (à imprimer en PDF depuis le navigateur).

Exemple sans compte ni Shopify : `npm run dev:high-ticket`, puis
`/boutique?exemple` (boutique fictive).

## Score

On part de 100 et on retire 15 points par point bloquant, 6 par point important
et 2 par conseil. Tant qu'il reste un point bloquant, le score ne dépasse pas
59. Les points « à vérifier à la main » ne comptent pas.

## Sécurité et coûts

- Quotas : 10 audits par jour et par utilisateur, et 20 par jour et par
  boutique (`DAILY_AUDITS_PER_USER`, `DAILY_AUDITS_PER_SHOP` dans `shopify.ts`).
  Un audit qui échoue n'est pas décompté.
- Le droit d'écrire les politiques (`write_legal_policies`) n'est demandé que
  si le marchand clique sur « Autoriser la publication ». Le serveur refuse la
  publication si la boutique est connectée en lecture seule.
- Les journaux ne contiennent ni données de la boutique ni jetons, seulement le
  message d'erreur.
- L'audit n'appelle pas l'IA : il ne coûte que des appels Cloud Functions et
  Firestore.

## Contrôles et sources

Le centre d'aide Google n'est pas accessible depuis l'environnement de
développement. Les règles ont été vérifiées à partir des extraits des pages
officielles renvoyés par une recherche web, et non en lisant chaque page en
entier. Avant le lancement, il faut relire chaque page citée.

Légende de la colonne « Base » :

- **Google** : exigence confirmée dans un extrait de la page Google citée.
- **Interprétation** : déduite d'une règle Google générale (par exemple
  « présentation trompeuse ») ; le seuil ou la détection est notre choix.
- **Bonne pratique** : pas une exigence Google, mais un signal de confiance
  courant.

| Contrôle | Gravité | Base | Source |
|---|---|---|---|
| Email de contact renseigné | bloquant | Google (au moins un moyen de contact) | [Consignes](https://support.google.com/merchants/answer/6363310) |
| Téléphone renseigné | conseil | Bonne pratique | [Consignes](https://support.google.com/merchants/answer/6363310) |
| Adresse complète | bloquant | Interprétation | [Présentation trompeuse](https://support.google.com/merchants/answer/6150127) |
| Coordonnées visibles sur la boutique | bloquant | Google | [Consignes](https://support.google.com/merchants/answer/6363310) |
| Coordonnées identiques partout | important | Interprétation | [Présentation trompeuse](https://support.google.com/merchants/answer/6150127) |
| Adresse identique au profil | important | Interprétation | [Présentation trompeuse](https://support.google.com/merchants/answer/6150127) |
| HTTPS actif | bloquant | Google | [Consignes](https://support.google.com/merchants/answer/6363310) |
| Boutique sans mot de passe | bloquant | Interprétation (site inaccessible) | [Consignes](https://support.google.com/merchants/answer/6363310) |
| Nom de domaine propre | important | Bonne pratique | [Consignes](https://support.google.com/merchants/answer/6363310) |
| Politique de retour publiée | bloquant | Google | [Consignes](https://support.google.com/merchants/answer/6363310) |
| Politique d'expédition publiée | bloquant | Interprétation | [Consignes](https://support.google.com/merchants/answer/6363310) |
| CGV publiées | important | Google (conditions de facturation) | [Consignes](https://support.google.com/merchants/answer/6363310) |
| Politique de confidentialité | important | Bonne pratique / RGPD | [Consignes](https://support.google.com/merchants/answer/6363310) |
| Mentions légales | important | Obligation française, pas Google | [Consignes](https://support.google.com/merchants/answer/6363310) |
| Politiques entièrement remplies | bloquant | Interprétation | [Présentation trompeuse](https://support.google.com/merchants/answer/6150127) |
| Politiques détaillées (≥ 400 caractères) | important | Interprétation (seuil arbitraire) | [Consignes](https://support.google.com/merchants/answer/6363310) |
| Délai de retour indiqué | important | Interprétation | [Consignes](https://support.google.com/merchants/answer/6363310) |
| Délais de livraison indiqués | important | Interprétation | [Consignes](https://support.google.com/merchants/answer/6363310) |
| Délais de retour cohérents CGV / retours | important | Interprétation | [Présentation trompeuse](https://support.google.com/merchants/answer/6150127) |
| Produits actifs | bloquant | Interprétation | [Consignes](https://support.google.com/merchants/answer/6363310) |
| Aucun contenu de test (« produit de test », « lorem ipsum »…) | bloquant | Interprétation | [Présentation trompeuse](https://support.google.com/merchants/answer/6150127) |
| Image principale | bloquant | Google (`image_link` obligatoire) | [Spécification](https://support.google.com/merchants/answer/7052112) |
| Description présente | bloquant | À revérifier | [Spécification](https://support.google.com/merchants/answer/7052112) |
| Description détaillée (≥ 150 caractères) | conseil | Bonne pratique | [Spécification](https://support.google.com/merchants/answer/7052112) |
| Aucun prix à 0 | bloquant | Interprétation | [Spécification](https://support.google.com/merchants/answer/7052112) |
| Prix barrés crédibles (remise ≥ 50 % signalée) | important | Interprétation (seuil arbitraire ; Google : remise entre 5 % et 90 %) | [Prix soldés](https://support.google.com/merchants/answer/9017019) |
| Pas de promotion permanente (≥ 80 % du catalogue) | important | Interprétation (seuil arbitraire) | [Présentation trompeuse](https://support.google.com/merchants/answer/6150127) |
| Produits actifs en stock | conseil | Interprétation | [Spécification](https://support.google.com/merchants/answer/7052112) |
| Codes-barres valides | important | Google (GTIN de 8, 12, 13 ou 14 chiffres avec clé de contrôle) | [Spécification](https://support.google.com/merchants/answer/7052112) |
| GTIN renseigné | conseil | Google (fortement recommandé s'il existe) | [Spécification](https://support.google.com/merchants/answer/7052112) |
| Titres sans promotion | important | À revérifier | [Spécification](https://support.google.com/merchants/answer/7052112) |
| Titres ≤ 150 caractères | important | Google | [Spécification](https://support.google.com/merchants/answer/7052112) |
| Titres sans majuscules abusives | conseil | À revérifier | [Spécification](https://support.google.com/merchants/answer/7052112) |
| Allégations de santé | important | Interprétation (liste de mots) | [Règles Shopping](https://support.google.com/merchants/answer/6149970) |
| Imitation de marque (réplique, dupe…) | bloquant | Google (contrefaçon interdite) | [Règles Shopping](https://support.google.com/merchants/answer/6149970) |
| Marques tierces citées | conseil | Interprétation (liste de marques) | [Règles Shopping](https://support.google.com/merchants/answer/6149970) |
| Zones de livraison configurées | bloquant | Interprétation | [Consignes](https://support.google.com/merchants/answer/6363310) |
| Moyen de paiement classique | bloquant, **à vérifier à la main** | Google | [Consignes](https://support.google.com/merchants/answer/6363310) |

## Politiques publiées comme pages

Beaucoup de boutiques publient leurs CGV, retours ou mentions légales comme
pages (Boutique en ligne > Pages) plutôt que dans Paramètres > Politiques.
Google regarde le site, pas l'emplacement dans Shopify : une page publiée dont
le titre ou l'adresse correspond (par exemple « cgv », « retours »,
« mentions-legales ») compte comme la politique. Les contrôles de contenu
(champs à compléter, délais, cohérence) portent aussi sur ces pages.

## Test sur une vraie boutique (26 octobre 2026)

Les requêtes de l'audit ont été exécutées en lecture seule sur la boutique
connectée à la session de développement. Elles ont toutes abouti. Ce test a
conduit à deux corrections : la prise en compte des politiques publiées comme
pages, et le contrôle des textes provisoires dans les produits.

Attention : la connexion utilisée pour ce test n'est pas celle de l'app. Ses
droits peuvent être plus larges que `read_products`, `read_content` et
`read_legal_policies`. Il reste donc à vérifier, avec l'app elle-même, que ces
trois droits suffisent.

## Limites connues

- **Paiements :** l'API Shopify ne donne pas les moyens de paiement actifs avec
  un accès en lecture seule. Ce point reste « à vérifier à la main ».
- **Zones de livraison :** la documentation Shopify n'indique pas clairement
  l'accès exigé pour `countriesInShippingZones`. S'il est refusé, le point
  passe en « à vérifier à la main ». À tester sur une boutique de
  développement.
- **Pages :** la lecture des pages (`pages`) suppose l'accès `read_content` ;
  à confirmer sur une boutique de développement.
- **Images :** l'audit vérifie qu'une image existe, pas son contenu (fond,
  texte, filigrane).
- **Catalogue :** au-delà de 250 produits actifs, seuls les 250 plus récemment
  modifiés sont analysés. Le rapport l'indique.
- **Détections par mots :** la santé, les imitations et les marques sont
  repérées par listes de mots. Il peut y avoir des faux positifs et des oublis.
- **App Check :** les émulateurs indiquent `app: MISSING`. App Check fait partie
  de la checklist de protection à mettre en place avant le lancement.

## Tests

```bash
npm run test:functions    # moteur d'audit et lecture Shopify (38 tests)
npm run test:high-ticket  # app, dont le rapport et son export (40 tests)
npm run test:e2e          # émulateurs Firebase + faux Shopify (9 tests)
```

`npm run test:e2e` utilise une configuration séparée (`firebase.e2e.json`,
projet `demo-htp`) qui n'est jamais déployée. Il génère des secrets factices et
remplace l'adresse de Shopify par un faux serveur local, uniquement quand le
code tourne dans l'émulateur (`FUNCTIONS_EMULATOR=true`).

Prérequis : Java (pour l'émulateur Firestore). Le Firebase CLI est installé
comme dépendance de développement ; il n'a besoin d'aucun compte pour les
émulateurs.
