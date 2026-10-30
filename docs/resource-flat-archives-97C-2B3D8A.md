# 97C-2B3D8A — Suppression de l’auto-imbrication Ressources

30 octobre 2026. Correction du format actif, sans activation des Ressources isolées ni du cloud. Données exclusivement fictives, stockages en mémoire ou profils navigateur sous préfixes de recette. Aucun appel Supabase, aucune intervention sur les données réelles.

## Cause exacte et reproduction

Le test `node --test tests/resource-storage-growth-audit.test.mjs` a été exécuté **avant modification** : il reproduisait des remplacements successifs, une profondeur historique supérieure ou égale à deux puis un refus sous budget de 8 Mio, sans altération du stockage après ce refus.

Le rapport D7 contient la reproduction navigateur initiale : une ressource de 180 octets, un journal estimé à **4 480 034 octets UTF-16 après quatre remplacements**, puis refus du cinquième remplacement.

La boucle exacte était :

1. `exportResourceRecoveryDiagnostic` capture le journal complet dans `rawJournal`.
2. `preview` place ce diagnostic dans `safetyJson.recoveryDiagnostic`, avec une autre représentation des ressources.
3. `coordinateResourceWrite` ajoute **les deux chaînes** `diagnosticJson` et `safetyJson` au journal suivant, qui contient déjà les entrées précédentes. Les mêmes journaux sont donc réintroduits, avec un nouvel échappement JSON à chaque génération.
4. Une récupération réinjectait également le diagnostic complet dans son entrée. `stagedRaw` doublait en outre le candidat déjà conservé dans `candidateRaw`.

Ce n’était pas un cycle d’objets JavaScript : tous les JSON étaient finis. C’était une répétition récursive de l’historique sérialisé.

## Nouveau format actif

- Les ressources courantes restent dans leur clé métier existante.
- Chaque nouvelle entrée porte `archiveVersion: 2`, le propriétaire, l’identifiant, la date, le type d’opération et la provenance.
- Les copies indépendantes `beforeRaw` et `candidateRaw` conservent leurs octets exacts. `fingerprints` contient leurs SHA-256 ; `null` reste une absence explicite. La récupération continue de proposer ces copies, sans dépendre d’un ancien diagnostic embarqué.
- `receipts` conserve uniquement propriétaire, version, empreinte SHA-256 et taille de la sauvegarde/du diagnostic préalablement relus. Aucun document complet, journal précédent ou `stagedRaw` n’est réinjecté dans une nouvelle entrée.
- La sauvegarde préalable d’un remplacement contient la version précédente, son empreinte et un reçu du diagnostic. Elle n’embarque plus le journal. L’enveloppe Ressources v5 reste lisible ; `archiveVersion: 2` distingue le nouveau document de sécurité. Une empreinte ou une version inconnue est refusée à la lecture.
- Les deux versions métier sont conservées par opération pour que chaque entrée soit récupérable indépendamment. La suppression concerne les documents historiques répétés et la troisième copie `stagedRaw` ; ce n’est pas une politique de suppression des versions métier.
- Les diagnostics forensiques restent des exports explicites du stockage observé, incluant les octets historiques. **Ils ne sont jamais réinsérés dans les nouvelles entrées**, y compris lors d’une récupération.

Le SHA-256 synchrone permet de vérifier les copies dans les lectures synchrones sous verrou. Les vecteurs de test sont comparés à `node:crypto`, indépendamment de l’implémentation applicative. Une empreinte détecte une altération ; elle n’est pas une signature contre un script de même origine capable de recalculer l’empreinte.

## Protections et anciens formats

Le coordinateur Web Locks commun, son nom par propriétaire, les permis d’écriture révocables et les contrôles de session restent utilisés. Les confirmations, la relecture exacte du fichier préalable et la comparaison de tout l’état de l’aperçu avant écriture restent obligatoires. Les lectures/exportations restent coordonnées avec les écritures.

Les anciennes entrées restent lues par leurs validateurs historiques. L’ajout d’une entrée n’effectue plus une resérialisation des anciennes entrées : il insère le nouveau JSON avant le crochet final du tableau existant. Les octets, espaces, archives imbriquées et diagnostics des anciennes entrées sont préservés. Aucune suppression, migration automatique, compression ou conversion de ces archives.

