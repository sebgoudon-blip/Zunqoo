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

Pour le **résumé du soir** (module « Résumé du soir »), un second template
**Utility**, langue `fr`, nommé `zunqoo_resume_soir` :

```
🌙 Résumé du {{1}}
📊 Aujourd'hui : {{2}}
✅ À faire : {{3}}
📅 Demain : {{4}}
Détails : {{5}}
```

Tant qu'un template n'est pas approuvé, le système envoie le message texte complet,
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
| E-mails (Gmail) | disponible | — |
| Devis | disponible | — |
| Factures | disponible | Devis |
| Rendez-vous, Résumé du soir, Avis Google | « bientôt disponible » | — |

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

## E-mails Gmail (étape 2)

Quand le module « E-mails » est activé et la boîte connectée, l'assistant
relève la boîte de réception toutes les 2 minutes (`MAIL_POLL_SECONDS`) :

1. newsletters, expéditeurs « no-reply » et e-mails de la boutique elle-même
   sont écartés **sans appel à l'IA** (coût nul) ;
2. les autres sont triés par le modèle rapide : devis, rendez-vous, commande,
   renseignement, réclamation, facture fournisseur, partenaire, publicité… ;
3. l'e-mail est rangé sur la fiche du client (créée si besoin) ;
4. si une réponse est attendue, elle est rédigée à partir de la fiche du
   commerce et du catalogue du CRM, puis **envoyée seule ou mise à valider**
   selon l'autonomie choisie ;
5. le libellé **Zunqoo** est posé dans Gmail sur chaque e-mail traité.

| Autonomie | Part tout seul | Toujours à valider |
|---|---|---|
| Je valide tout | rien | tout |
| Je valide l'important | renseignements simples sans prix ni date, réponse sûre | le reste |
| Automatique | tout ce qui est sûr | réclamations, sujets sensibles (remboursement, litige, paiement), e-mails suspects, urgences, réponses incertaines |

Le contenu des e-mails est traité comme une donnée : une consigne glissée
dans un e-mail (« ignore tes règles… ») n'est jamais suivie et rend l'e-mail
« suspect ». Les réponses n'inventent ni prix ni horaire, ne contiennent ni
lien ni demande de paiement. La réponse proposée est modifiable avant envoi et
part dans le même fil de discussion Gmail.

### Configurer Google (une fois pour toute la plateforme, ~15 min)

1. https://console.cloud.google.com → créer un projet « Zunqoo ».
2. *API et services → Bibliothèque* : activer **Gmail API** et
   **Google Calendar API** (rendez-vous).
3. *Écran de consentement OAuth* : type **Externe**, nom « Zunqoo »,
   e-mail d'assistance, logo facultatif. Ajouter le champ d'application
   `https://www.googleapis.com/auth/gmail.modify` et
   `https://www.googleapis.com/auth/calendar.events`. Tant que l'application est
   « En test », ajouter chaque adresse Gmail de test dans **Utilisateurs test**.
4. *Identifiants → Créer → ID client OAuth* : type **Application Web**,
   URI de redirection autorisée : `https://<votre-api>/oauth/google/callback`
   (en local : `http://localhost:8000/oauth/google/callback`).
