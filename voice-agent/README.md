# Zunqoo Voice — agent vocal téléphonique

Standard téléphonique IA pour les commerces de bouche (premier client : une
rôtisserie artisanale). Il décroche, répond aux questions (horaires, marchés,
produits, prix), prend les commandes avec une voix naturelle, puis envoie un
compte-rendu WhatsApp au gérant dès qu'on raccroche.

Le code est multi-tenant dès le départ et se vend sous deux formes :
**licence one-shot** (installé chez le client, licence signée vérifiée
hors-ligne) ou **abonnement SaaS** (hébergé, minutes comptées par tenant).

## Architecture

```
          Appelant
             │  PSTN
             ▼
   Opérateur SIP (Twilio / Telnyx / OVH)  ── SDA du commerce
             │  SIP
             ▼
   LiveKit SIP ─ dispatch rule ─▶ room « call-<tenant>-xxxx » + job agent {"tenant_id"}
             │  WebRTC (audio)
             ▼
 ┌───────────────────────── Worker zunqoo_voice.agent.worker ─────────────────────────┐
 │  Silero VAD ──▶ Deepgram STT (stream, fr) ──▶ détecteur de fin de tour             │
 │      │                                             │                              │
 │      │ barge-in : coupe TTS + annule le LLM         ▼                              │
 │      └─────────────────────────────────────  LLM (Claude / GPT-4o) + outils       │
 │                                                    │ tokens en flux               │
 │                                                    ▼                              │
 │                                    ElevenLabs Turbo v2.5 (WebSocket) / Cartesia    │
 │                                                                                   │
 │  fin d'appel ─▶ transcription ─▶ LLM extraction (CallReport) ─▶ WhatsApp gérant   │
 │                                                     └─────────▶ compteur minutes   │
 └───────────────────────────────────────────────────────────────────────────────────┘

 Onboarding : URL du site ─▶ crawler ─▶ LLM ─▶ BusinessProfile (JSON) ─▶ fiche tenant
```

### Choix techniques

| Sujet | Choix | Pourquoi |
|---|---|---|
| Orchestration | LiveKit Agents 1.8 | SIP natif (pas de serveur média à écrire), barge-in, génération anticipée et détection de fin de tour intégrés, déployable en cloud ou sur site. |
| Barge-in | Silero VAD, interruption à 0,3 s, reprise si fausse interruption | L'agent se tait dès que l'appelant parle ; une toux ne coupe pas la phrase pour de bon. |
| Fin de tour | Détecteur sémantique LiveKit (multilingue) + endpointing 0,35–2,5 s | Répond vite quand la phrase est finie, attend quand le client hésite (« euh… et puis… »). |
| Latence | Génération LLM anticipée sur la transcription partielle, VAD préchargée, accueil sans LLM, TTS qui démarre dès ~50 caractères | Objectif < 800 ms entre la fin de phrase et le premier son. |
| Humain-first | Prompt « oral » strict, nombres écrits comme on les dit, bruits de clavier pendant les outils | Pas de listes, pas de jargon, transitions naturelles. |
| Voix | Cartesia Sonic-3 par défaut ; ElevenLabs Turbo v2.5 en option par tenant (`voice.tts_provider`) | Cartesia : 2 à 3 fois moins cher, latence plus basse. ElevenLabs reste la référence en naturel : à comparer à l'oreille au téléphone. |
| Transparence IA | L'accueil annonce « l'assistante vocale » ; l'agent ne prétend jamais être humain | Obligation de l'AI Act (art. 50) depuis août 2026. |
| Fiabilité | Chaque appel est archivé (`data/calls/`) avant l'envoi WhatsApp | Une commande n'est jamais perdue si WhatsApp échoue (`GET /calls/{tenant}/undelivered`). |
| Extraction | Sorties structurées natives (Anthropic `messages.parse`, OpenAI `chat.completions.parse`) validées par Pydantic | Le JSON respecte toujours le schéma, pas de parsing de texte libre. |
| WhatsApp | Template approuvé d'abord, repli texte | Meta n'accepte le texte libre que dans les 24 h suivant un message du gérant ; le template marche toujours. |
| Licences | Ed25519, vérification hors-ligne | Le one-shot n'a pas besoin de serveur éditeur ; le client ne peut ni forger ni modifier sa licence. |

## Arborescence

