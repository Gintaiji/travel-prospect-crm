# 97C-2B3D1 — Recette dans deux vrais onglets

Recette exécutée le **29 octobre 2026**, avec **Playwright 1.64.1** et
**Google Chrome 156.0.8078.49**, en mode headless. Chaque scénario ouvre deux
vraies pages dans le même contexte navigateur, donc avec les mêmes Web Locks,
la même origine et le même localStorage de test.

**Dernier passage : 10 réussites sur 10, sans retry.** Une anomalie intermittente
observée lors d'un passage précédent est conservée et détaillée ci-dessous : ce
résultat ne vaut pas autorisation d'activer le stockage isolé.

## Séparation avec l'application et les données réelles

- Aucun fichier de `app/` n'a été modifié pour cette recette.
- `ACCOUNT_SCOPED_RESOURCES_ENABLED` reste `false` et `CLOUD_SYNC_SUSPENDED` reste
  `true`. Ces valeurs sont contrôlées dans chaque scénario navigateur.
- Le banc sert les vrais modules de stockage, coordination, JSON et suivi de
  session, compilés en mémoire. Il n'est pas une route Next.js.
- Son serveur HTTP écoute uniquement sur `127.0.0.1`, sur un port éphémère,
  derrière un chemin aléatoire. Il est fermé à la fin du worker Playwright.
- Chrome est lancé par Playwright dans un profil neuf, sans connexion à un
  navigateur existant ni réutilisation d'un profil utilisateur.
- Les deux UUID fictifs sont `11111111-1111-4111-8111-111111111111` et
  `22222222-2222-4222-8222-222222222222` ; les emails utilisent `fake.invalid`.
- L'autorité d'authentification est une fixture hors ligne injectée dans le vrai
  `createUserSessionStore`. Ses changements passent entre onglets par de vrais
  événements `storage`. L'authentification de l'application n'est pas modifiée.
- Le module client Supabase n'est **pas** embarqué : le chargeur fermé du banc
  refuse toute tentative d'utiliser l'authentification réelle. Aucun fichier
  `.env`, secret ou vraie session n'est chargé dans le banc.
- Toutes les clés physiques sont préfixées par
  `tpc-browser-test:e2e-<uuid unique du scénario>:`. L'adaptateur refuse les
  propriétaires et clés qui ne correspondent pas aux fixtures. Les données de
  départ sont synthétiques, sans exécution du migrateur.
- CSP et interception Playwright bloquent les requêtes externes. Les dix
  scénarios finaux constatent **zéro requête externe/Supabase**.
- Aucun `clear()` ni effacement de clés n'est utilisé ; un namespace déjà rempli
  n'est jamais réinitialisé par écrasement. La fermeture du contexte ne concerne
  que le profil de test éphémère.

## Résultats par scénario — dernier passage

| Scénario | Résultat observé |
| --- | --- |
| Deux écritures simultanées sous A, deux onglets | Un verrou exclusif détenu et deux requêtes en attente observés par `navigator.locks.query()`. Une écriture réussit, l'autre est refusée pour conflit ; une seule entrée de journal est créée. B reste intact. |
| Passage A → B pendant l'attente du verrou | Le changement est reçu par les deux onglets. L'opération A est refusée après libération du verrou. Aucun journal ni remplacement n'est écrit sous A ou B. |
| Accès de B aux ressources de A et fichier JSON A sous B | B ne reçoit que ses ressources. Le faux jeton propriétaire A est refusé et le JSON déclaré A ne peut pas être chargé sous B. Le fichier téléchargé conserve son SHA-256. |
| Import réussi puis édition dans l'autre onglet | Journal cumulatif `import`, puis `edit` ; les deux états précédents sont conservés et le fichier JSON antérieur garde le même SHA-256. |
| Rafraîchissement après journal, avant marqueur `pending` | Pause CDP avant l'écriture du marqueur, puis véritable rechargement de la page. Le journal orphelin est détecté : « Récupération nécessaire ». Une écriture depuis un ancien accès de l'autre onglet est refusée. |
| Rafraîchissement après copie, avant marqueur `verified` | Véritable rechargement pendant une pause CDP : le candidat reste conservé avec le journal et l'ancien état. Les nouvelles écritures sont bloquées ; le diagnostic n'effectue aucune réparation. |
| Échec d'écriture du journal | `QuotaExceededError` injectée dans l'adaptateur de test. Les ressources précédentes restent exactement identiques ; aucun journal incomplet n'est créé. |
| Échec d'écriture des ressources | L'ancien contenu et sa copie dans le journal sont conservés. L'état incomplet bloque une nouvelle tentative, même après suppression du défaut simulé. |
| Échec du marqueur final | Le candidat et l'ancienne copie restent disponibles dans les preuves ; l'état `pending` interdit toute nouvelle écriture. Aucun retour arrière automatique. |
| Web Locks indisponible | API masquée uniquement dans les pages de ce scénario. L'écriture est refusée explicitement, sans verrou localStorage de substitution ; toutes les clés restent identiques. |

