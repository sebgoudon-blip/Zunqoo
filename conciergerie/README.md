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

Les deux formulaires (contact + popup « Estimer mes revenus ») sont envoyés
par `send.php` à **contact@drome-ardeche.fr**. Ce script utilise PHP, inclus
dans l'hébergement LWS : rien d'autre à configurer. L'adresse de réception se
change en haut de `send.php`. La boîte mail doit exister chez LWS pour
recevoir les messages.

Un champ invisible bloque les robots, et l'adresse du visiteur est mise en
« Répondre à » : il suffit de cliquer sur Répondre dans votre messagerie.

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