```
voice-agent/
├── pyproject.toml              dépendances + commandes (zunqoo-onboard, zunqoo-license, zunqoo-sip)
├── .env.example                toutes les variables d'environnement
├── Dockerfile / deploy/        image + docker-compose (worker + API admin)
├── data/tenants/               une fiche JSON par commerçant (rotisserie-demo.json en exemple)
├── src/zunqoo_voice/
│   ├── core/
│   │   ├── config.py           réglages plateforme (pydantic-settings)
│   │   ├── models.py           BusinessProfile, CallReport, TenantConfig…
│   │   ├── tenant_store.py     stockage des tenants + routage par numéro
│   │   └── structured_llm.py   appels LLM à sortie JSON validée (Anthropic / OpenAI)
│   ├── scraper/
│   │   ├── crawler.py          crawl même domaine, robots.txt, JSON-LD, tel:/mailto:
│   │   ├── extractor.py        corpus dédoublonné -> BusinessProfile via LLM
│   │   ├── onboarding.py       URL -> fiche tenant enregistrée
│   │   └── cli.py              zunqoo-onboard
│   ├── stt/factory.py          Deepgram streaming FR + vocabulaire du tenant
│   ├── llm/
│   │   ├── prompts.py          prompt système (style oral, règles, fiche, contexte d'appel)
│   │   ├── tools.py            function calling : planning, commande, transfert, raccrocher
│   │   ├── call_analysis.py    transcription -> CallReport
│   │   └── factory.py          LLM de conversation
│   ├── tts/factory.py          ElevenLabs Turbo v2.5 / Cartesia, en WebSocket
│   ├── telephony/
│   │   ├── routing.py          appelant, numéro composé, résolution du tenant
│   │   └── provision.py        trunk entrant + dispatch rule LiveKit (zunqoo-sip)
│   ├── whatsapp/
│   │   ├── formatter.py        message texte + variables du template
│   │   ├── client.py           client Cloud API (retries, codes d'erreur Meta)
│   │   └── notifier.py         envoi au(x) gérant(s), template puis repli texte
│   ├── billing/
│   │   ├── plans.py            offres et droits (minutes, transfert, voix perso…)
│   │   ├── license.py          licences Ed25519 (one-shot)
│   │   ├── usage.py            minutes par tenant et par mois (SQLite)
│   │   ├── guard.py            « ce tenant peut-il prendre l'appel ? »
│   │   └── cli.py              zunqoo-license keygen | issue | verify
│   ├── agent/worker.py         orchestration principale (point d'entrée)
│   └── api/app.py              API admin : onboarding, fiches, relevés de conso
└── tests/                      formatter/notifier WhatsApp, crawler, routage, licences, prompt
```

## Guide de déploiement

### 1. Installation

```bash
cd voice-agent
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env          # puis remplir les clés
python -m zunqoo_voice.agent.worker download-files   # VAD + détecteur de fin de tour
pytest
```

### 2. Comptes et clés à créer

| Service | Où | Variable(s) |
|---|---|---|
| LiveKit Cloud (ou serveur auto-hébergé + `livekit-sip`) | cloud.livekit.io → Settings → Keys | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` |
| Deepgram | console.deepgram.com → API Keys | `DEEPGRAM_API_KEY` |
| Anthropic ou OpenAI | console.anthropic.com / platform.openai.com | `ANTHROPIC_API_KEY` ou `OPENAI_API_KEY` |
| ElevenLabs (ou Cartesia) | elevenlabs.io → Profile → API key ; choisir une voix FR dans la Voice Library | `ELEVENLABS_API_KEY`, `ELEVENLABS_DEFAULT_VOICE_ID` |
| WhatsApp Business | developers.facebook.com → app « Business » → WhatsApp | `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` |
| Opérateur SIP | Twilio Elastic SIP Trunking, Telnyx, OVH… | (configuré côté opérateur, voir 4) |

### 3. Onboarder un commerce

```bash
# Aperçu de la fiche extraite, sans rien enregistrer
zunqoo-onboard https://www.ma-rotisserie.fr --dry-run

# Création du tenant
zunqoo-onboard https://www.ma-rotisserie.fr --tenant rotisserie-dupont \
    --plan saas_pro --sda +33187000000 --whatsapp 0612345678
