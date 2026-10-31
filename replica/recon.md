# Recon map : Builblox (web) → version Fortnite / UEFN

Scope : le cœur du produit (une phrase → un plan → une île construite dans UEFN), plus les outils qui l'entourent : miniatures, modèles 3D, stats d'îles, idées.
Pour : produit à vendre aux créateurs Fortnite francophones, puis anglophones.
Date : 2026-10-31

> Recon en salle blanche : uniquement des pages publiques lues une par une. Ni code, ni requêtes réseau, ni espace connecté de Builblox (`/workspace` demande un login, non consulté). Ce document décrit ce que fait le produit avec nos propres mots.

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | landing | https://www.builblox.com/ | pitch, étapes, avis, FAQ |
| 2 | docs | https://www.builblox.com/docs | parcours de démarrage en 5 étapes |
| 3 | tarifs | https://www.builblox.com/tarifs | 3 formules, ce que chacune débloque |
| 4 | FAQ | https://www.builblox.com/faq | crédits, modèles, confidentialité du place |
| 5 | plugin Studio | https://www.builblox.com/roblox-studio-ia | fonctionnement du pont éditeur |
| 6 | miniatures | https://www.builblox.com/miniature-roblox-ia | studio de vignettes |
| 7 | 3D | https://www.builblox.com/modeles-3d-roblox-ia | texte/image → FBX/GLB |
| 8 | TrackBlox | https://www.builblox.com/trackblox-statistiques-jeux-roblox | stats, Idées, Analyse |
| 9 | affiliés | https://www.builblox.com/affiliate | programme créateurs vidéo |
| 10 | Epic : UEFN MCP (doc) | https://dev.epicgames.com/documentation/fortnite/uefn-mcp?lang=en-US | **le pont officiel côté Fortnite** |
| 11 | Epic : annonce MCP | https://www.fortnite.com/news/unreal-mcp-is-now-available-in-uefn | 20/08/2026, bêta |
| 12 | Epic : Data API | https://dev.epicgames.com/documentation/fortnite/using-fortnite-data-api-in-fortnite?lang=en-US | métriques publiques des îles |
| 13 | Data API (live) | https://api.fortnite.com/ecosystem/v1/islands | testé : renvoie bien des îles UEFN de créateurs (code, créateur, titre, tags) |

## Core loop

Le créateur décrit son île en une phrase. L'IA propose un plan, le créateur le valide, puis l'IA écrit le Verse, place et règle les devices et construit l'UI directement dans son projet UEFN.

## Traduction Roblox → Fortnite

| Builblox (Roblox) | Version Fortnite |
| --- | --- |
| Plugin Creator Store dans Roblox Studio | **Pont desktop** (Windows) qui relaie vers l'**UEFN MCP officiel** (`http://127.0.0.1:8000/mcp`) |
| Luau | Verse (lecture, écriture, compilation) |
| Parts, services (ServerScriptService, StarterGui…) | Devices Creative, entités Scene Graph, UI UMG |
| Play dans Studio | Session Play-in-Client lancée par le MCP, log client relu |
| Robux / DevEx | Engagement payouts du programme créateurs Epic |
| TrackBlox (relevés « maison ») | **Fortnite Data API** officielle et publique |
| Miniature Roblox | Miniature d'île 16:9 (dimensions exactes à vérifier dans la doc Epic) |
| Login Roblox | Login Epic (Epic Account Services, OAuth officiel) |

Point clé : sur Roblox, Builblox doit publier son propre plugin. Côté Fortnite, Epic fournit déjà le serveur MCP dans l'éditeur. Il suffit de construire le pont entre le site et ce MCP local, et c'est moins de travail.

## Screens