Les copies de sécurité sur disque et les sentinelles JSON locales sont comparées
avant/après. Après interruption, le snapshot complet est également comparé après
une tentative refusée et un export du diagnostic : aucune clé n'est modifiée par
ces actions.

## Anomalie intermittente conservée — à examiner avant activation

Un passage complet intermédiaire a produit **9 réussites et 1 échec**. Lors du
scénario concurrent, la sûreté attendue était respectée : une écriture réussie et
une refusée. Mais le refus affichait :

> Récupération nécessaire : opération interrompue ou non vérifiée.

au lieu du conflit attendu. Le test reste strict et continue d'exiger le libellé
de conflit ; il n'a pas été assoupli pour masquer cette observation.

Après ajout de traces dans le **banc seulement**, le scénario a été répété
**20 fois : 20 réussites**. Le passage complet final a ensuite réussi ses dix
scénarios. La cause exacte du premier message n'est donc **pas confirmée**.
L'hypothèse d'une observation transitoire du journal entre onglets doit être
examinée, sans la présenter comme une conclusion établie. Aucune perte ou écriture
sous le mauvais compte n'a été observée.

Cette anomalie est une **réserve avant activation** : elle peut provoquer un
blocage ou une interprétation erronée de l'état. Il ne faut pas retirer un marqueur
ou lancer une récupération pour faire disparaître ce message sans examen.
**Aucun correctif du code métier n'a été appliqué automatiquement.**

Les preuves du passage en échec sont conservées dans
`test-results/resource-browser-observed-race/` : rapport JSON, captures, contexte
d'erreur et `trace.zip`. Le rapport des vingt répétitions est
`stress-20-results.json` dans ce même dossier. Les fichiers de preuve ne sont pas
ajoutés au dépôt ni exposés par Next.js.

## Fichiers et reproduction

- `playwright.resource.config.mjs` : Chrome, un worker, aucun retry, rapports et
  traces des échecs, contextes non persistants.
- `tests/browser/resource-harness-server.mjs` : serveur autonome et compilation
  en mémoire d'une liste fermée de modules, sans SDK réel.
- `tests/browser/resource-harness.mjs` : identités et clés fictives, traces,
  défauts de stockage et points d'arrêt réservés au banc.
- `tests/browser/resource-isolation.spec.mjs` : les dix scénarios automatisés.
- `package.json` / `package-lock.json` : Playwright en dépendance de développement
  et commande `test:browser`.
- `.gitignore` : résultats et rapports exclus du dépôt.

```text
npm run test:browser
npm run test:browser -- --grep "deux onglets" --repeat-each=20
```

Chrome installé est utilisé par défaut. Pour un autre exécutable de test :
`CRM_E2E_BROWSER_PATH`. Le canal peut être choisi par
`CRM_E2E_BROWSER_CHANNEL`. Ces options concernent exclusivement Playwright, pas
l'application ou son indicateur d'activation.

Rapport final : `test-results/resource-browser-results.json`. Captures et fichiers
JSON effectivement téléchargés : `test-results/resource-browser/`. Les rapports
contiennent la version du navigateur, deux pages par scénario, l'origine de test,
les indicateurs inchangés et le contrôle des requêtes externes. Les rapports
finaux remplacent les sorties ordinaires du run précédent ; les preuves de
l'anomalie ont été copiées dans le dossier distinct avant répétition.

## Vérifications et limites restantes

- Douze suites unitaires existantes réussies ; TypeScript, ESLint ciblé et
  `npm run build` réussis. Le build n'ajoute aucune route de diagnostic.
- La recette porte sur les vrais services dans un banc, pas sur les pages métier
  Next.js basculées : elles restent dans leur mode actuel. La connexion réelle
  Supabase, les tokens réels et les politiques de la base ne sont pas testés.
- Les erreurs de quota et l'absence de Web Locks sont injectées ; le disque n'a
  pas été rempli et aucun stockage utilisateur n'a été altéré.
- Les rechargements sont réels, mais contrôlés par CDP à des fenêtres précises.
  Cela ne couvre pas toutes les coupures système, crashs navigateur ou différences
  entre Firefox, Safari et les PWA.
- localStorage reste lisible par les scripts de même origine : cette recette
  vérifie les refus de l'API métier, pas une protection cryptographique contre
  les outils de développement ou un script malveillant.
- L'installation a signalé **11 vulnérabilités npm** (1 faible, 1 modérée,
  8 élevées, 1 critique). Aucun `npm audit fix` ni mise à jour du code de production
  n'a été effectué. L'origine et l'exploitabilité de cette alerte restent à auditer
  séparément ; ce n'est pas une vulnérabilité démontrée par les scénarios navigateur.
- L'anomalie de classification concurrente et la validation d'une procédure de
  récupération manuelle restent à traiter avant toute activation. Les indicateurs
  de production et les restrictions Ressources vers Prospects restent inchangés.