```

Relisez `data/tenants/rotisserie-dupont.json` : ajoutez `transfer_number`,
`custom_instructions` (« commande la veille avant 18 h »…), une voix
(`voice.voice_id`) et corrigez ce que le site ne disait pas. Relancer
l'onboarding sur un tenant existant ne remplace que `profile`.

### 4. Brancher le numéro de téléphone

```bash
zunqoo-sip rotisserie-dupont      # crée le trunk entrant + la dispatch rule LiveKit
```

Puis chez l'opérateur (exemple Twilio) : Elastic SIP Trunking → créer un
trunk → **Origination URI** = l'URI SIP de votre projet LiveKit
(`sip:<id>.sip.livekit.cloud`, visible dans Settings → Project) → associer le
numéro (SDA). Un appel vers ce numéro arrive dans une room LiveKit et
déclenche l'agent avec `{"tenant_id": "rotisserie-dupont"}`.

Test sans téléphone : `python -m zunqoo_voice.agent.worker console` (micro et
haut-parleurs locaux, avec `DEFAULT_TENANT_ID=rotisserie-demo`).

### 5. WhatsApp : template à faire approuver

Hors fenêtre de 24 h, Meta n'accepte qu'un template approuvé. Créez dans
WhatsApp Manager → Message templates un template **Utility**, langue
`fr`, nommé `zunqoo_call_report` :

```
🛎️ {{1}}
👤 Client : {{2}}
🍗 Commande : {{3}}
📅 Retrait / livraison : {{4}}
📝 Notes : {{5}}
```

Tant qu'il n'est pas approuvé, le système envoie le message texte complet,
ce qui ne passe que si le gérant a écrit au numéro Business dans les
dernières 24 h. Pour la production, prenez un jeton permanent de *System
User* (Business Manager → Utilisateurs système), pas le jeton de test qui
expire en 24 h.

### 6. Lancer en production

```bash
cd deploy && docker compose up -d --build
```

- `agent` : le worker vocal (connexion sortante vers LiveKit, aucun port entrant).
  Pour monter en charge, augmentez les replicas.
- `admin-api` : `POST /tenants/onboard`, `GET /tenants/{id}`,
  `GET /billing/statement?month=2026-10` (en-tête `Authorization: Bearer $ADMIN_API_TOKEN`).

## CRM (étape 1)

Application web `apps/crm` (React) + API `/api` (FastAPI, `crm/`). Le client
n'active que ce dont il a besoin, depuis **Réglages** :

| Module | État | Dépend de |
|---|---|---|
| Standard téléphonique | disponible | — |
| Prise de commandes | disponible | Standard |
| Rendez-vous, E-mails, Devis, Factures, Résumé du soir, Avis Google | « bientôt disponible » | Factures → Devis |

- Activer un module active ses prérequis ; en désactiver un coupe ceux qui en
  dépendent (avec confirmation). Trois formules de départ en un clic.
- Chaque module qui produit des actions a un niveau d'autonomie : *je valide
  tout*, *je valide l'important*, *automatique*.
- Côté téléphone : sans « Prise de commandes », l'agent ne prend plus de
  commande (il note la demande pour un rappel) ; sans « Standard », l'appel est
  renvoyé vers `transfer_number`.

**Écrans** : Accueil (chiffres + activité), À valider, Clients (fiche +
historique de tous les échanges, notes), Catalogue (ajout à la main, import
CSV/Excel, prix HT ou TTC, TVA), Réglages.

**Catalogue** : rempli automatiquement depuis le site à l'onboarding, puis
modifiable. Les prix sont stockés tels que saisis avec l'indication HT/TTC :
l'agent annonce toujours le prix TTC exact. Taux de TVA et nature des prix
par défaut : `default_vat_rate` et `prices_include_vat` dans la fiche tenant.

**Validations** : les éléments préparés par l'assistant arrivent dans « À
valider » et sur WhatsApp avec deux boutons. Une décision prise d'un côté
disparaît de l'autre ; un double clic ne déclenche jamais deux envois. Les
modules des étapes suivantes branchent leur action avec
`@executor("devis_envoi")` (`crm/approvals.py`).

### Mise en route du CRM

```bash
# Accès pour le gérant (le mot de passe est demandé au clavier)
zunqoo-crm create-user --tenant rotisserie-dupont --email gerant@exemple.fr --name "Paul"
zunqoo-crm seed-catalog rotisserie-dupont          # si l'onboarding date d'avant le CRM