Un test construit une ancienne entrée avec diagnostic et sauvegarde imbriqués, vérifie sa lecture, effectue un remplacement, compare son préfixe brut et son contenu exact, puis corrompt son ancienne sauvegarde et vérifie le refus sans mutation. Les tests de récupération utilisent également des journaux historiques interrompus.

La lecture des documents externes et des journaux est plafonnée à **16 777 216 caractères JavaScript par document** avant `JSON.parse`. Les chaînes historiques ne sont pas parcourues récursivement. Les journaux trop grands ou illisibles, versions inconnues, empreintes incohérentes, propriétaires incorrects et nouveaux champs d’archives interdits sont refusés ; leurs octets restent conservés. Ce plafond est une limite de lecture, pas une réservation de quota ni un mécanisme de récupération sous quota.

## Mesures après chaque remplacement

Google Chrome **156.0.8078.49**, vrai localStorage et Web Locks natifs, interface React, sauvegarde téléchargée puis relue à chaque opération. **20 succès sur 20**, profondeur de journal imbriqué **0 à chaque ligne**.

Journal et total : estimation UTF-16, deux octets par unité de chaîne JavaScript. Le total inclut les noms physiques préfixés et les valeurs du profil fictif, sans le surcoût interne de Chrome. Fichier : vrais octets UTF-8 sur disque.

| Remplacement | Journal UTF-16 estimé | Total clés + valeurs UTF-16 estimé | Sauvegarde préalable UTF-8 |
|---:|---:|---:|---:|
| 0, migration | 1 162 | 6 194 | — |
| 1 | 3 610 | 8 630 | 1 071 |
| 2 | 6 052 | 11 072 | 1 065 |
| 3 | 8 496 | 13 516 | 1 066 |
| 4 | 10 940 | 15 960 | 1 066 |
| 5 | 13 384 | 18 404 | 1 066 |
| 6 | 15 828 | 20 848 | 1 066 |
| 7 | 18 272 | 23 292 | 1 066 |
| 8 | 20 716 | 25 736 | 1 066 |
| 9 | 23 160 | 28 180 | 1 066 |
| 10 | 25 610 | 30 636 | 1 066 |
| 11 | 28 066 | 33 092 | 1 072 |
| 12 | 30 522 | 35 548 | 1 072 |
| 13 | 32 978 | 38 004 | 1 072 |
| 14 | 35 434 | 40 460 | 1 072 |
| 15 | 37 890 | 42 916 | 1 072 |
| 16 | 40 346 | 45 372 | 1 072 |
| 17 | 42 802 | 47 828 | 1 072 |
| 18 | 45 258 | 50 284 | 1 072 |
| 19 | 47 714 | 52 740 | 1 072 |
| 20 | 50 170 | 55 196 | 1 072 |

L’accroissement du journal est de **2 442 à 2 456 octets estimés par remplacement**, après le premier. Les changements mineurs de taille proviennent notamment des identifiants `round-10`, etc. Les fichiers préalables restent autour de 1,07 Ko : leur taille ne dépend plus du nombre de journaux précédents. À quatre remplacements : 10 940 octets de journal, contre 4 480 034 dans D7. La croissance demeure proportionnelle aux versions métier conservées ; elle n’est pas constante en nombre d’opérations.

La campagne unitaire indépendante effectue aussi 20 remplacements, vérifie les empreintes et impose un accroissement inférieur à 2 600 octets par opération dans son jeu fictif. La recette navigateur impose moins de 3 000 octets par opération après la première. Les comptes B et les clés historiques fictives restent inchangés.

Preuves générées : `test-results/resource-flat-archive/unit-growth.json`, `growth-summary.json`, `browser-results.json` et pièces jointes Playwright `growth-measurements.json` / `chain-evidence.json`. Ces fichiers de test ne font pas partie des données applicatives.

## Vérifications