| ID | screen | route / accès | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Landing | `/` | convaincre, CTA inscription | hero + champ de prompt, vitrine d'îles, 3 étapes, avis, FAQ, footer | filled |
| S02 | Inscription / connexion | `/signup`, `/login` | créer un compte | e-mail, Google, Epic | empty, error |
| S03 | Accueil connecté | `/workspace` | hub des outils | sidebar (Créer, Miniatures, 3D, Stats, Idées), projets récents, solde | empty, filled |
| S04 | Atelier « Créer une île » | `/workspace/build/:project` | cœur du produit | chat, sélecteur de modèle, solde de crédits, carte de plan, bouton Construire, journal des opérations, diff à valider | empty, plan proposé, en construction, erreur de compilation, éditeur déconnecté |
| S05 | Connecter UEFN | menu avatar → « Connecter l'éditeur » | appairage | téléchargement du pont, code d'appairage, checklist (Python + MCP Toolsets activés), statut | non connecté, en attente, connecté, conflit (2 éditeurs) |
| S06 | Projets | `/workspace/projects` | liste et limite par formule | cartes projet, compteur x/5 | empty, filled, limite atteinte |
| S07 | Studio de miniatures | `/workspace/thumbnails` | vignettes d'île | prompt, upload d'image, grille de variantes, télécharger | empty, génération, filled |
| S08 | Studio 3D | `/workspace/models` | objets 3D | prompt/image, choix du style (cartoon, low poly, réaliste, pixel), visionneuse 3D, export FBX/GLB, fil d'itération | verrouillé (Starter), génération, filled |
| S09 | Stats d'îles | `/workspace/stats` | trouver un créneau | tableau des îles, filtres par tag, courbes CCU, vue par genre | chargement, filled, limité (Starter) |
| S10 | Idées d'îles | `/workspace/ideas` | concepts tirés des tendances | cartes d'idées → « Envoyer au constructeur » | verrouillé, filled |
| S11 | Analyse d'idée | `/workspace/analyze` | noter une idée | champ d'idée, score, forces, risques, recommandations | verrouillé, résultat |
| S12 | Méthode virale | `/workspace/guide` | guide pas à pas | chapitres | verrouillé, filled |
| S13 | Tarifs | `/tarifs` | vendre | 3 cartes, bascule mensuel/annuel, FAQ | — |
| S14 | Compte et facturation | menu avatar | abonnement, clé API, résiliation | portail Stripe, champ clé API (Pro), solde | — |
| S15 | Parrainage | menu avatar | croissance | lien perso, compteur | empty, filled |
| S16 | Docs | `/docs` | démarrage | étapes illustrées, FAQ | — |
| S17 | Support | `/support` | contact | formulaire | envoyé |
| S18 | Programme créateurs | `/affiliate` | recruter des vidéastes | chiffres, étapes, candidature | — |
| S19 | Pages légales | `/terms`, `/privacy`, `/conditions-of-sale`, `/refund`, `/cancellation`, `/ip` | conformité | texte | — |
| S20 | Pages SEO | `/creer-une-ile-fortnite-avec-ia`, etc. | acquisition | article + CTA | — |

## Flows

