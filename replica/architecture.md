# Architecture : générateur d'îles Fortnite par IA (reconstruction des fonctions de Builblox)

Nom de travail : **« le produit »**. Le vrai nom sera choisi à l'étape replica-brand, et il ne contiendra ni « Fortnite » ni « Epic ».

## Vue d'ensemble

```
 Navigateur (Next.js)                    Serveur                            PC du créateur (Windows)
 ┌──────────────────┐   HTTPS   ┌───────────────────────┐   WSS sortant   ┌──────────────────────────┐
 │ Atelier, stats,  │──────────▶│ Next.js sur Vercel    │                 │ Pont (app Tauri, tray)   │
 │ miniatures, 3D   │           │  routes API, Stripe   │                 │  ▲ code d'appairage      │
 │                  │◀─Realtime─│ Supabase (Postgres,   │                 │  │                       │
 └──────────────────┘           │  Auth, Storage, RT)   │                 │  ▼ HTTP local            │
                                │           ▲           │                 │ UEFN MCP officiel        │
                                │           │           │◀────────────────│ http://127.0.0.1:8000/mcp│
                                │ Worker Node (Fly.io)  │  le pont ouvre  │ (Verse, devices, Scene   │
                                │  boucle agent Claude, │  la connexion,  │  Graph, UMG, sessions)   │
                                │  relais WSS des ponts │  jamais l'inverse└──────────────────────────┘
                                └───────────────────────┘
```

Principe : **le pont ne fait que relayer.** C'est lui qui ouvre la connexion WebSocket sortante vers le worker (aucun port ouvert sur le PC). Il reçoit des appels d'outils MCP, les transmet à l'UEFN MCP local et renvoie les résultats. Toute l'intelligence (plan, appels au modèle, crédits, validation) vit côté serveur. C'est l'équivalent du plugin Builblox, qui « n'échange que des instructions JSON ».

## Stack

| couche | choix | pourquoi |
| --- | --- | --- |
| web | Next.js (App Router) + TypeScript | standard, SSR pour les pages SEO, routes API pour Stripe |
| style | Tailwind + tokens de replica-design | rapide, cohérent |
| base | Postgres sur Supabase | SQL pour le registre de crédits et les agrégats de stats ; RLS ; Realtime pour le journal en direct |
| auth | Supabase Auth (e-mail magic link, Google) ; Epic en OIDC personnalisé (should) | tout est géré ; Epic Account Services à brancher en fournisseur OIDC (support exact par Supabase **à vérifier**) |
| fichiers | Supabase Storage, buckets privés + URL signées | miniatures, GLB/FBX, images sources |
| paiements | Stripe Checkout + Billing + Customer Portal | abonnements mensuel/annuel, packs de crédits, résiliation en 1 clic |
| e-mail | Resend | transactionnel (bienvenue, reçu, crédits bas) |
| IA (construction) | API Claude officielle, avec tool use. Modèle par défaut rapide, modèles de pointe (ex. `claude-opus-5-5`) en Pro/Studio | les outils MCP d'UEFN sont convertis en définitions d'outils ; BYOK possible (clé Anthropic du client) |
| IA (images) | une API d'images officielle (ex. fal.ai, OpenAI Images, Google Imagen) derrière une interface `ImageProvider` | interchangeable ; choix final sur qualité et prix |
| IA (3D) | une API texte/image → 3D officielle (ex. Meshy, Tripo) qui exporte GLB **et** FBX, derrière `Model3DProvider` | l'import FBX dans UEFN est le chemin direct |
| stats | Fortnite Data API officielle, publique, sans authentification (`https://api.fortnite.com/ecosystem/v1`) | source officielle, respecter son rate limit |
| jobs | Inngest (ou Trigger.dev) appelé depuis Vercel ; cron Vercel pour les déclencheurs | génération async des miniatures et de la 3D, collecte des stats, remise à niveau des crédits |
| worker temps réel | un service Node sur Fly.io (1 petite machine, scalable) | Vercel ne garde pas de WebSocket ouverte longtemps ; la boucle agent peut durer plusieurs minutes |
| pont desktop | Tauri v2 (Windows, tray), logique en TypeScript | binaire léger, mises à jour auto signées ; UEFN n'existe que sur Windows |
| hébergement | Vercel (web) + Fly.io (worker) + Supabase | tout est managé et peu cher sans utilisateurs |
| monitoring | Sentry (web, worker, pont) + logs Fly | les bugs du pont se passent chez le client : il faut les voir |

