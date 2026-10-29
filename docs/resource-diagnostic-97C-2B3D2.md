# 97C-2B3D2 — Diagnostic de concurrence et audit npm

Recette du 29 octobre 2026. **Activation déconseillée.** Une course de lecture est reproductible : le refus protège les écritures, mais « Récupération nécessaire » peut signaler un état transitoire ou une lecture incohérente plutôt qu’un import interrompu. La cause exacte du premier échec historique n’est pas démontrée. L’audit signale aussi Next.js critique dans les dépendances de production.

## Périmètre et préservation

Aucun fichier applicatif, manifeste ou lockfile modifié. Aucun correctif de logique métier ni de dépendance. Aucun accès aux vraies données CRM, comptes ou tables Supabase. Le mode isolé reste désactivé et le cloud suspendu. Les garde-fous existants restent intacts.

Le banc navigateur autonome charge les vrais modules TypeScript en mémoire, mais utilise exclusivement deux comptes fictifs, un profil Chrome neuf et des clés préfixées par scénario. Les requêtes externes sont bloquées. Aucun diagnostic n’est ajouté aux routes de production. Les tests ne lancent aucune migration réelle.

Les pièces 97C-2B3D1 restent à leur emplacement original, notamment `test-results/resource-browser-observed-race/`. SHA-256 du premier `trace.zip` :

`542c2c9a579a1939eba24fd3a80a32bec2d1f23900d1a964c144cce89a36fa1b`

`audit-execution.json` conserve les empreintes avant/après des manifestes, indicateurs et premières preuves ; elles sont identiques. Les résultats D2 ont leur propre répertoire `test-results/resource-diagnostic-97C-2B3D2/`. Ces artefacts sont locaux, ignorés par Git : les archiver avec le rapport pour conserver les preuves.

## Conditions exactes des états

| État / refus | Condition dans le code | Conséquence |
|---|---|---|
| Conflit Ressources | Sous verrou exclusif, propriétaire encore valide, contrôle de récupération réussi, mais octets actuels des ressources différents de la base attendue | Aucun nouveau journal ni ressource écrit par cette tentative ; recharger la base avant nouvelle proposition |
| Récupération nécessaire | Journal/état absents partiellement, illisibles ou invalides ; propriétaire/identifiants/dates/snapshots incohérents ; dernier identifiant différent du marqueur ; marqueur non `verified` ; ressources différentes du dernier candidat vérifié | Refus d’écriture ; conservation des sources et snapshots ; aucun rétablissement automatique |
| Session périmée | Capacité propriétaire invalidée par génération, déconnexion ou autre compte, y compris après attente du verrou | Refus ; aucune réattribution au compte courant |
| Web Locks indisponible | API native absente | Refus sans verrou localStorage de remplacement |

Le contrôle de récupération précède le contrôle de conflit : un même candidat périmé peut donc recevoir récupération plutôt que conflit. `accountBusinessStorage.ts` effectue en outre ses contrôles **avant** l’acquisition du verrou par `coordinateResourceWrite`. `assertResourceRecoveryClear` lit séparément journal, marqueur puis ressources ; cet ensemble de lectures n’est pas un snapshot atomique.

Fichiers concernés par le diagnostic : `app/lib/accountBusinessStorage.ts`, `resourceWriteCoordinator.ts`, `accountScopedStorage.ts`, `resourceAccess.ts`, `resourceBackupJson.ts`, `legacyDataMigration.ts`, `userSessionStore.ts` et leurs tests. Aucun n’a été corrigé dans cette étape.

## Ce qui est démontré

### 1. Écriture active : récupération transitoire, puis conflit

Deux onglets ont une base identique. Le premier est suspendu par CDP juste avant le marqueur final `verified`, en conservant son vrai Web Lock. Son journal, marqueur `pending` et candidat sont déjà stockés. Le second tente d’écrire : le contrôle métier **avant verrou** refuse avec « Récupération nécessaire », sans nouvelle demande de verrou et sans modification du stockage. Après reprise, le premier valide. Une nouvelle tentative du second avec sa base ancienne obtient « Conflit Ressources ».

Il s’agit d’un repli sûr pour l’intégrité des écritures, mais le libellé confond opération active et opération abandonnée. Une récupération manuelle à ce stade serait injustifiée et dangereuse si elle ignorait le verrou.

### 2. Course de lecture : générations différentes dans le même contrôle

Une première écriture est vérifiée. Le second onglet commence une écriture et lit le journal génération 1 ; un point d’arrêt intervient juste avant sa lecture du marqueur. Le premier onglet termine entièrement une écriture génération 2. À la reprise, le second lit le marqueur génération 2 avec son journal génération 1 et reçoit « Récupération nécessaire ». L’état durable est pourtant cohérent et `verified`. Une lecture fraîche fonctionne.