| Commande | Résultat |
|---|---|
| `node --test tests/*.test.mjs tests/cloud-sync-suspension.cjs` | 19/19 fichiers réussis |
| `npm run test:browser -- --config=playwright.resource-flat-archive.config.mjs` | 40/40 réussis, sans retry |
| `node node_modules/typescript/bin/tsc --noEmit` | Réussi |
| ESLint ciblé sur les quatre modules applicatifs, les tests/bancs modifiés et la nouvelle configuration | Réussi ; avertissement initial d’export anonyme de configuration corrigé |
| `npm run build` | Réussi, Next.js 16.4.3, 20 pages |

Sont exercés : deux onglets indépendants (un succès et un conflit), attente sous verrou puis changement de compte, expiration, interruptions aux quatre écritures avant/après persistance dans les unités, rafraîchissement navigateur pendant interruption, corruption, lecture impossible, absence de Web Locks, récupération exacte de la version précédente, copie vide volontaire, quota avant et après journal. Les échecs conservent les ressources précédentes dans la destination ou dans les copies journalisées selon la phase de l’interruption.

Échecs rencontrés pendant l’itération : les bancs devaient autoriser le nouveau module et les assertions devaient vérifier les reçus au lieu des documents supprimés. Un passage intermédiaire a aussi échoué pour la graine de concurrence 73 : refus « récupération nécessaire » au lieu du conflit attendu. Sans changer cette assertion ni ajouter de retry, les deux passages complets suivants ont réussi à 40/40. Cette observation intermittente reste à surveiller ; aucun écrasement silencieux n’a été observé.

## Fichiers corrigés

- `app/lib/resourceArchiveIntegrity.ts` : empreintes, reçus, validation du format plat et lecture bornée.
- `app/lib/resourceWriteCoordinator.ts` : nouvelles entrées plates, vérification des copies, conservation brute des anciennes entrées ; même coordinateur et même ordre d’écriture.
- `app/lib/resourceRecoveryAssessment.ts` : validation conjointe des formats historiques et nouveaux, intégrité des copies et éligibilité à la récupération.
- `app/lib/resourceBackupJson.ts` : sauvegarde préalable sans historique embarqué, empreinte de la version précédente, validation de lecture.
- `tests/resource-json-replacement.test.mjs`, `resource-manual-recovery.test.mjs`, `resource-storage-growth-audit.test.mjs` : reçus, intégrité, anciens formats, conservation et 20 remplacements.
- `tests/browser/resource-chain-server.mjs`, `resource-harness-server.mjs` : autorisation du module d’intégrité dans les bundles fictifs fermés.
- `tests/browser/resource-chain.spec.mjs`, `resource-json-replacement.spec.mjs`, `resource-manual-recovery.spec.mjs`, `resource-final-audit.spec.mjs` : preuves par empreintes, campagnes et mesures.
- `tests/helpers/resourceStorageMetrics.mjs` : distinction des anciennes archives et nouveaux reçus lors des mesures.
- `playwright.resource-flat-archive.config.mjs` : sorties dédiées à cette étape.

## Limites restantes

- **D7-02 reste ouvert** : la récupération nécessite encore une nouvelle entrée de journal. Le test sous quota après journal vérifie toujours son refus avec conservation exacte de l’état. Aucune nouvelle politique de réserve, préallocation, nettoyage ou récupération à faible coût d’écriture.
- localStorage reste non transactionnel entre clés ; le journal et le marqueur permettent le diagnostic d’une interruption. Les copies ne garantissent pas la survie à une perte/éviction physique du profil.
- L’historique est conservé intégralement et croît linéairement avec les données et les opérations. Les anciens journaux déjà volumineux ne sont pas réduits. Le quota reste partagé par l’origine.
- L’export de diagnostic forensique conserve les archives historiques telles quelles ; il peut donc rester volumineux. Il n’est plus réinjecté dans le stockage actif.
- Validation navigateur limitée à Chrome avec sessions fictives ; pas de recette d’authentification distante, Firefox ou Safari.
- `ACCOUNT_SCOPED_RESOURCES_ENABLED`, `RESOURCE_JSON_REPLACEMENT_ENABLED` et `MANUAL_RESOURCE_RECOVERY_ENABLED` restent `false`. `CLOUD_SYNC_SUSPENDED` reste `true`. Aucun fichier Supabase, paramètre de connexion ou donnée réelle modifié. Aucune autorisation d’activation ne découle de cette correction.