Une seule base de données, et aucun microservice à part le worker, qui n'existe que pour les WebSockets et les tâches longues.

> Le dépôt actuel (Zunqoo) est sur Firebase. On aurait pu rester sur Firestore, mais le registre de crédits (transactions, verrous) et les agrégats de stats par tag sont beaucoup plus simples en SQL. À créer dans **un dépôt séparé**.

## Schema

Tables : **23**, détaillées dans `replica/schema.sql`. Accès : **RLS Supabase**. Le client lit ses propres lignes ; toutes les écritures sensibles (crédits, statut des opérations, liens éditeur, stats, abonnements) passent par le service role, côté routes serveur ou worker.

Le schéma a été validé sur un Postgres 16 local : il se charge sans erreur, le débit de crédits est atomique et idempotent, un débit est refusé si le solde est insuffisant, et la limite de projets par formule est appliquée par la base.

| groupe | tables |
| --- | --- |
| compte | `profiles`, `plan_limits`, `subscriptions`, `stripe_events` |
| crédits | `wallets` (dotation mensuelle + bonus + réservé), `credit_ledger`, fonction `spend_credits()`, `user_api_keys` |
| construction | `projects`, `messages`, `build_plans`, `operations` |
| pont | `editor_links`, `pairing_codes` |
| médias | `thumbnails`, `models_3d` |
| stats | `islands`, `island_metrics`, `tag_trends` |
| idées | `ideas` |
| croissance / support | `social_bonus_claims`, `referral_rewards`, `creator_applications`, `support_tickets` |

Contraintes dures, appliquées par la base et non par l'interface :
- **un seul éditeur actif par compte** : index unique partiel `one_active_editor` ;
- **un seul build en cours par projet** : `one_running_plan_per_project` ;
- **limite de projets par formule** : trigger `projects_limit` ;
- **pas de solde négatif** : `check (… >= 0)`, plus `select … for update` dans `spend_credits()` ;
- **un webhook Stripe n'est traité qu'une fois** : `stripe_events.id` en clé primaire, plus `credit_ledger.idempotency_key`.

## API

### F01 : inscription et connexion de l'éditeur

| method path | does | who | input | output |
| --- | --- | --- | --- | --- |
| Supabase Auth | inscription / connexion | public | e-mail, Google, (Epic) | session |
| `POST /api/editor/pairing-codes` | crée un code à 8 caractères, valable 10 min | connecté | — | `{code, expires_at}` |
| `POST /api/bridge/pair` | le pont échange le code contre un jeton longue durée | pont | `{code, machine_name, bridge_version}` | `{bridge_token, link_id}` (jeton affiché une seule fois, stocké hashé) |
| `WSS worker /bridge` | canal du pont (auth par `bridge_token`) | pont | voir protocole plus bas | — |
| `POST /api/editor/links/:id/activate` | choisit le PC qui reçoit les constructions | propriétaire | — | lien |
| `DELETE /api/editor/links/:id` | révoque un pont | propriétaire | — | 204 |

### F02 et F03 : construire, puis modifier

| method path | does | who | input | output |
| --- | --- | --- | --- | --- |
| `POST /api/projects` | crée un projet (limite en base) | connecté | `{kind, name}` | projet, ou 402 `project_limit_reached` |
| `POST /api/projects/:id/messages` | envoie un prompt. Le worker lit l'état de l'île (outils en **lecture seule**) puis répond ou propose un plan | propriétaire | `{content, model}` | `{message_id, plan_id?}` (le reste arrive en Realtime) |
| `PATCH /api/plans/:id` | modifie les étapes d'un plan proposé | propriétaire | `{steps}` | plan |
| `POST /api/plans/:id/approve` | lance la construction | propriétaire | — | 202 |
| `POST /api/plans/:id/cancel` | arrête après l'opération en cours | propriétaire | — | 202 |
| `POST /api/operations/:id/approve` / `reject` | accord sur une écriture (diff montré avant) | propriétaire | `{approve_all_in_step?: bool}` | 202 |
| `POST /api/operations/:id/undo` | rejoue `undo` (ancien contenu Verse, suppression du device créé) | propriétaire | — | 202 |
| `POST /api/projects/:id/session` | lance ou arrête une session de test, renvoie le log client | propriétaire | `{action: start\|stop}` | 202 |