**Course confirmée entre contrôle de lecture hors verrou et écriture.** C’est un faux positif de récupération, pas la preuve d’une corruption. Aucun verrou d’écriture natif n’est contourné, aucune validation partielle n’est présentée comme complète. Le test vérifie les snapshots initiaux conservés dans le journal, la dernière correspondance candidat/ressources, le compte B intact et la sauvegarde JSON précédente intacte.

### 3. Concurrence réellement sérialisée

Le test historique strict conserve l’exigence « Conflit Ressources » : deux demandes sont explicitement mises en attente derrière un verrou-barrière, puis libérées. Une seule écriture est validée et le perdant reçoit le conflit lors du passage final. Les quatre tests de résistance exécutent chacun trois tours : file de deux demandes, écriture terminée avant la seconde tentative, puis nouvelle file, avec ordre des onglets choisi par PRNG et graines 7, 19, 73, 103. Soit **12 tours, 24 tentatives**. Les observations enregistrent le refus réel ; elles ne remplacent pas l’assertion stricte du scénario historique. Une répétition réussie ne prouve pas l’absence de course.

### 4. Interruption et écritures partielles

Une transaction multi-clés localStorage n’est pas atomique. Des états partiels sont possibles et reproduits : journal ajouté avant marqueur ; ressources remplacées avant marqueur final. Après rafraîchissement, ils restent bloqués en récupération. Le dernier journal conserve `beforeRaw` et `candidateRaw`, et les sauvegardes JSON antérieures restent intactes. Une panne avant la toute première écriture du journal laisse la source intacte ; une panne après le journal laisse une preuve permettant d’examiner la reprise.

Les anciennes ressources sont donc récupérables **dans les scénarios vérifiés, tant que le journal et/ou la sauvegarde indépendante restent intacts**. Cela ne garantit pas une récupération après suppression du profil navigateur, corruption disque ou altération de toutes les copies. Aucun rollback automatique n’est exécuté.

## Ce qui reste incertain : premier échec conservé

La trace historique montre les deux demandes en attente avant libération de la barrière, puis le refus récupération plutôt que conflit. Elle ne contient pas les lectures internes, les générations observées ni une pile du refus permettant de localiser le contrôle. L’assertion a échoué avant le relevé d’état final. L’inspection en lecture seule est reproductible avec `node tests/diagnostics/inspect-first-race.mjs` et produit `first-trace-summary.json`.

Les deux scénarios D2 reproduisent la **transition suspecte**, mais ne démontrent pas la cause unique de cet échec historique : ils ne reproduisent pas exactement ses deux demandes déjà en attente. Une visibilité interprocessus du stockage ou un autre entrelacement reste une hypothèse, pas un résultat établi. Aucun élément disponible ne prouve une écriture partielle lors de cet ancien passage ; aucun élément disponible ne permet non plus d’affirmer son état durable final.

## Instrumentation de test

Uniquement dans `tests/browser/resource-harness.mjs` : ordre et horodatage des événements, onglet via fichier de trace, scénario via pièce jointe, demandes/acquisitions/fin de callback/résolution des Web Locks natifs, alias A/B, génération de session, nombre d’entrées et identifiant d’opération du journal, statut du marqueur, transitions des jobs et pile de refus. `lock-callback-end` précède la libération effective ; `lock-settled` est l’observation de résolution, pas un événement natif de libération.

Les journaux instrumentés ne contiennent ni contenu métier, ni UUID personnel, ni token : seulement métadonnées et identifiants d’opérations synthétiques. Les anciens artefacts ne sont pas réécrits. Les captures/JSON historiques du banc ne contiennent que des fixtures fictives. Les points d’arrêt sont contrôlés par CDP ; aucun délai Playwright n’a été augmenté et aucun retry ajouté.

Un premier lancement D2 a été interrompu car le pilote attendait le retour d’un `evaluate` lui-même suspendu au point d’arrêt de lecture. Le pilote a été corrigé pour attendre l’événement CDP avant de reprendre ; il s’agissait d’un interblocage du test, pas d’un défaut applicatif. Le répertoire du premier lancement D2 est conservé séparément des passages complets `browser-run2` et `browser-final`. Le passage final utilise les graines avec choix d’onglet par les bits hauts du PRNG et inclut les transitions des jobs ; 16/16 réussites en 15,1 secondes.

## Résultats et invariants

