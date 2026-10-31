# Composants

Base : **shadcn/ui sur Radix** (focus, clavier et ARIA déjà gérés), stylé uniquement avec les tokens (`bg-surface`, `text-text-muted`, `rounded-md`…), sans hex en dur.
Icônes : **Lucide** (ISC). Polices : **Inter**, **Space Grotesk**, **JetBrains Mono** (toutes en licence OFL, auto-hébergées via `next/font`).
Aucun logo, aucune icône ni illustration de Builblox, d'Epic ou de Fortnite. Les visuels d'îles affichés dans les stats viennent de la Data API et sont crédités comme tels. Les illustrations du produit seront créées à l'étape replica-brand.

Règles communes à tous les composants :
- **Focus** : anneau de 2 px `focus`, décalé de 2 px, uniquement en `:focus-visible`.
- **Désactivé** : opacité 0,5, `cursor-not-allowed`, toujours accompagné d'un tooltip qui explique pourquoi (crédits, formule, éditeur déconnecté).
- **Animations** : durée `motion.base`, coupées si `prefers-reduced-motion`.
- **Cibles tactiles** : au moins 40 px.

---

```
Button
  variants  primary (bg accent, text on-accent), secondary (bg surface-2, border), ghost, danger (bg danger, text on-danger)
  sizes     sm 32px, md 40px, lg 48px (CTA landing)
  states    default, hover (accent-hover / surface-2 éclairci), active (translateY 1px), focus-visible,
            disabled, loading (spinner à gauche, libellé conservé, aria-busy)
  tokens    radius md, font sm/600 (lg : base/600), padding x 16 (sm 12, lg 24)
  a11y      vrai <button> ; liens stylés en bouton = <a> ; icône seule → aria-label obligatoire
  used on   partout
```

```
IconButton
  variants  ghost, secondary
  sizes     32, 40
  states    comme Button + pressed (aria-pressed) pour les bascules
  a11y      aria-label + tooltip au survol et au focus
  used on   header, chat, visionneuse 3D, tableaux
```

```
PromptInput  (le cœur du produit)
  variants  hero (landing, 1 ligne qui grandit, CTA intégré), chat (atelier, multi-lignes)
  parts     textarea auto-resize (max 8 lignes), bouton envoyer, ModelPicker (chat), pièce jointe image
            (miniatures / 3D), compteur de crédits estimé
  states    vide (placeholder qui tourne entre 3 exemples d'îles), saisie, envoi (désactivé + spinner),
            désactivé (pas de crédits → lien « Recharger » ; éditeur déconnecté → lien « Connecter UEFN »)
  clavier   Entrée = envoyer, Maj+Entrée = nouvelle ligne, ↑ dans un champ vide = rappeler le dernier prompt
  tokens    bg surface, border border-input, radius lg, shadow glow au focus
  a11y      <label> visible ou sr-only ; état d'envoi annoncé (aria-live polite)
  used on   S01, S04, S07, S08, S11
```

```
ModelPicker
  parts     menu Radix : modèle rapide (défaut) / modèles de pointe (badge Pro) / « Ma clé API » (si BYOK)
  states    option verrouillée → ouvre UpsellModal au lieu de sélectionner
  a11y      role menu, flèches + Entrée, Échap ferme
  used on   S04
```

```
ChatMessage
  variants  user (aligné à droite, surface-2), assistant (pleine largeur, sans bulle), system_note (xs, text-muted, centré)
  parts     markdown (titres, listes, code Verse en CodeBlock), coût en crédits (xs, muted) au survol
  states    streaming (curseur clignotant), erreur (bordure danger + « Réessayer »)
  a11y      la liste des messages est un role="log" aria-live="polite"
  used on   S04
```

```
PlanCard
  parts     titre, liste ordonnée d'étapes (titre + détail repliable), estimation de crédits (fourchette),
            plafond de crédits pour ce build (champ), actions : Modifier, Construire (primary), Annuler
  states    proposed, editing (étapes éditables, réordonnables au clavier), approved, running
            (étape courante avec spinner, autres grisées), waiting_approval (badge warning), done (check success),
            failed (étape en danger + explication + « Relancer cette étape »), cancelled
  a11y      <ol> ; l'étape courante a aria-current="step" ; changement d'étape annoncé
  used on   S04
```