### F04 et F05 : miniatures et 3D

| method path | does | who | input | output |
| --- | --- | --- | --- | --- |
| `POST /api/uploads` | URL signée d'upload (image source, 10 Mo max, png/jpg/webp) | connecté | `{kind}` | `{path, signed_url}` |
| `POST /api/thumbnails` | débit, puis job de génération (×N variantes) | connecté | `{project_id, prompt, source_image_path?, parent_id?, n}` | `{ids}` → Realtime |
| `GET /api/thumbnails/:id/download` | URL signée au format île | propriétaire | — | redirect |
| `POST /api/models3d` | Pro+, débit, puis job 3D | connecté | `{project_id, prompt?, source_image_path?, style, parent_id?}` | `{id}` |
| `GET /api/models3d/:id/download?format=fbx\|glb` | URL signée | propriétaire | — | redirect |

### F06 : stats, idées et analyse

| method path | does | who | input | output |
| --- | --- | --- | --- | --- |
| `GET /api/stats/islands` | liste triée et filtrée, tronquée selon `plan_limits.stats_island_cap` | connecté | `?tag&sort&cursor` | îles + dernières métriques |
| `GET /api/stats/islands/:code` | détail et courbe sur 7 jours | connecté | — | métriques |
| `GET /api/stats/tags` | tendances par tag | connecté | `?days=7` | `tag_trends` |
| `POST /api/ideas/generate` | Pro+, idées à partir de `tag_trends` et des îles en hausse | connecté | `{tags?, n}` | idées |
| `POST /api/ideas/analyze` | Pro+, note une idée face au catalogue | connecté | `{pitch}` | `{score, strengths, risks, recommendations, evidence}` |
| `POST /api/ideas/:id/send` | crée un projet île avec le prompt prérempli | propriétaire | — | projet |

### F07 : facturation et croissance

| method path | does | who | input | output |
| --- | --- | --- | --- | --- |
| `POST /api/billing/checkout` | Stripe Checkout (abonnement ou pack de crédits) | connecté | `{price_key}` | `{url}` |
| `POST /api/billing/portal` | Customer Portal (changer, résilier en 1 clic) | connecté | — | `{url}` |
| `PUT /api/me/api-key` / `DELETE` | BYOK Pro+, chiffrée, testée par un appel minimal avant enregistrement | connecté | `{key}` | `{last4}` |
| `POST /api/growth/social-bonus` | déclare un abonnement à un réseau (bonus une fois par réseau) | connecté | `{network, handle}` | wallet |
| `POST /api/support` | ticket et e-mail | public | `{email, subject, body}` | 201 |
| `POST /api/creators/apply` | candidature au programme créateurs | public | formulaire | 201 |

### Protocole du pont (WebSocket, JSON)

```
pont → worker  hello        {link_id, bridge_version, mcp_reachable, uefn_project, tools:[...]}   (tools = résultat de tools/list)
pont → worker  heartbeat    {mcp_reachable}                                   toutes les 15 s
worker → pont  call         {op_id, tool, args, timeout_ms}
pont → worker  result       {op_id, ok, content | error}
worker → pont  revoke       {}                                               le pont s'efface
```

Règles du pont :
1. Il n'appelle **que** `http://127.0.0.1:<port>/mcp` (port 8000 par défaut, réglable).
2. Il refuse tout outil absent du dernier `tools/list`.
3. Il n'exécute jamais de code reçu.
4. Il exécute les appels un par un : le MCP fait parfois figer l'éditeur.
5. Il affiche localement « en construction » et propose un bouton « Couper ».