| Scénario navigateur | Résultat | Invariant vérifié |
|---|---|---|
| Deux écritures mises en file | Réussi | Une validation, un conflit, journal unique, B et JSON inchangés |
| Changement A vers B pendant attente | Réussi | Ancienne opération refusée, ressources A/B inchangées |
| Accès B / sauvegarde A sous B | Réussi | Lecture avec capacité forgée et import inter-compte refusés |
| Import réussi puis édition | Réussi | Journal et JSON précédents conservés |
| Rafraîchissement avant `pending` | Réussi | Journal incomplet détecté, nouvelles écritures refusées |
| Rafraîchissement avant `verified` | Réussi | Candidat non activé comme complet, récupération obligatoire |
| Échec écriture journal | Réussi | Source et sauvegarde conservées |
| Échec écriture ressources | Réussi | Ancienne source conservée, récupération bloquante |
| Échec écriture `verified` | Réussi | Snapshot initial conservé, pas de faux succès |
| Absence de Web Locks | Réussi | Refus sans fallback |
| Écriture active / récupération / conflit | Réussi | Aucune écriture concurrente autorisée pendant récupération |
| Lecture journal v1 / marqueur v2 | Réussi | Refus sûr, dernier état durable cohérent et relisible |
| Résistance graines 7, 19, 73, 103 | 4 réussis, 12 tours | Un succès par tour, aucun mélange, snapshots et JSON conservés |

Les données sont protégées dans les scénarios effectivement vérifiés, avec les limites de récupération indiquées ci-dessus. Cela ne constitue pas une preuve exhaustive de tous les ordonnancements, navigateurs ou pannes matérielles.

Validation : 16/16 tests navigateur, sans retry ; 12/12 fichiers unitaires ; `tsc --noEmit` réussi ; ESLint ciblé réussi ; `npm run build` réussi (20 pages générées). `npm run lint` global échoue sur **9 erreurs et 3 avertissements préexistants** après suppression d’un avertissement introduit dans la configuration de test : assistant, connexion, useSpeechRecognition, prospects, sauvegarde, Street Marketing et aujourd’hui. Ces fichiers n’ont pas été modifiés.

Commandes :

```text
npm run test:browser -- --config=playwright.resource-diagnostic.config.mjs --output=test-results/resource-diagnostic-97C-2B3D2/browser-final
node --test tests/*.test.mjs tests/cloud-sync-suspension.cjs
node_modules\.bin\tsc.cmd --noEmit
node_modules\.bin\eslint.cmd tests/browser/resource-harness.mjs tests/browser/resource-isolation.spec.mjs tests/browser/resource-diagnostic.spec.mjs tests/diagnostics/*.mjs playwright.resource-diagnostic.config.mjs
npm run lint
npm run build
node tests/diagnostics/audit-dependencies.mjs
node tests/diagnostics/dependency-report.mjs
```

## Vulnérabilités et priorités ultérieures

L’audit complet compte **11 paquets vulnérables : 1 critique, 8 élevés, 1 modéré, 1 faible**. L’audit sans dev compte **6 paquets : 1 critique, 4 élevés, 1 modéré**. Il s’agit du comptage npm par paquet, pas de onze avis distincts ni de onze exploitations démontrées. Les sorties audit ont un code 1 à cause des constats ; `npm ls --all --json` réussit.