```
F01 Nouveau créateur → première île construite
    S01 -> S02 -> S03 -> S05 (télécharger le pont, activer le MCP dans UEFN, coller le code) -> S04
    happy path : ~9 clics + 2 réglages dans UEFN (chez Builblox, environ 4 minutes annoncées)
    edge : UEFN non lancé, MCP Toolsets non activés, port 8000 déjà pris, deux éditeurs ouverts,
           pont lancé hors du dossier du projet

F02 Construire une île depuis une phrase
    S04 prompt -> plan en étapes -> (modifier le plan) -> Construire -> journal live -> compile Verse
        -> erreurs ? boucle de correction -> session de test -> log client OK
    happy path : 2 clics après le prompt
    edge : erreur de compilation persistante, crédits épuisés en cours de route, éditeur figé
           (hitching connu du MCP), coordonnées LUF ↔ XYZ mal converties

F03 Modifier une île existante
    S04 « ajoute une boutique » -> l'IA lit les fichiers Verse et les devices -> diff -> Accepter / Refuser
    edge : refus (rien ne change), conflit avec une modif manuelle faite entre-temps

F04 Miniature
    S07 prompt ou capture -> variantes -> retouche -> télécharger -> (le créateur l'importe lui-même dans le Creator Portal)

F05 Objet 3D
    S08 prompt/image + style -> visionneuse -> « plus grand » -> export FBX -> import dans UEFN (manuel, ou via le MCP si possible)

F06 Choisir un créneau
    S09 filtre par tag -> S10 idée -> « Envoyer au constructeur » -> S04 prérempli
    ou S11 note mon idée -> S04

F07 S'abonner / changer de formule / résilier
    S13 -> Stripe Checkout -> S14 ; résiliation en 1 clic dans S14
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Button | primary, secondary, ghost, danger | default, hover, focus, disabled, loading | partout |
| Sidebar outils | collapsed, expanded | item actif, item verrouillé (cadenas + badge Pro) | S03–S12 |
| Champ de prompt | hero (landing), chat (atelier) | vide, saisie, envoi, désactivé (pas de crédits) | S01, S04, S07, S08, S11 |
| Carte de plan | — | proposé, modifié, validé, en cours, terminé, échoué | S04 |
| Journal des opérations | — | en direct, terminé, erreur | S04 |
| Diff de changement | fichier Verse, device, entité | en attente, accepté, refusé | S04 |
| Badge de connexion éditeur | — | déconnecté, en attente, connecté, conflit | S03–S05 |
| Compteur de crédits | — | normal, bas, épuisé | header, S04 |
| Sélecteur de modèle | — | verrouillé selon la formule | S04 |
| Carte projet / île | — | vignette, sans vignette | S03, S06 |
| Grille de variantes | — | génération (skeleton), prête | S07, S08 |
| Visionneuse 3D | — | chargement, rotation | S08 |
| Tableau de stats + sparkline | — | chargement, filled, tronqué (formule) | S09 |
| Carte tarif | standard, mise en avant | mensuel, annuel | S01, S13 |
| Accordéon FAQ | — | ouvert, fermé | S01, S13, S16 |
| Toast | succès, erreur, info | — | partout |
| Modale d'upsell | — | — | quand une fonction est verrouillée |

## Inferred data model

```
User         id, email, auth_provider (email|google|epic), plan (free|starter|pro|studio),
             billing_period (month|year), credits_balance, bonus_credits (n'expirent pas),
             own_api_key (chiffrée, Pro+), referral_code, referred_by
             evidence: tarifs, docs étape 1, FAQ   confidence: high

Project      id, user_id, name, kind (island|thumbnail|model3d), created_at, thumbnail_url
             evidence: limite de projets par formule, « chaque projet garde ses miniatures »
             confidence: medium (on ne sait pas si miniatures et 3D comptent dans la limite)

Message      id, project_id, role (user|assistant), content, model, credits_spent
             evidence: chat de l'atelier, choix du modèle   confidence: high

BuildPlan    id, project_id, steps[] {title, status}, status (proposed|approved|running|done|failed)
             evidence: docs étape 4   confidence: high

Operation    id, plan_id, step, type (write_verse|compile|place_device|edit_props|create_entity|
             build_ui|start_session), payload json, status, error
             evidence: « liste des opérations à faire… JSON », journal en direct   confidence: medium

EditorLink   id, user_id, pairing_code, status, last_seen_at, machine_name
             evidence: code d'appairage, « un seul Studio à la fois »   confidence: high

CreditLedger id, user_id, delta, reason (monthly_grant|purchase|build|thumbnail|model3d|
             referral|social_bonus), created_at
             evidence: FAQ crédits   confidence: medium

Thumbnail    id, project_id, prompt, source_image_url, image_url, parent_id
Model3D      id, project_id, prompt, style, glb_url, fbx_url, parent_id
             evidence: pages miniatures / 3D (versions conservées)   confidence: high

IslandStat   island_code, title, creator_code, tags[], ts, peak_ccu, unique_players,
             plays, minutes_played, favorites, recommends, retention_d1, retention_d7
             evidence: Fortnite Data API (source 12-13)   confidence: high

Idea         id, user_id, title, pitch, tags[], source_trend, score, strengths, risks
             evidence: pages Idées / Analyse   confidence: medium
```

Relations : User 1-n Project, Project 1-n Message, Project 1-n BuildPlan, BuildPlan 1-n Operation, User 1-1 EditorLink actif, User 1-n CreditLedger, Project 1-n Thumbnail / Model3D.

## Feature matrix

Voir `features.csv` (47 lignes). Must : 21, should : 14, could : 10, skip : 2 (+ 2 lignes marketing passées en `skip` côté clone).

## Out of scope (ne se clone pas ou ne doit pas l'être)

- **Le nom Fortnite et la marque Epic dans le nom du produit.** « Fortnite » et « UEFN » sont des marques d'Epic Games : on peut dire « pour Fortnite », mais pas l'utiliser comme nom ni comme logo. À vérifier dans les règles de marque d'Epic à l'étape replica-brand (**à lancer**).
- **Les avis et la vitrine de jeux** affichant des revenus mensuels : ce sont leurs témoignages et des chiffres impossibles à vérifier. Tu n'afficheras que les vrais avis de tes propres utilisateurs.
- **La communauté** (Discord, TikTok à 28 K abonnés, programme d'affiliés en cours) : elle se construit, elle ne se copie pas.
- **Le modèle IA « maison »** : on s'appuie sur des modèles du marché via leurs API officielles.
- **Toute fonction que le MCP d'UEFN n'expose pas encore.** Le MCP est en bêta : pas d'édition de terrain ni de publication automatique. Publier l'île et poser la miniature dans le Creator Portal restent des gestes manuels du créateur.

## Size

20 écrans, 7 parcours, 10 entités.

Les trois parties difficiles :
1. **Le pont desktop** entre le site et le MCP local d'UEFN : appairage, reconnexion, sécurité (n'accepter que des appels venant de ton serveur), signature du binaire Windows.
2. **La boucle agent fiable** : plan, puis Verse, puis compilation, correction et test, sur un MCP en bêta qui fige parfois l'éditeur et a un souci de coordonnées LUF ↔ XYZ.
3. **La facturation au crédit** : coût réel par appel de modèle, stocké dans un registre de crédits, avec Stripe et les clés API personnelles (BYOK).

Le reste est classique : miniatures et 3D via des API de génération, stats via l'API publique d'Epic avec cache et respect de la limite de requêtes.

**Taille : L** (un trimestre) pour le tout. La tranche verticale (S02, S04, S05 avec construction d'une île simple) est plutôt **M** (quelques semaines).

Prochaine étape : `/replica-architect`.