### Boucle agent (worker)

1. Avec les **outils de lecture seule**, l'agent liste les fichiers Verse, lit les devices et les entités, puis produit un plan JSON. La partie lecture est facturée au tarif « chat ».
2. Après l'approbation, il exécute chaque étape : le modèle choisit ses appels d'outils. Chaque **écriture** devient une ligne `operations`, avec `preview` (diff) et `undo` (ancien contenu lu juste avant). Elle passe `awaiting_approval`, sauf si l'utilisateur a choisi « tout accepter pour cette étape ».
3. Après les écritures Verse, l'agent compile. En cas d'erreur, il réinjecte le log dans le modèle, avec **3 tentatives maximum par étape**, puis met l'étape en échec avec une explication.
4. En option, il lance une session, lit le log client et l'arrête.
5. Il réserve les crédits avant chaque appel au modèle (estimation), puis règle le montant réel à l'arrivée de l'usage de tokens. En BYOK, il ne débite rien et appelle avec la clé du client.

> **À vérifier sur un vrai UEFN avant de coder la boucle :** la liste exacte des outils exposés (`tools/list`) et leurs paramètres. Epic regroupe les outils en toolsets (Verse, entités, devices, sessions, UMG), mais leurs noms ne sont pas publiés dans la doc lue. La table `operations.tool` stocke le nom exact, sans le deviner. Il faut aussi savoir quels outils permettent de supprimer ou de restaurer un objet : c'est ce qui rend l'annulation possible pour les devices.

Webhooks entrants :
- Stripe : `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid` (dotation mensuelle, récompense de parrainage), `invoice.payment_failed`.
- Le fournisseur 3D ou images, si son API fonctionne par callback ; sinon on interroge le job.

Webhooks sortants : aucun.