**P0 — Dépendances production.** Préparer séparément une mise à jour contrôlée de Next et de ses dépendances transitives, avec vérification du déploiement réel. npm propose Next 16.4.3 ; ne pas conclure qu’une seule montée de version corrige chaque branche avant nouvel audit. L’avis Windows décrit une RCE non authentifiée ; l’avis SVG concerne notamment Linux glibc avec optimisation d’images. L’OS du poste de développement ne prouve pas celui de production. Sources : [avis Windows](https://github.com/advisories/GHSA-p293-qw3h-jr36), [avis SVG](https://github.com/advisories/GHSA-2464-fhr4-w9xw).

L’examen du dépôt ne trouve pas d’import `next/image`, `next/og`, de directive `use server`/`use cache` ni de rewrites applicatives ; `next.config.ts` est vide d’options. Le build produit des pages statiques, mais le script de production reste `next start` et aucun `output: export` n’est configuré : ne pas assimiler cela à une absence de serveur Next exposé. L’atteignabilité de chaque avis dépend de l’hébergement et des fonctionnalités actives ; elle n’a pas été testée par exploitation. Les autres lignes production et les outils méritent également une mise à jour planifiée, voir tableau et avis détaillés.

**P1 — Cohérence des contrôles.** Pour une étape autorisée ultérieure, définir un contrôle d’intégrité effectué sous le même verrou que les écritures, sans verrou imbriqué, et une distinction explicite entre opération active, conflit de version et journal abandonné. Ne pas simplement ignorer `pending`, réduire les vérifications ou convertir tout refus récupération en conflit. Exiger des tests déterministes inversés, une nouvelle observation du cas historique et des lectures cohérentes inter-onglets avant activation.

**P1 — Récupération.** Conserver l’état bloqué ; confirmer propriétaire et session ; attendre la fin/libération du verrou ; exporter un diagnostic cohérent et des copies indépendantes des sources/journal/ressources/JSON ; comparer octets et intégrité de chaque snapshot avant toute décision. Un retour à `beforeRaw` ou une finalisation du candidat doit faire l’objet d’une procédure séparée, explicitement confirmée, sous verrou et avec vérification de copie. Ne jamais effacer le journal ni marquer `verified` sur la seule présence d’un candidat.

**P2 — Outillage.** Planifier la mise à jour des branches ESLint/Babel/YAML/Zod et corriger séparément le passif ESLint. Garder les reproductions et l’instrumentation hors production ; collecter un nouvel échec spontané avec métadonnées s’il apparaît.

## Conditions avant activation

Activation déconseillée tant que les lectures concurrentes et les états de récupération ne sont pas clarifiés/corrigés avec une recette indépendante, que les dépendances critiques ne sont pas traitées et que la procédure manuelle de reprise n’est pas validée. Restent aussi les prérequis existants : migration explicitement attribuée au propriétaire, sauvegardes vérifiées, tests de session et d’échec, compatibilité JSON, absence de fallback historique et actions Ressources vers Prospects bloquées tant que les prospects restent partagés.

## Fichiers modifiés / ajoutés

- `tests/browser/resource-harness.mjs` : métadonnées expurgées, observation des vrais verrous, points d’arrêt de lecture et statuts de jobs.
- `tests/browser/resource-isolation.spec.mjs` : export des fixtures/helpers pour réutiliser les dix scénarios stricts existants.
- `tests/browser/resource-diagnostic.spec.mjs` : deux reproductions déterministes et quatre tests bornés à graines.
- `playwright.resource-diagnostic.config.mjs` : sorties D2 séparées, mêmes délais, sans retry.
- `tests/diagnostics/audit-dependencies.mjs` : audit en lecture seule et empreintes de préservation.
- `tests/diagnostics/inspect-first-race.mjs` : inspection non destructive de la première trace.
- `tests/diagnostics/dependency-report.mjs` : tableau, chaînes npm et avis à partir des preuves conservées.
- Ce rapport : conclusions, limites et inventaire npm ci-dessous.

## Audit des dépendances — inventaire reproductible

Sources : sorties brutes de `npm audit --json`, `npm audit --omit=dev --json` et `npm ls --all --json`, conservées dans `test-results/resource-diagnostic-97C-2B3D2/`. Les bornes hors plage ci-dessous sont des cibles à vérifier lors d’une future mise à jour contrôlée, pas des installations effectuées. La présence dans l’arbre production ne démontre pas une exposition HTTP.

| Paquet installé | Gravité max. | Nature / portée | Plage agrégée audit | Mise à jour possible | Impact potentiel |
|---|---|---|---|---|---|
| @babel/core 7.29.0 | low | Transitive / développement | <=7.29.0 | >7.29.0 via outils Babel/ESLint | Lecture de fichiers lors du traitement de sourcemaps non fiables par les outils. |
| baseline-browser-mapping 2.10.27 | moderate | Transitive / production (éventuellement aussi outils) | >=2.0.0 <2.11.0 | >=2.11.0 via Browserslist/Next | Arrêt du processus sur entrée invalide ; atteignabilité runtime à établir. |
| brace-expansion 5.0.5, 1.1.14 | high | Transitive / développement | <=1.1.20 \|\| 3.0.0 - 5.0.11 | >=1.1.21 et >=5.0.12 via minimatch/ESLint | Consommation CPU/mémoire sur motifs hostiles dans les outils. |
| browserslist 4.28.2 | high | Transitive / développement | <=4.28.6 | >4.28.6 via parent | Déni de service/cache illimité et traitement de statistiques hostiles ; outils. |
| js-yaml 4.1.1 | high | Transitive / développement | 4.0.0 - 4.3.1 | >=4.3.2 via ESLint | Déni de service lors du chargement YAML ; pas de chargement YAML métier identifié. |
| nanoid 3.3.12 | high | Transitive / production (éventuellement aussi outils) | <=3.3.17 | >=3.3.18 via PostCSS | Boucles infinies sur tailles invalides ; aucun appel métier nanoid identifié. |
| next 16.2.4 | critical | Directe / production (éventuellement aussi outils) | 9.3.4-canary.0 - 16.4.0 | npm propose 16.4.3 ; aligner eslint-config-next et revalider | RCE, contournements de contrôle, SSRF et DoS selon fonction/configuration/OS ; priorité critique. |
| postcss 8.5.14, 8.4.31 | high | Transitive / production (éventuellement aussi outils) | <=8.5.22 | >8.5.22 ; copie embarquée via Next 16.4.3 proposé | Lecture de fichiers via sourcemaps et XSS de sortie CSS ; surtout chaîne de compilation. |
| sharp 0.34.5 | high | Transitive / production (éventuellement aussi outils) | <=0.35.5-rc.1 | >=0.35.5 via Next 16.4.3 proposé | Traitement natif d’images hostiles : corruption mémoire selon codec et OS. |
| source-map-js 1.2.1 | high | Transitive / production (éventuellement aussi outils) | 1.0.0 - 1.2.1 | >=1.2.2 via PostCSS | Blocage du processus sur sourcemaps hostiles ; outils/compilation. |
| zod 4.4.3 | high | Transitive / développement | <4.6.6 | >=4.6.6 via eslint-config-next | Déni de service selon validation ; dépendance des outils ESLint, pas import métier identifié. |

### Chaînes installées et avis détaillés

Chaque ligne d’avis donne son identifiant, sa gravité et sa propre plage affectée ; les références de type paquet sont des vulnérabilités héritées, pas un nouvel avis. Les liens pointent vers les avis de sécurité.

#### @babel/core

- eslint-config-next@16.2.4 → eslint-plugin-react-hooks@7.1.1 → @babel/core@7.29.0
- eslint-config-next@16.2.4 → eslint-plugin-react-hooks@7.1.1 → @babel/core@7.29.0 → @babel/helper-module-transforms@7.28.6 → @babel/core@7.29.0

| Avis / vulnérabilité | Gravité | Versions concernées |
|---|---|---|
| [GHSA-4x5r-pxfx-6jf8](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8) — @babel/core: Arbitrary File Read via sourceMappingURL Comment | low | <=7.29.0 |

#### baseline-browser-mapping

- eslint-config-next@16.2.4 → eslint-plugin-react-hooks@7.1.1 → @babel/core@7.29.0 → @babel/helper-compilation-targets@7.28.6 → browserslist@4.28.2 → baseline-browser-mapping@2.10.27
- next@16.2.4 → baseline-browser-mapping@2.10.27

| Avis / vulnérabilité | Gravité | Versions concernées |
|---|---|---|
| [GHSA-w5vr-8v7q-w6rv](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv) — baseline-browser-mapping process termination on invalid input causes denial of service | moderate | >=2.0.0 <2.11.0 |

#### brace-expansion

- eslint-config-next@16.2.4 → typescript-eslint@8.59.2 → @typescript-eslint/typescript-estree@8.59.2 → minimatch@10.2.5 → brace-expansion@5.0.5
- eslint@9.39.4 → minimatch@3.1.5 → brace-expansion@1.1.14

| Avis / vulnérabilité | Gravité | Versions concernées |
|---|---|---|
| [GHSA-jxxr-4gwj-5jf2](https://github.com/advisories/GHSA-jxxr-4gwj-5jf2) — brace-expansion: Large numeric range defeats documented `max` DoS protection | moderate | >=5.0.0 <5.0.6 |
| [GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp) — brace-expansion: DoS via exponential-time expansion of consecutive non-expanding {} groups | high | <1.1.16 |
| [GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp) — brace-expansion: DoS via exponential-time expansion of consecutive non-expanding {} groups | high | >=3.0.0 <5.0.7 |
| [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) — brace-expansion: DoS via unbounded expansion length causing an out-of-memory process crash | high | <1.1.17 |
| [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) — brace-expansion: DoS via unbounded expansion length causing an out-of-memory process crash | high | >=4.0.0 <5.0.8 |
| [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895) — brace-expansion: DoS via unbounded intermediate arrays, bypassing the CVE-2026-14257 mitigation | high | >=4.0.0 <5.0.9 |
| [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895) — brace-expansion: DoS via unbounded intermediate arrays, bypassing the CVE-2026-14257 mitigation | high | <1.1.18 |
| [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) — brace-expansion: Quadratic-time expansion of the `{a},b}` rewrite causes CPU denial of service | moderate | <1.1.21 |
| [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) — brace-expansion: Quadratic-time expansion of the `{a},b}` rewrite causes CPU denial of service | moderate | >=4.0.0 <5.0.12 |
| [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) — brace-expansion: DoS via uncontrolled recursion on nested brace groups causing stack exhaustion | high | <1.1.20 |
| [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) — brace-expansion: DoS via uncontrolled recursion on nested brace groups causing stack exhaustion | high | >=4.0.0 <5.0.11 |
| [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) — brace-expansion: DoS via uncontrolled recursion in parseCommaParts causing stack exhaustion | high | <1.1.19 |
| [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) — brace-expansion: DoS via uncontrolled recursion in parseCommaParts causing stack exhaustion | high | >=4.0.0 <5.0.10 |

#### browserslist

- eslint-config-next@16.2.4 → eslint-plugin-react-hooks@7.1.1 → @babel/core@7.29.0 → @babel/helper-compilation-targets@7.28.6 → browserslist@4.28.2
- eslint-config-next@16.2.4 → eslint-plugin-react-hooks@7.1.1 → @babel/core@7.29.0 → @babel/helper-compilation-targets@7.28.6 → browserslist@4.28.2 → update-browserslist-db@1.2.3 → browserslist@4.28.2

| Avis / vulnérabilité | Gravité | Versions concernées |
|---|---|---|
| [GHSA-c83g-rgw3-j3cx](https://github.com/advisories/GHSA-c83g-rgw3-j3cx) — Browserslist: Unbounded memory growth (no cache eviction) via distinct query results, leading to eventual OOM | high | <=4.28.6 |
| [GHSA-73wf-gq98-2v4g](https://github.com/advisories/GHSA-73wf-gq98-2v4g) — Browserslist: Uncaught crash / prototype write via untrusted browserslist-stats.json custom stats (normalizeStats) | high | <=4.28.6 |

#### js-yaml

- eslint@9.39.4 → @eslint/eslintrc@3.3.5 → js-yaml@4.1.1

| Avis / vulnérabilité | Gravité | Versions concernées |
|---|---|---|
| [GHSA-h67p-54hq-rp68](https://github.com/advisories/GHSA-h67p-54hq-rp68) — JS-YAML: Quadratic-complexity DoS in merge key handling via repeated aliases | moderate | >=4.0.0 <=4.1.1 |
| [GHSA-52cp-r559-cp3m](https://github.com/advisories/GHSA-52cp-r559-cp3m) — js-yaml: YAML merge-key chains can force quadratic CPU consumption | high | >=4.0.0 <4.3.0 |
| [GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj) — JS-YAML: Quadratic CPU consumption in !!omap resolution (3.x and 4.x) — CVE-2026-59870 fix not backported | high | >=4.0.0 <4.3.1 |
| [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh) — js-yaml: maxTotalMergeKeys does not limit CPU use for empty merge sources | high | >=4.0.0 <4.3.2 |

#### nanoid

- @tailwindcss/postcss@4.2.4 → postcss@8.5.14 → nanoid@3.3.12
- next@16.2.4 → postcss@8.4.31 → nanoid@3.3.12

| Avis / vulnérabilité | Gravité | Versions concernées |
|---|---|---|
| [GHSA-28wg-ghj8-5hjv](https://github.com/advisories/GHSA-28wg-ghj8-5hjv) — nanoid: non-secure generators can loop indefinitely with negative size | high | <3.3.16 |
| [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8) — nanoid: custom generators can loop indefinitely when size is zero | high | <3.3.18 |

#### next

- next@16.2.4

| Avis / vulnérabilité | Gravité | Versions concernées |
|---|---|---|
| [GHSA-8h8q-6873-q5fj](https://github.com/advisories/GHSA-8h8q-6873-q5fj) — Next.js Vulnerable to Denial of Service with Server Components | high | >=16.0.0 <16.2.5 |
| [GHSA-26hh-7cqf-hhc6](https://github.com/advisories/GHSA-26hh-7cqf-hhc6) — Next.js has a Middleware / Proxy bypass in App Router applications via segment-prefetch routes - Incomplete Fix Follow-Up | high | >=16.0.0 <16.2.6 |
| [GHSA-3g8h-86w9-wvmq](https://github.com/advisories/GHSA-3g8h-86w9-wvmq) — Next.js's Middleware / Proxy redirects can be cache-poisoned | low | >=16.0.0 <16.2.5 |
| [GHSA-ffhc-5mcf-pf4q](https://github.com/advisories/GHSA-ffhc-5mcf-pf4q) — Next.js vulnerable to cross-site scripting in App Router applications using CSP nonces | moderate | >=16.0.0 <16.2.5 |
| [GHSA-vfv6-92ff-j949](https://github.com/advisories/GHSA-vfv6-92ff-j949) — Next.js vulnerable to cache poisoning via collisions in React Server Component cache-busting | low | >=16.0.0 <16.2.5 |
| [GHSA-gx5p-jg67-6x7h](https://github.com/advisories/GHSA-gx5p-jg67-6x7h) — Next.js has cross-site scripting in beforeInteractive scripts with untrusted input | moderate | >=16.0.0 <16.2.5 |
| [GHSA-mg66-mrh9-m8jx](https://github.com/advisories/GHSA-mg66-mrh9-m8jx) — Next.js vulnerable to Denial of Service via connection exhaustion in applications using Cache Components | high | >=16.0.0 <16.2.5 |
| [GHSA-h64f-5h5j-jqjh](https://github.com/advisories/GHSA-h64f-5h5j-jqjh) — Next.js has a Denial of Service in the Image Optimization API | moderate | >=16.0.0 <16.2.5 |
| [GHSA-c4j6-fc7j-m34r](https://github.com/advisories/GHSA-c4j6-fc7j-m34r) — Next.js vulnerable to server-side request forgery in applications using WebSocket upgrades | high | >=16.0.0 <16.2.5 |
| [GHSA-492v-c6pp-mqqv](https://github.com/advisories/GHSA-492v-c6pp-mqqv) — Next.js has a Middleware / Proxy bypass through dynamic route parameter injection | high | >=16.0.0 <16.2.5 |
| [GHSA-wfc6-r584-vfw7](https://github.com/advisories/GHSA-wfc6-r584-vfw7) — Next.js vulnerable to cache poisoning in React Server Component responses | moderate | >=16.0.0 <16.2.5 |
| [GHSA-267c-6grr-h53f](https://github.com/advisories/GHSA-267c-6grr-h53f) — Next.js has a Middleware / Proxy bypass in App Router applications via segment-prefetch routes | high | >=16.0.0 <16.2.5 |
| [GHSA-36qx-fr4f-26g5](https://github.com/advisories/GHSA-36qx-fr4f-26g5) — Next.js has a Middleware / Proxy bypass in Pages Router applications using i18n | high | >=16.0.0 <16.2.5 |
| [GHSA-6gpp-xcg3-4w24](https://github.com/advisories/GHSA-6gpp-xcg3-4w24) — Next.js: Middleware / Proxy bypass in App Router applications using Turbopack and single locale | high | >=16.0.0 <16.2.11 |
| [GHSA-m99w-x7hq-7vfj](https://github.com/advisories/GHSA-m99w-x7hq-7vfj) — Next.js: Denial of Service in App Router using Server Actions | high | >=16.0.0 <16.2.11 |
| [GHSA-89xv-2m56-2m9x](https://github.com/advisories/GHSA-89xv-2m56-2m9x) — Next.js: Server-Side Request Forgery in Server Actions on custom servers | high | >=16.0.0 <16.2.11 |
| [GHSA-68g3-v927-f742](https://github.com/advisories/GHSA-68g3-v927-f742) — Next.js: Cache confusion of response bodies for requests with bodies | moderate | >=16.0.0 <16.2.11 |
| [GHSA-4633-3j49-mh5q](https://github.com/advisories/GHSA-4633-3j49-mh5q) — Next.js: Cache confusion of response bodies for requests with bodies containing invalid UTF-8 byte sequences | moderate | >=16.0.0 <16.2.11 |
| [GHSA-4c39-4ccg-62r3](https://github.com/advisories/GHSA-4c39-4ccg-62r3) — Next.js: Unbounded Server Action payload in Edge runtime | moderate | >=16.0.0 <16.2.11 |
| [GHSA-p9j2-gv94-2wf4](https://github.com/advisories/GHSA-p9j2-gv94-2wf4) — Next.js: Server-Side Request Forgery in rewrites via attacker-controlled destination hostname | high | >=16.0.0 <16.2.11 |
| [GHSA-q8wf-6r8g-63ch](https://github.com/advisories/GHSA-q8wf-6r8g-63ch) — Next.js: Denial of Service in the Image Optimization API using SVGs | moderate | >=16.0.0 <16.2.11 |
| [GHSA-955p-x3mx-jcvp](https://github.com/advisories/GHSA-955p-x3mx-jcvp) — Next.js: Unauthenticated disclosure of internal Server Function endpoints | moderate | >=16.0.0 <16.2.11 |
| [GHSA-p293-qw3h-jr36](https://github.com/advisories/GHSA-p293-qw3h-jr36) — Next.js: Unauthenticated Remote Code Execution on windows-hosted servers | critical | >=16.0.0 <16.3.3 |
| [GHSA-2xp9-vwfh-vxw4](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4) — Next.js: Unauthenticated Remote Code Execution in Image Optimization API when AVIF files are used | critical | >=16.0.0 <16.3.3 |
| [GHSA-vcvr-r3jv-pc5j](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j) — Next.js: Remote Code Execution in next/og ImageResponse | critical | >=16.2.0 <16.3.6 |
| [GHSA-4jqv-mc3x-m676](https://github.com/advisories/GHSA-4jqv-mc3x-m676) — Next.js has cache poisoning of SSG and ISR pages in self-hosted applications | moderate | >=16.0.0 <16.3.8 |
| [GHSA-39w2-rjm5-chcv](https://github.com/advisories/GHSA-39w2-rjm5-chcv) — Next.js has information disclosure in development server's Model Context Protocol endpoint | low | >=16.0.0 <16.3.8 |
| [GHSA-f87g-xv8r-7p7x](https://github.com/advisories/GHSA-f87g-xv8r-7p7x) — Next.js has information disclosure in App Router metadata image routes via dynamicParams bypass | moderate | >=16.0.0 <16.3.8 |
| [GHSA-mcj8-r9mp-w47p](https://github.com/advisories/GHSA-mcj8-r9mp-w47p) — Next.js has cache poisoning in SSG/ISR rendering that leads to cross-user content substitution and persistent denial of service | moderate | >=16.0.0 <16.3.8 |
| [GHSA-cjq9-62q9-8jv4](https://github.com/advisories/GHSA-cjq9-62q9-8jv4) — Next.js has Server-Side Request Forgery in Image Optimization | high | >=16.0.0 <16.3.8 |
| [GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw) — Next.js: Unauthenticated Remote Code Execution in Image Optimization API when SVG files are used | critical | >=16.0.0 <=16.4.0 |
| [GHSA-p3m5-59mp-jv5r](https://github.com/advisories/GHSA-p3m5-59mp-jv5r) — Next.js: Denial of Service in App Router using Server Actions | high | >=16.0.0 <=16.4.0 |
| [GHSA-673q-mjm6-r5xr](https://github.com/advisories/GHSA-673q-mjm6-r5xr) — Next.js: Unauthenticated Remote Code Execution in `use cache` functions returning typed arrays | critical | >=16.0.0 <=16.4.0 |
| Héritée de postcss (voir sa section) | — | — |
| Héritée de sharp (voir sa section) | — | — |

#### postcss

- @tailwindcss/postcss@4.2.4 → postcss@8.5.14
- next@16.2.4 → postcss@8.4.31

| Avis / vulnérabilité | Gravité | Versions concernées |
|---|---|---|
| [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) — PostCSS has XSS via Unescaped </style> in its CSS Stringify Output | moderate | <8.5.10 |
| [GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q) — PostCSS: Arbitrary file read and information disclosure via attacker-controlled sourceMappingURL in CSS comments | high | <=8.5.11 |
| [GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp) — PostCSS: incomplete fix of GHSA-6g55-p6wh-862q — attacker-controlled sourceMappingURL reads arbitrary .map files when `from` is unset | moderate | <=8.5.22 |
| [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849) — PostCSS: Path Traversal in Previous Source Map Auto-Loading (sourceMappingURL) leads to Arbitrary .map File Disclosure | high | <=8.5.17 |

#### sharp

- next@16.2.4 → sharp@0.34.5

| Avis / vulnérabilité | Gravité | Versions concernées |
|---|---|---|
| [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) — sharp inherited vulnerabilities in libvips: CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591 | high | <0.35.0 |
| [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) — sharp: Vulnerabilities in libheif: GHSA-g89c-p67h-r497 and GHSA-2jg2-4ch7-h545 | high | <0.35.4 |
| [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) — sharp : Vulnerability in librsvg dependency CVE-2026-96889 | high | <0.35.5 |

#### source-map-js

- @tailwindcss/postcss@4.2.4 → @tailwindcss/node@4.2.4 → source-map-js@1.2.1
- @tailwindcss/postcss@4.2.4 → postcss@8.5.14 → source-map-js@1.2.1
- next@16.2.4 → postcss@8.4.31 → source-map-js@1.2.1

| Avis / vulnérabilité | Gravité | Versions concernées |
|---|---|---|
| [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) — source-map-js allows event-loop denial of service through indexed source-map section offsets | high | >=1.0.0 <1.2.2 |

#### zod

- eslint-config-next@16.2.4 → eslint-plugin-react-hooks@7.1.1 → zod-validation-error@4.0.2 → zod@4.4.3
- eslint-config-next@16.2.4 → eslint-plugin-react-hooks@7.1.1 → zod@4.4.3

| Avis / vulnérabilité | Gravité | Versions concernées |
|---|---|---|
| [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) — Zod can exhaust memory while validating oversized constrained collections | high | <4.6.6 |