```
OperationLog  (journal en direct)
  parts     lignes compactes mono xs : icône d'outil (Verse, device, entité, UI, session), libellé humain
            (« Écrit round_manager.verse »), statut, durée ; ligne dépliable = arguments + résultat
  states    live (auto-scroll, sauf si l'utilisateur a remonté → bouton « Revenir en bas »), terminé, erreur (ligne danger dépliée)
  tokens    bg code-bg, font mono, border border
  a11y      role="log" ; les erreurs sont annoncées en assertive
  used on   S04
```

```
ChangeReview  (accord avant écriture)
  variants  verse (diff unifié, ajouts success / suppressions danger, numéros de ligne),
            device (tableau propriété : avant → après), entity (composants ajoutés/retirés), ui (liste des widgets)
  actions   Accepter, Refuser, « Tout accepter pour cette étape » (case), Annuler (une fois appliqué)
  states    awaiting_approval, approved, rejected, undone
  clavier   A = accepter, R = refuser quand le panneau a le focus (affiché dans l'aide)
  a11y      les couleurs du diff sont doublées de +/− ; résumé textuel « 12 lignes ajoutées, 3 supprimées »
  used on   S04
```

```
CodeBlock
  parts     coloration Verse (grammaire écrite par nous, Shiki), bouton copier, nom de fichier
  tokens    bg code-bg, font mono sm, radius md
  used on   S04, S16
```

```
EditorStatusBadge
  states    disconnected (point text-muted, « UEFN non connecté »), waiting (point warning pulsé,
            « En attente du pont… »), mcp_missing (warning, « Pont connecté, MCP introuvable » → lien vers la checklist),
            connected (point success, nom du PC + projet UEFN), conflict (warning, « 2 PC connectés : choisir »)
  a11y      texte toujours présent (pas seulement la couleur) ; changement annoncé en polite
  used on   header S03–S12, S05
```

```
PairingPanel
  parts     étape 1 télécharger le pont (Windows), étape 2 Checklist UEFN, étape 3 code d'appairage
            (8 caractères, mono xl, espacés 4-4, bouton copier, compte à rebours 10 min, « Nouveau code »)
  states    non connecté, code expiré, en attente, connecté (succès + « Ouvrir l'atelier »)
  used on   S05
```

```
Checklist
  parts     items cochés automatiquement quand le pont le détecte (Python Editor Scripting, UEFN MCP Toolsets,
            port joignable) ; item non détecté = aide dépliable avec capture des réglages UEFN faite par nous
  used on   S05, S16
```

```
CreditMeter
  variants  compact (header : icône + nombre), full (atelier : jauge dotation mensuelle + bonus, date de renouvellement)
  states    normal, bas (<10 % : warning), épuisé (danger + bouton Recharger)
  a11y      role="meter" avec aria-valuenow / max
  used on   header, S04, S14
```

```
Sidebar
  parts     logo (placeholder), Créer une île, Projets, Miniatures, Modèles 3D, Stats, Idées, Analyse, Guide ;
            pied : CreditMeter compact, menu avatar
  variants  expanded 248px, collapsed 64px (icônes + tooltips), drawer mobile (< md)
  states    item actif (bg surface-2 + barre accent 3px à gauche), verrouillé (cadenas + badge « Pro »)
  a11y      <nav aria-label="Outils"> ; aria-current="page"
  used on   S03–S12
```

```
ProjectCard
  parts     vignette 16:9 (ou motif de placeholder généré), nom, type, date relative, code d'île si publiée
  states    default, hover (shadow card → pop), sans vignette, archivé
  used on   S03, S06
```

```
LimitBanner
  parts     « 5 projets sur 5 » + « Passer à Pro » ; s'affiche aussi pour les stats tronquées (« 500 îles sur 300 000+ »)
  used on   S06, S09
```