Jobs :
| job | cadence | rôle |
| --- | --- | --- |
| `stats.discover` | 1×/jour | parcourt `GET /islands` (pagination par curseur) et met `islands` à jour |
| `stats.metrics.hot` | toutes les heures | métriques `1h` des ~2 000 îles les plus jouées (selon `latest_peak_ccu`) |
| `stats.metrics.daily` | 1×/jour | métriques `1d` de toutes les îles connues, étalées sur la journée selon le rate limit |
| `stats.tag_trends` | 1×/jour, après `daily` | recalcule `tag_trends` |
| `stats.prune` | 1×/semaine | supprime les métriques `10m`/`1h` de plus de 30 jours (garder `1d`) |
| `credits.monthly_grant` | sur `invoice.paid` | remet `monthly_balance` au niveau de la formule (pour l'annuel : cron mensuel à la date anniversaire) |
| `bridge.sweep` | toutes les minutes | passe `offline` les ponts sans heartbeat depuis 45 s |
| `pairing.cleanup` | toutes les heures | supprime les codes expirés |
| `media.timeout` | toutes les 10 min | marque `failed` et **rembourse** les jobs bloqués depuis plus de 15 min |

## The parts that bite

- **Le MCP d'UEFN est en bêta.** L'éditeur peut figer, les coordonnées LUF ↔ XYZ sont mal converties et les outils peuvent changer de nom d'une version à l'autre. Il faut donc :
  - un timeout par appel ;
  - des appels un par un ;
  - redécouvrir `tools/list` à chaque connexion ;
  - des positions converties par notre propre fonction testée, sans laisser le modèle faire ce calcul ;
  - des tests de non-régression sur un projet UEFN de référence à chaque mise à jour de Fortnite.
- **Sécurité du pont.** Le jeton est stocké dans le coffre d'identifiants Windows, et le serveur n'en garde que le hash. Le pont peut être révoqué depuis le site. La liste blanche d'outils s'appuie sur `tools/list`. Le binaire est signé (certificat de signature de code à acheter par toi), avec des mises à jour signées. Le sandboxing des fichiers Verse vient d'Epic, mais on ne compte pas que dessus.
- **Idempotence.** Les webhooks Stripe peuvent arriver deux fois, d'où `stripe_events` et `idempotency_key`. Un `result` du pont peut aussi arriver après un timeout : il est ignoré si l'opération n'est plus `sent`.
- **Courses.** Un double clic sur « Construire » est bloqué par l'index unique. Deux débits simultanés sont sérialisés par `for update`. Deux PC connectés : l'index `one_active_editor` garantit que seul le premier actif reçoit les opérations.
- **Crédits et coûts réels.** Un jeu complet peut coûter cher en tokens. Il faut un plafond de crédits par build, choisi avant de lancer, et un arrêt propre quand il est atteint. Le prix exact d'un crédit sera calé sur les tarifs officiels de l'API à l'étape replica-launch, pas inventé ici.
- **Rate limits.** Pour la Data API d'Epic, on applique le rate limit indiqué dans sa doc Swagger, avec backoff et cache. Côté modèle, on gère les 429 avec reprise. Pour les générateurs d'images et de 3D, on prévoit une file d'attente.
- **Taille des fichiers.** Les uploads sont limités à 10 Mo et au format image. Les GLB et FBX sont servis par URL signée, sans passer par Vercel.
- **Temps réel.** Supabase Realtime sur `build_plans`, `operations` et `editor_links` : la page atelier ne fait aucun polling.
- **Fuseaux horaires.** Tout est stocké en UTC. Seule la date anniversaire de la dotation annuelle demande de l'attention.
- **RGPD.** La suppression du compte part en cascade depuis `auth.users`, et les fichiers Storage sont purgés par un job. Le contenu des îles n'est gardé que dans l'éditeur du client : on ne stocke que les arguments et diffs des opérations, à purger au bout de 90 jours (mentionné dans la politique de confidentialité). Il faut aussi déclarer les sous-traitants : Supabase, Vercel, Fly, Stripe, Anthropic, les fournisseurs d'images et de 3D.
- **Règles Epic.** Le contenu généré doit respecter les règles d'Epic pour les îles (modération, notation d'âge, éventuelle déclaration de contenu IA) : **à vérifier** dans les règles créateurs en vigueur, puis à expliquer dans la doc. La publication reste un geste du créateur dans le Creator Portal.
- **Multi-tenant.** Toutes les tables ont `user_id`, avec RLS, plus une vérification de propriété dans chaque route serveur, puisqu'elles utilisent le service role.

## Build order

1. **Tranche verticale (moche mais complète)**
   - Écrans : S02, S03 minimal, S05, S04.
   - Tables : `profiles`, `wallets`, `credit_ledger`, `projects`, `messages`, `build_plans`, `operations`, `editor_links`, `pairing_codes`.
   - Routes : pairing-codes, bridge/pair, WSS `/bridge`, projects, messages, plans/approve, operations/approve.
   - Pont : console Node d'abord, Tauri ensuite.
   - Critère de réussite : « fais une île avec un spawner, un timer de 60 s et un message de victoire » produit un Verse qui compile et des devices placés dans un vrai UEFN, avec des crédits débités. Pas encore de Stripe : les crédits sont attribués à la main.
   - **Prérequis : toi, avec UEFN ouvert, pour lancer le premier `tools/list`.**
2. **Indispensables**
   - Annulation et diff à valider ; boucle de compilation et correction ; session de test.
   - Stripe : 3 formules, mensuel/annuel, portail, résiliation (S13, S14).
   - Projets et limites (S06).
   - Studio de miniatures (S07).
   - Stats via la Data API (S09) et ses jobs.
   - Docs, support, pages légales (S16, S17, S19).
   - Landing (S01).
3. **Souhaitables :** Scene Graph et UMG ; choix du modèle et BYOK ; studio 3D (S08) ; vue par tag ; Idées et Analyse (S10, S11) ; packs de crédits ; login Epic ; version EN.
4. **Bonus :** méthode virale (S12), parrainage (S15), bonus réseaux, programme créateurs (S18), pages SEO (S20), pont Tauri avec mise à jour automatique.
5. **Correctifs tirés de replica-entrepreneur**, une fois l'étape lancée sur les vrais avis publics.