uvicorn zunqoo_voice.api.app:app --port 8000      # API
npm install && npm run dev:crm                     # écrans (depuis la racine du dépôt)
```

En production : `npm run build:crm` produit `apps/crm/dist/` (fichiers
statiques), à servir sur le même domaine que l'API (`/api` relayé vers le
port 8000) ou avec `VITE_API_URL` pointant vers l'API.

### Validation par WhatsApp

1. Faire approuver le template **Utility** `zunqoo_validation` (langue `fr`) :

   ```
   ✅ À valider : {{1}}
   {{2}}
   Détail et modification : {{3}}
   ```
   avec deux boutons « réponse rapide » : **Valider** puis **Refuser**.
2. Dans l'app Meta → WhatsApp → Configuration → Webhook : URL
   `https://<votre-api>/webhooks/whatsapp`, jeton = `WHATSAPP_VERIFY_TOKEN`,
   abonnement au champ `messages`. Renseigner `WHATSAPP_APP_SECRET`
   (Paramètres de l'app → Général) : toute requête non signée est refusée.
3. Seuls les numéros `whatsapp.manager_numbers` du commerce concerné peuvent
   valider ; le gérant reçoit un accusé « ✅ Fait » ou « ❌ Refusé ».

## Coûts d'exploitation (estimation, à vérifier sur les grilles tarifaires)

Configuration par défaut (Cartesia + Sonnet 5.5 pour la conversation + Haiku 5.5 pour le compte-rendu) :
~0,10 € par appel de 2 minutes, soit ~50–90 €/mois pour ~450 appels, en comptant
le numéro (~3 €/mois), l'abonnement Cartesia et un petit serveur (~10 €/mois).
Passer la voix sur ElevenLabs ajoute ~20–90 €/mois selon le volume.

## Checklist de lancement

Démarches à lancer tout de suite (délais côté fournisseurs) :
- [ ] Numéro français : dossier réglementaire chez l'opérateur (Kbis, justificatif d'adresse) — quelques jours.
- [ ] Template WhatsApp `zunqoo_call_report` soumis à Meta — de quelques heures à quelques jours.
- [ ] Jeton WhatsApp permanent (System User) et numéro Business vérifié.

Tests avant mise en service :
- [ ] Choisir la voix : comparer 2 ou 3 voix Cartesia FR (et une ElevenLabs) en mode `console`, puis au vrai téléphone.
- [ ] Relire et compléter la fiche du commerce générée par l'onboarding.
- [ ] 20 à 30 appels de test : commande simple, commande modifiée en cours de route, question hors fiche, client qui coupe la parole, numéro masqué, bruit de fond.
- [ ] Vérifier la réception WhatsApp et l'archive `data/calls/`.
- [ ] Mention RGPD : informer les clients que les appels sont transcrits (site web, ou phrase d'accueil si le gérant le souhaite).

## Modèles commerciaux

**Abonnement SaaS** (`DEPLOYMENT_MODE=saas`) : vous hébergez tous les
tenants. Chaque appel est compté (`billing/usage.py`, arrondi à la minute
supérieure) et `GET /billing/statement` donne le relevé mensuel par tenant,
à facturer (Stripe en facturation à l'usage, ou à la main). Un forfait
dépassé ne coupe jamais un appel : le dépassement est journalisé et facturé.
Les offres et droits sont dans `billing/plans.py`.

**Licence one-shot** (`DEPLOYMENT_MODE=onprem`) : le client héberge et paie
ses propres clés API.

```bash
zunqoo-license keygen                       # une seule fois, côté éditeur
zunqoo-license issue --customer "Rôtisserie Dupont" --tenant rotisserie-dupont \
    --updates-until 2027-10-31 > licence.txt
```

Livrez `licence.txt` + `LICENSE_PUBLIC_KEY` ; le worker refuse de prendre
les appels sans licence valide pour le tenant.

## Prochaines étapes

- Relier `enregistrer_commande` à la file Zunqoo existante (Firestore
  `vendors/{id}/orders`), pour que la commande téléphonique apparaisse en caisse.
- Re-scraping planifié du site (offres avec `auto_kb_refresh`).
- Tableau de bord gérant : historique des appels et réécoute (LiveKit Egress).
- Remplacer `FileTenantStore` par Postgres/Firestore au-delà de quelques dizaines de tenants.
