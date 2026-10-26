# Phase 2 – Corrections et surveillance

La phase est découpée en trois étapes, chacune validée avant la suivante :

| Étape | Contenu | État |
|---|---|---|
| 2a | Corrections en un clic, avec aperçu, confirmation et annulation | Construite et testée en local |
| 2b | Audit automatique chaque semaine et alerte par email | À faire (service d'email à choisir, avec votre accord sur le coût) |
| 2c | App Shopify publiable sur l'App Store | À faire (compte Shopify Partner nécessaire, avec votre accord) |

## 2a – Corrections en un clic

### Ce qui peut être corrigé

| Point de l'audit | Correction proposée | Le marchand peut modifier ? |
|---|---|---|
| Titres avec mention promotionnelle, majuscules abusives ou plus de 150 caractères | Titre nettoyé | Oui, chaque titre avant d'appliquer |
| Texte provisoire dans les produits (« Produit de test — contenu provisoire. ») | Phrases provisoires retirées, reste de la description inchangé | Non : seule la proposition calculée par le serveur est acceptée |
| Pas de coordonnées visibles | Page Contact créée (ou remplie si elle est vide) avec les coordonnées de Paramètres > Général | Non : le contenu est recalculé par le serveur |
| Politiques absentes ou incomplètes | Lien vers le générateur de pages légales, qui publiait déjà les politiques | Oui, dans le générateur |

L'adresse de la boutique (par exemple un code postal faux) ne peut pas être
corrigée par l'API : elle reste une correction manuelle.

### Garde-fous

1. **Aperçu d'abord.** `htpFixPreview` lit les valeurs actuelles et propose une
   correction, sans rien modifier. Il fonctionne aussi en lecture seule.
2. **Confirmation.** Rien n'est écrit sans un clic sur « Appliquer » et une
   confirmation.
3. **Pas d'écrasement.** `htpFixApply` relit Shopify juste avant d'écrire. Si la
   valeur a changé depuis l'aperçu, la correction est refusée.
4. **Annulation.** Chaque correction est enregistrée avec la valeur d'avant
   (collection `htpChanges`, inaccessible au navigateur). `htpFixUndo` rétablit
   l'ancienne valeur si personne ne l'a modifiée depuis. Une page Contact créée
   par l'app est dépubliée, pas supprimée.
5. **Accès séparés.** La connexion par défaut reste en lecture seule. Les droits
   d'écriture (`write_products`, `write_online_store_pages`,
   `write_legal_policies`) ne sont demandés que si le marchand clique sur
   « Autoriser les corrections dans Shopify ». Pour les pages,
   `write_online_store_pages` est plus restreint que `write_content`, qui donne
   aussi accès aux blogs.
6. **Quota.** Au maximum 100 corrections par jour et par utilisateur, et 50
   par envoi. Les corrections qui échouent ne sont pas décomptées.

### Tests

- `npm run test:functions` : propositions de correction (titres, texte
  provisoire, page Contact) et règles d'audit, 46 tests.
- `npm run test:high-ticket` : app, dont les corrections du rapport d'exemple,
  42 tests.
- `npm run test:e2e` : 14 tests dans les émulateurs, dont :
  - aperçu en lecture seule, application refusée ;
  - titre modifié par le marchand, puis annulé ;
  - refus d'écraser une valeur changée depuis l'aperçu ;
  - refus d'une description modifiée par le navigateur ;
  - page Contact créée avec le contenu du serveur, puis dépubliée à l'annulation ;
  - journal des corrections illisible depuis le navigateur.

### À vérifier sur une vraie boutique

Les mutations `productUpdate`, `pageCreate` et `pageUpdate` et leurs droits ont
été vérifiés dans le schéma et la documentation Shopify (version 2026-10), mais
pas encore exécutés sur une vraie boutique. Les tests utilisent un faux Shopify.