5. Reporter dans `.env` : `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `API_PUBLIC_URL`, et `MAIL_TOKEN_KEY` généré par `zunqoo-mail genkey`.
6. Dans le CRM : *Réglages → E-mails → Activer → Connecter Gmail*.

À savoir :
- **En mode « En test », Google coupe l'accès au bout de 7 jours** : il faut
  reconnecter la boîte. Pour la production, passer l'application « En
  production » : jusqu'à 100 utilisateurs, Google affiche un avertissement
  « application non validée » à la connexion ; au-delà, la validation Google
  (avec audit de sécurité annuel pour l'accès Gmail) est obligatoire.
- `MAIL_TOKEN_KEY` chiffre les accès en base : la perdre oblige chaque
  commerce à reconnecter sa boîte. La sauvegarder avec les autres secrets.

```bash
zunqoo-mail run                     # relève en continu (service « mail » du compose)
zunqoo-mail sync rotisserie-dupont  # une relève immédiate, pour tester
```

## Devis et factures (étape 3)

**Informations légales** (*Réglages → Informations de l'entreprise*) : raison
sociale, adresse, SIRET, n° de TVA (ou franchise art. 293 B), IBAN, délais.
Aucun devis ni aucune facture ne part tant que les mentions obligatoires
manquent : l'écran dit lesquelles.

### Devis
- Créés à la main (*Ventes → Devis*) ou **préparés par l'assistant** quand
  une demande de devis arrive par e-mail (modules E-mails + Devis actifs).
- **Les prix viennent toujours du catalogue** : l'IA ne choisit que les
  produits et les quantités. Un produit absent du catalogue donne une ligne
  « prix à compléter » qui bloque l'envoi.
- Numéro `DEV-AAAA-NNNN` attribué seulement à l'envoi ; PDF avec ventilation
  de TVA, date de validité et case « Bon pour accord ».
- Envoi en PDF joint dans le fil de l'e-mail du client, ou « remis en main
  propre » (PDF téléchargé). Relances proposées à J+3 et J+7, arrêtées dès
  que la réponse (accepté / refusé) est notée ; expiration automatique.

### Factures et avoirs
- Créées depuis un devis accepté (l'assistant prépare la facture et la met
  à valider) ou à partir de rien.
- Numérotation continue `FAC-AAAA-NNNN` / `AV-AAAA-NNNN` à l'émission. Une
  facture émise est **figée** : PDF archivé, ni modification ni suppression ;
  on la corrige ou l'annule par un **avoir** (total ou partiel).
- Mentions : date de la vente, échéance, nature de l'opération, IBAN ; pour un
  client professionnel (société ou SIREN renseigné sur sa fiche) : pénalités
  de retard, indemnité de 40 €, pas d'escompte, SIREN du client.
- **Factur-X** (EN 16931) : les données de la facture sont intégrées au PDF en
  XML, vérifié contre le schéma officiel (XSD). Les validations complètes
  (schematron) et la conformité PDF/A-3 stricte seront à contrôler avec la
  plateforme agréée choisie avant l'obligation d'émission (PME : sept. 2027).
- Paiements (virement, carte, espèces, chèque), partiels ou complets ; les
  factures échues apparaissent dans « Ma journée » et des relances sont
  proposées à échéance +3 et +15 jours.

> Base de données : les nouvelles colonnes s'ajoutent automatiquement sur une
> base neuve. Avant la mise en production, prévoir des migrations (Alembic)
> pour faire évoluer une base existante sans la recréer.

## Rendez-vous et Google Agenda (étape 4)

Module « Rendez-vous » : l'assistant prend des rendez-vous **au téléphone**
et **par e-mail**, directement dans l'agenda Google du commerce.

- *Réglages → Rendez-vous* : connexion Google Agenda (même compte que Gmail ;
  un compte déjà connecté pour les e-mails doit cliquer « Autoriser l'agenda »),
  types de rendez-vous (nom, durée), plages horaires de chaque jour, marge
  entre deux rendez-vous, délai minimum, horizon de réservation, adresse.
- Créneaux proposés = plages horaires − événements déjà présents dans
  l'agenda Google (les événements « disponible » sont ignorés, un événement
  sur la journée entière bloque le jour) − rendez-vous Zunqoo. Le créneau est
  **revérifié juste avant la réservation**.
- Téléphone : l'assistant propose 2 à 3 créneaux à l'oral, puis réserve.
- E-mail : la réponse propose trois créneaux ; quand le client répond « mardi
  10 h me va », l'IA reconnaît le créneau choisi **parmi ceux proposés**
  (jamais une heure inventée), le réserve et confirme.
- Autonomie « tout valider » (par défaut) : le créneau est posé « provisoire »
  dans l'agenda et la confirmation au client attend votre accord (écran
  « À valider » ou WhatsApp). Refuser libère le créneau.
- Écran **Agenda** (liste, prise de rendez-vous manuelle, annulation qui
  retire l'événement de Google Agenda) ; « Ma journée » affiche les
  rendez-vous du jour ; rappel par e-mail la veille.
- Les heures sont toujours affichées dans le fuseau du commerce.

## Résumé du soir et avis Google (étape 5)

**Résumé du soir** (WhatsApp, au gérant) : chaque soir à l'heure choisie
(19 h par défaut, jours au choix), le bilan de la journée — appels et
commandes, e-mails traités, nouveaux clients, devis acceptés, encaissements —
ce qui reste à faire (validations, rappels, commandes sans date, factures en
retard) et ce qui est prévu demain (commandes avec les quantités à préparer,
rendez-vous). Un seul envoi par jour, même si le service redémarre. Réglages
→ Résumé du soir : aperçu et bouton « M'envoyer un essai ».

**Avis Google** (e-mail, aux clients) :
- Déclenchement : commande marquée « faite » dans Ma journée, rendez-vous
  passé, facture réglée ; après le délai choisi (1 jour par défaut), et
  jamais au-delà de 14 jours.
- Une demande par client tous les 6 mois au plus ; un client peut être exclu
  (fiche client → « Ne jamais lui demander d'avis Google »).
- Par défaut, chaque demande attend votre accord (« À valider » / WhatsApp),
  avec le message modifiable.
- Règles Google respectées : tous les clients sont sollicités de la même
  façon (pas de tri des clients « satisfaits »), sans contrepartie.
- Clients sans e-mail (souvent ceux du téléphone) : **affiche A5 avec QR
  code** à imprimer pour le comptoir ou le stand du marché.
- Le lien se récupère dans Google (fiche d'établissement → *Demander des
  avis*), il ressemble à `https://g.page/r/…/review`.