```
VariantGrid
  parts     grille 2×2 (desktop) / 1 colonne (mobile), image 16:9, actions par variante : Télécharger, Retravailler, Agrandir
  states    génération (skeleton animé + « 20 s environ »), prête, échec (remboursé : message explicite)
  used on   S07, S08
```

```
ModelViewer3D
  parts     <model-viewer> (Apache-2.0) ou three.js ; rotation auto, drag pour tourner, molette pour zoomer ;
            barre : Télécharger FBX, GLB, nombre de polygones
  states    chargement (progression), prêt, erreur de chargement
  a11y      alternative textuelle = prompt + style ; contrôles accessibles au clavier
  used on   S08
```

```
StyleSegmented
  options   Cartoon (défaut), Low poly, Réaliste, Pixel
  a11y      role radiogroup
  used on   S08
```

```
StatsTable
  colonnes  île (titre + créateur), tags, joueurs max (24 h), joueurs uniques, rétention J1, tendance 7 j (Sparkline), code (copier)
  parts     filtres par tag (chips), tri par colonne, pagination par curseur
  states    chargement (skeleton rows), filled, vide (« Aucune île pour ce tag »), tronqué (LimitBanner)
  a11y      vrai <table>, en-têtes triables = <button> avec aria-sort
  used on   S09
```

```
Sparkline
  parts     ligne 1.5px accent, sans axes, point final ; valeur et variation en texte à côté
  a11y      aria-label « +18 % sur 7 jours »
  used on   S09, S10
```

```
IdeaCard
  parts     titre, pitch 2 lignes, tags, preuve (2 îles citées), score (si analyse), « Envoyer au constructeur »
  used on   S10, S11
```

```
ScoreDial
  parts     anneau 0–100 + chiffre ; forces (success), risques (warning), recommandations (liste)
  a11y      role="meter" + texte du score
  used on   S11
```

```
PricingCard
  variants  standard, mise en avant (border accent + badge « Le plus choisi »)
  parts     nom, prix (mensuel / annuel avec économie), crédits/mois, projets, liste d'inclus (check), CTA
  used on   S01, S13
```

```
BillingToggle
  options   Mensuel / Annuel (badge −xx %)
  a11y      role radiogroup
  used on   S13
```

```
Accordion  (FAQ)
  base      Radix Accordion ; un item ouvert à la fois ; chevron qui tourne
  used on   S01, S13, S16
```

```
UpsellModal
  parts     ce qui est verrouillé, ce que la formule apporte, CTA « Voir les formules », « Plus tard »
  base      Radix Dialog : focus piégé, Échap ferme, retour du focus au déclencheur
  used on   partout où une fonction Pro est cliquée
```

```
ConfirmDialog
  usage     révoquer un pont, annuler un build, supprimer un projet ; bouton danger, texte explicite de la conséquence
```

```
Toast
  variants  succès, erreur, info
  base      Radix Toast, 5 s, pause au survol, fermable ; erreurs en role="alert"
```

```
FormField
  parts     label, input / textarea / select, aide, erreur
  states    default, focus (border accent + ring), erreur (border danger + message lié par aria-describedby), désactivé
  tokens    bg bg, border border-input, radius md, hauteur 40
  used on   S02, S14, S17, S18
```

```
EmptyState
  parts     icône Lucide 32px muted, titre, une phrase, une action principale
  textes    écrits à neuf par écran (ex. Projets vides : « Ta première île commence par une phrase. » → Créer une île)
```

```
Skeleton
  usage     toute zone qui charge plus de 300 ms ; animation shimmer coupée en reduced-motion
```

## Mises en page

- **Atelier S04 (desktop ≥ lg)** :
  - à gauche : le chat, sur 760 px maximum (`chat-max`) ;
  - à droite : un panneau de 420 px avec trois onglets, Plan, Journal et Changements ;
  - en dessous de lg : le panneau devient un tiroir qu'on ouvre depuis le bas.
- **Application** : header de 56 px, sidebar de 248 px repliable à 64 px, contenu limité à 1 200 px.
- **Landing** : hero centré avec PromptInput hero, vitrine d'îles (que des îles réelles construites avec le produit, avec l'accord de leurs créateurs), « Comment ça marche » en 3 étapes, formules, FAQ.
