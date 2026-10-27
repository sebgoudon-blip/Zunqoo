# Site vitrine — Conciergerie Drôme Ardèche (drome-ardeche.fr)

Site statique (HTML / CSS / JS, aucune dépendance). Ouvrez `index.html` dans
un navigateur ou déposez le dossier sur n'importe quel hébergeur (Netlify,
Vercel, OVH, Firebase Hosting…).

## Personnaliser

| Quoi | Où |
|---|---|
| Nom, téléphone, e-mail, WhatsApp, lien de RDV, envoi des formulaires | `config.js` |
| Logements (titre, ville, voyageurs, m², photos, lien de réservation) | `script.js` → `PROPERTIES` |
| Avis clients | `script.js` → `REVIEWS` |
| Couleurs | `styles.css` → variables `:root` (`--primary`, `--accent`…) |
| Textes « À propos », fondateurs, FAQ, offre | `index.html` (les passages `[À personnaliser]`) |
| Photos | dossier `images/`, puis référencez-les dans `PROPERTIES` |

⚠️ Les avis fournis sont des **exemples** : remplacez-les par de vrais avis
avant la mise en ligne.

## Formulaires

Sans `formEndpoint`, les formulaires (contact + popup « Estimer mes revenus »)
affichent « Merci ! » sans rien envoyer. Pour recevoir les demandes par
e-mail, créez un formulaire gratuit sur [Formspree](https://formspree.io) et
collez son URL dans `config.js`.

## Fonctionnalités

- En-tête fixe qui se teinte au scroll, menu burger mobile, lien actif selon la section
- Popup « Estimer mes revenus » avec validation
- Bandeau défilant des plateformes
- Services en onglets avec rotation automatique et barre de progression
- Étapes en cartes empilées au scroll
- Cartes fondateurs qui se retournent
- Carrousel de logements avec mini-galerie photo (flèches, points, swipe)
- Avis en défilement infini sur deux lignes
- FAQ en accordéon, compteurs animés, apparitions au scroll
- Bouton WhatsApp flottant, retour en haut
- Responsive et respect de « réduire les animations »