Les deux tâches tournent dans le service `zunqoo-mail run`, avec les relances.

## Signature en ligne des devis

Intégrée au CRM, sans service tiers ni abonnement supplémentaire.

- Chaque devis envoyé contient un **lien personnel** (dans l'e-mail, à la
  place de `[lien de signature]`, et dans les relances). Pour un devis remis
  en main propre, le lien se copie depuis le devis, ou s'envoie par WhatsApp
  ou SMS en un clic.
- Le client ouvre une page aux couleurs du commerce, sans créer de compte,
  sur téléphone ou ordinateur : il relit le devis (lignes, totaux, PDF),
  **confirme son e-mail avec un code à 6 chiffres** (envoyé depuis la boîte
  du commerce), signe au doigt ou en écrivant son nom, et coche
  « Bon pour accord ». Il peut aussi refuser, avec un mot facultatif.
- À la signature :
  - le devis passe « accepté » et les relances s'arrêtent ;
  - si le module Factures est actif, la facture est préparée à valider ;
  - le gérant est prévenu sur WhatsApp ;
  - le client reçoit son exemplaire signé.
- **Dossier de preuve, conservé sans limite de durée** (jamais supprimé) :
  - le PDF exact présenté au client (figé à l'envoi, identique à la pièce
    jointe) et son empreinte SHA-256 ;
  - le nom, la fonction et l'e-mail vérifié du signataire ;
  - l'image de la signature, la date et l'heure, l'adresse IP et le
    navigateur ;
  - le journal horodaté (envoi, consultations, code, signature) ;
  - un PDF signé (devis + certificat de signature), lui aussi empreinté.
- Valeur juridique : signature électronique simple (règlement eIDAS,
  art. 1366-1367 du Code civil), suffisante pour un devis entre un commerce
  et son client. Pour des montants importants ou un risque de litige
  particulier, une signature « avancée » (prestataire qualifié) reste
  possible plus tard.
- Sécurité :
  - lien impossible à deviner (identifiant aléatoire + empreinte HMAC) ;
  - lien valable jusqu'à la date de validité du devis ;
  - code de vérification valable 10 min, 5 essais au maximum ;
  - un devis déjà signé, refusé ou expiré ne peut plus être signé.
  - En production, mettre l'API derrière le reverse proxy, qui transmet
    `X-Forwarded-For` pour l'adresse IP réelle du client.

## Sécurité

Audit d'intrusion réalisé sur l'ensemble des 74 routes HTTP, avec une suite
de tests automatisés (`tests/test_security.py`) qui tourne à chaque livraison.

Vérifié et résistant : cloisonnement strict entre commerces (un commerce ne
voit ni ne modifie jamais les données d'un autre), rôles (un employé n'a pas
les droits d'administrateur), jetons de session infalsifiables (JWT signé,
« alg=none » et jetons expirés rejetés), liens de signature impossibles à
deviner (identifiant aléatoire + HMAC), code de signature limité en essais,
e-mail jamais exposé en entier, webhook WhatsApp refusé sans la signature de
Meta, pas d'injection SQL (requêtes paramétrées), pas d'énumération de comptes.

Protections en place par conception : mots de passe en scrypt + sel, jetons
Google chiffrés en base (Fernet), aucune page HTML rendue côté serveur, CORS
limité à l'adresse du CRM.

À configurer au déploiement (côté reverse proxy) : limitation des tentatives
de connexion par IP, en-têtes de sécurité (HSTS, CSP…), HTTPS partout, et
transmission de `X-Forwarded-For` (adresse IP dans les preuves de signature).
Prévoir des sauvegardes chiffrées de la base et de `MAIL_TOKEN_KEY`.

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
