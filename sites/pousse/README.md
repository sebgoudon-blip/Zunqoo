# Pousse

Landing page (`index.html`) + espace de prospection réel (`app.html`) qui :

1. cherche les entreprises d'un métier dans une ville via **Google Places API (New)** ;
2. ne garde que celles **sans vrai site web** (un simple Facebook/Instagram compte comme « pas de site ») ;
3. retrouve le **gérant** dans le registre officiel (API Recherche d'entreprises, data.gouv, gratuite) ;
4. calcule un **score de potentiel** (nombre d'avis + note) ;
5. génère un **brief de site** avec Claude, à partir des vraies infos (horaires et avis récupérés à la demande).

Le suivi des prospects (statuts) et la dernière recherche sont gardés dans le navigateur ; l'export CSV
reprend tout.

```
index.html        Landing page (démo simulée)
app.html          Outil réel (appelle /api/*)
api/scan.js       POST /api/scan  { city, trade, withManagers }
api/brief.js      POST /api/brief { business, style }
api/_lib.js       Helpers partagés (non exposé comme route)
dev-server.js     Serveur local pour tester sans Vercel
```

## 1. Les clés

| Variable | Où l'obtenir |
|---|---|
| `GOOGLE_PLACES_API_KEY` | console.cloud.google.com → créer un projet → **APIs & Services → Bibliothèque → « Places API (New) » → Activer** → **Identifiants → Créer une clé API**. Un compte de facturation est obligatoire (même pour le quota gratuit). Conseillé : restreindre la clé à « Places API (New) ». |
| `ANTHROPIC_API_KEY` | console.anthropic.com → **API Keys** (créditer le compte de quelques euros). |
| `POUSSE_ACCESS_CODE` | Un mot de passe de votre choix. Il est demandé à l'ouverture de `app.html` pour que personne d'autre ne consomme vos crédits. |

## 2. Mettre en ligne sur Vercel

1. vercel.com → **Add New → Project** → importer le dépôt GitHub `Zunqoo`.
2. **Root Directory** : `sites/pousse`. Framework preset : *Other*. Pas de commande de build.
3. **Environment Variables** : ajouter les trois variables ci-dessus.
4. **Deploy**, puis ouvrir `https://<votre-projet>.vercel.app/app.html`.

## 3. Ou tester en local

```bash
cd sites/pousse
cp .env.example .env      # puis remplir les trois valeurs
npm install
npm run dev               # → http://localhost:3000/app.html
```

## Coûts à surveiller

- **Google** : une recherche = jusqu'à 3 requêtes Text Search (60 résultats max). Les champs téléphone et
  site web sont dans la tranche tarifaire la plus chère de Places ; chaque « Générer le brief » ajoute une
  requête Place Details. Google offre un quota gratuit mensuel par tranche : vérifiez la grille actuelle sur
  la page tarifs de Google Maps Platform et posez une alerte de budget dans Google Cloud.
- **Claude** : un brief ≈ quelques milliers de tokens avec `claude-opus-5-5`, soit quelques centimes.
  Le repli automatique de modèle (`fallbacks: "default"`) est activé : si un modèle refuse une demande,
  l'API la relance sur un autre modèle.
- **data.gouv** : gratuit (limite ~7 requêtes/seconde, respectée par le code).

## Limites connues

- Google renvoie au maximum 60 résultats par recherche : pour couvrir toute une grande ville, lancer
  plusieurs recherches (par quartier ou par métier plus précis : « plombier chauffagiste », etc.).
- Le gérant vient du registre officiel : il est fiable quand le nom commercial correspond, sinon il est
  marqué « à vérifier ».
- Les conditions de Google Maps Platform interdisent de stocker durablement leurs données (sauf
  l'identifiant de fiche) : c'est acceptable pour des tests, à revoir avant de vendre l'outil.
