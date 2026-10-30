# 97C-2B3D9 — Recette finale V2 du stockage Ressources isolé

30 octobre 2026. **Décision : NO-GO pour un pilote contrôlé dans le périmètre demandé.**

La chaîne v2 réussit les scénarios de comptes, de concurrence, de remplacement et de quota. Un critère obligatoire échoue toutefois : une ancienne copie sans empreinte SHA-256 persistée peut être restaurée après les confirmations ordinaires. L’export certifié de cette même copie est correctement refusé. Cette différence entre les deux contrôles d’intégrité interdit de conclure à un GO global.

Aucun correctif applicatif n’est effectué pendant cette recette. Les nouveaux tests expriment le refus requis et restent en échec ; ils ne sont ni ignorés, ni déclarés `expected-failure`, ni assouplis.

## Périmètre et preuves de sécurité

- Code applicatif et configuration de production **inchangés** : SHA-256 identiques avant/après pour les **75 fichiers** suivis par la recette, comprenant `app/`, manifeste de dépendances, lockfile, configuration Next et instructions du dépôt.
- `ACCOUNT_SCOPED_RESOURCES_ENABLED = false`, `RESOURCE_JSON_REPLACEMENT_ENABLED = false`, `MANUAL_RESOURCE_RECOVERY_ENABLED = false`, `CLOUD_SYNC_SUSPENDED = true`.
- Aucun compte réel, aucune donnée réelle, aucun accès Supabase production, aucune migration réelle. Les tests utilisent des comptes UUID fictifs, des domaines `example.invalid`, des Maps ou des profils Chrome jetables avec clés préfixées par scénario.
- Les serveurs de recette sont les serveurs autonomes existants. Ils n’importent pas le SDK de production ; les requêtes externes sont interdites. Les 25 pièces de chaîne React du passage complet ne rapportent aucune requête bloquée tentée ni erreur JavaScript ; les pièces des scénarios à deux onglets attestent également l’absence de requête externe.
- **Vrai Google Chrome 156.0.8078.49**, piloté par Playwright en mode headless. Les scénarios de concurrence utilisent deux pages/onglets réels de la même origine et Web Locks natif. Les sessions sont synthétiques : ce n’est pas une validation d’authentification distante.
- Aucune route de test Next créée. Le manifeste de build ne contient que les routes applicatives et techniques attendues. **438 fichiers** de `.next/server` et `.next/static` inspectés : aucune occurrence des six marqueurs de banc recherchés (`chainRecipe`, `resourceHarness`, préfixes fictifs, remplissage quota et assertion critique D9).
- Aucun ancien journal ni ancienne preuve D7/D8 supprimé ou converti. Les nouveaux résultats sont écrits dans `test-results/resource-final-v2/`.

## Vérifications exécutées

| Commande / contrôle | Résultat |
|---|---|
| `node --test tests/*.test.mjs tests/cloud-sync-suspension.cjs` | **20/21 fichiers réussis, 1 échec bloquant D9-01** ; les 20 fichiers antérieurs passent |
| `npm run test:browser -- --config=playwright.resource-final-v2.config.mjs` | **46/47 tests réussis, 1 échec bloquant D9-01**, aucun retry, aucun test ignoré |
| Même configuration avec `CRM_RESOURCE_AUDIT_MODE=concurrency` | **90/90 réussis**, neuf scénarios répétés dix fois, aucun retry ni test intermittent observé |
| `node tests/helpers/runResourceFinalV2Node.mjs` | **30/30 passages réussis** du test existant du coordinateur et des Web Locks natifs Node entre threads |
| `node tests/helpers/auditResourceRetention.mjs` | Réussi : mesures sur trois volumes fictifs, conservation exacte au refus de quota, empreintes indépendamment vérifiées avec `node:crypto` |
| `node node_modules/typescript/bin/tsc --noEmit` | Réussi |
| ESLint ciblé sur les nouveaux fichiers et les modules/bancs audités | Réussi sans avertissement ; le collecteur ajouté ensuite a également été vérifié |
| `npm run build` | Réussi, Next.js 16.4.3, 20 pages générées |
| Collecte des empreintes source et inspection du build | Réussi : source inchangée, aucun marqueur de test dans les sorties contrôlées |

Le passage Chrome complet dure environ 87 secondes ; la campagne de concurrence environ 157 secondes. Ces durées incluent l’instrumentation et ne constituent pas un benchmark de production.

## Résultats des scénarios obligatoires

| Scénario | Résultat et observation |
|---|---|
| Migration manuelle A | Réussie après aperçu, fichier JSON préalable téléchargé/relu et attribution explicite au compte A ; copies vérifiées, sources historiques conservées |
| Initialisation B sans ressource | Réussie après confirmation de B et demande volontaire de `[]` ; aucune reprise de l’historique A ni faux marqueur de migration |
| Ajout, modification, suppression A et B | Réussis via les vrais composants React ; versions antérieures journalisées, clés historiques conservées |
| Déconnexion, A → B → A | Cartes masquées à la déconnexion, données propres à chaque compte au retour ; aucun mélange observé |
| Sauvegarde et remplacement JSON volontaire | Réussis avec aperçu, fichier exact relu et confirmations séparées ; liste vide volontaire également testée |
| Sauvegarde d’un autre propriétaire / sans propriétaire | Refus sans changement de destination ; JSON invalide également refusé |
| Vingt remplacements successifs | **20/20**, profondeur d’historique embarqué **0 à chaque étape** et accroissement linéaire |
| Deux onglets écrivent simultanément | Un succès et un conflit obligatoires ; aucun écrasement silencieux dans le passage complet et les répétitions |
| Deux onglets initialisent B | Un succès et un refus, aucun remplacement d’un état déjà initialisé |
| Deux aperçus de remplacement | Un remplacement et un conflit ; l’aperçu périmé ne peut pas être réutilisé |
| Import interrompu puis récupération v2 | Diagnostic d’interruption, écritures ordinaires bloquées, sauvegarde préalable relue, confirmations et retour exact à la version précédente avec espace suffisant |
| Interruption de récupération puis rafraîchissement | Nouvelle intervention manuelle requise, copies et journaux conservés ; aucun redémarrage automatique |
| Quota presque plein puis saturé | Refus contrôlé, copies conservées ; récupération par écriture bloquée si l’estimation est insuffisante ou inconnue |
| Export sans écriture locale sous quota saturé | Réussi : propriétaire et SHA-256 vérifiés, téléchargement puis relecture exacte ; stockage inchangé |
| Copie v2 corrompue | Refus sans mutation supplémentaire, y compris pour un JSON encore structurellement valide |
| Copie ancienne sans empreinte persistée | **ÉCHEC D9-01 : export certifié refusé, mais restauration acceptée** après sauvegarde du diagnostic et confirmations |
| Conservation des anciennes copies et journaux | Vérifiée après remplacements, interruptions et récupération ; l’ancienne entrée reste même conservée dans le scénario D9-01, ce qui ne rend pas sa restauration admissible |
| Web Locks indisponible | Refus sécurisé pour lecture/écriture/export concernés ; aucun verrou localStorage de substitution |
| Session périmée / compte changé pendant attente | Anciens handles, export, relecture et récupération refusés ; anciennes ressources conservées |
| Ressources vers Prospects historiques | Commandes d’historique et de relance restent bloquées ; pas d’écriture vers ces données partagées |

Les assertions et scénarios existants sont réutilisés sans modification. Les nouveaux contrôles portent sur le critère de refus des copies anciennes sans intégrité vérifiable.

## D9-01 — Restauration d’une copie sans intégrité historique vérifiable

**Sévérité : bloquante pour le périmètre de cette recette. Reproduction en mémoire et dans Chrome. Aucun correctif appliqué.**

Reproduction fictive :

1. Compte A confirmé, ressources courantes valides et espace suffisant.
2. Ancien journal attribué à A, opération `pending`, copie `beforeRaw` structurellement valide, mais sans `archiveVersion: 2` ni `fingerprints`. Son contenu ne dispose d’aucune référence SHA-256 persistée.
3. Aperçu de récupération accepté. Le diagnostic complet est enregistré/relu et les confirmations de propriétaire et de récupération sont données.
4. L’export certifié de cette copie est refusé pour absence d’empreinte, comme attendu.
5. La récupération par écriture est pourtant annoncée réussie : **quatre écritures** dans le test mémoire, ressources remplacées par la copie sans empreinte, marqueur final `verified`. Chrome reproduit le succès au lieu du refus attendu. Les données de B et l’ancienne entrée restent conservées.

Le fichier de sauvegarde diagnostique relu prouve les octets observés au moment de l’aperçu. Il ne prouve pas que la copie historique n’a jamais été altérée avant cet aperçu. Une structure valide et un propriétaire confirmé ne remplacent pas une référence d’intégrité historique.

Mécanisme dans les sources inchangées :

- `app/lib/resourceRecoveryAssessment.ts:107` : `recoverableResourceCopies` accepte les formats historiques après contrôles de structure/propriétaire ; ces formats ne possèdent pas tous des empreintes.
- `app/lib/resourceWriteCoordinator.ts:156` : la récupération accepte une copie dès qu’elle figure dans cette liste et que ses octets correspondent au candidat sélectionné. Il n’existe pas ici de condition équivalente à celle de l’export imposant une empreinte persistée.
- `app/lib/resourceBackupJson.ts:246` : `exportRecoveryCopy` exige au contraire une entrée v2 et une empreinte persistée correspondante. Son refus est vérifié par le nouveau test mémoire.

Le résultat n’est pas présenté comme un mélange de comptes ni comme une perte des copies : il s’agit d’une **acceptation de restauration contraire au critère d’intégrité demandé**. Les anciens tests de récupération historique validaient ce comportement de compatibilité ; ils continuent donc de passer. Le nouveau critère D9 révèle l’écart que ces tests ne couvraient pas.

Preuves : `legacy-integrity-unit.json`, pièce Playwright `legacy-integrity-browser.json`, screenshots et trace de l’échec. Les deux nouveaux tests doivent rester rouges jusqu’à une correction explicitement revue. Ne pas contourner le problème en supprimant les anciennes entrées, en leur attribuant automatiquement une empreinte actuelle ou en assouplissant l’assertion.

## Reproductibilité et intermittence

### Web Locks Node

Environnement observé : **Node v25.9.0**, Windows. Le test natif existant a été réexécuté dans **30 processus indépendants**, successivement, avec ses assertions intactes : **30 réussites**. Chaque passage inclut le contrôle de deux workers partageant un compteur et un verrou natif. Les logs individuels et les versions exactes sont conservés dans `node-repetitions/`.

L’intermittence documentée en D8B n’a donc pas été reproduite dans cette campagne. Cela ne prouve ni sa disparition ni une cause dans Node : aucune cause nouvelle n’est attribuée sans preuve. Ce test utilise une primitive Node entre threads, tandis que l’application navigateur utilise `navigator.locks`. Aucune modification du test ni remplacement de la primitive par un verrou simulé.

### Chrome, deux onglets

Neuf scénarios existants sont répétés dix fois : écriture concurrente, quatre graines de trois ordonnancements chacune, récupération concurrente, initialisation B, remplacement JSON et export sous quota suivi de récupération concurrente.

**90/90 tests réussis**, zéro retry, zéro échec intermittent observé. Les graines sont 7, 19, 73 et 103. La campagne comprend notamment 120 ordonnancements de la série à graines, en plus des 50 répétitions des cinq autres scénarios. Chaque contexte utilise des données et profils fictifs neufs.

L’ancienne alerte de concurrence observée en D8A n’a pas été reproduite. Les résultats renforcent la confiance sur les scénarios exécutés ; ils ne prouvent pas l’exclusion de tout ordonnancement possible ni la sûreté de scripts tiers qui ignoreraient le coordinateur.

## Consommation après les vingt remplacements Chrome

Journal et total : **octets UTF-16 estimés**, deux octets par unité de chaîne JavaScript. Le total inclut les noms physiques préfixés et les valeurs du profil fictif ; il exclut le surcoût interne du navigateur. Fichier préalable : vrais octets UTF-8 téléchargés sur disque. Profondeur d’historique imbriqué : **0 à toutes les lignes**.

| Remplacement | Journal estimé | Total estimé | Fichier préalable UTF-8 |
|---:|---:|---:|---:|
| 0, migration | 1 162 | 6 194 | — |
| 1 | 3 610 | 8 630 | 1 071 |
| 2 | 6 054 | 11 074 | 1 066 |
| 3 | 8 498 | 13 518 | 1 066 |
| 4 | 10 942 | 15 962 | 1 066 |
| 5 | 13 386 | 18 406 | 1 066 |
| 6 | 15 830 | 20 850 | 1 066 |
| 7 | 18 274 | 23 294 | 1 066 |
| 8 | 20 718 | 25 738 | 1 066 |
| 9 | 23 162 | 28 182 | 1 066 |
| 10 | 25 612 | 30 638 | 1 066 |
| 11 | 28 068 | 33 094 | 1 072 |
| 12 | 30 524 | 35 550 | 1 072 |
| 13 | 32 980 | 38 006 | 1 072 |
| 14 | 35 436 | 40 462 | 1 072 |
| 15 | 37 892 | 42 918 | 1 072 |
| 16 | 40 348 | 45 374 | 1 072 |
| 17 | 42 804 | 47 830 | 1 072 |
| 18 | 45 260 | 50 286 | 1 072 |
| 19 | 47 716 | 52 742 | 1 072 |
| 20 | 50 172 | 55 198 | 1 072 |

Après le premier remplacement, l’accroissement du journal reste entre **2 444 et 2 456 octets** par opération ; les fichiers préalables restent voisins de 1,07 Ko. Les ressources courantes de ce petit jeu font environ 180 octets UTF-8, avec une légère variation de longueur des identifiants. Aucune croissance récursive observée.

Le signal historique `excessiveGrowthObserved` du banc peut rester vrai : il compare le journal à cent fois les seules ressources courantes. Ce ratio est un signal de volume, pas un détecteur de récursion. La profondeur nulle, les incréments et les tailles réellement téléchargées sont les preuves utilisées ici ; aucun indicateur n’a été silencieusement corrigé pour rendre le résultat favorable.

### Quota presque plein et réellement saturé

- Budget fictif égal aux **8 752 octets estimés occupés**, puis budget augmenté de **512 octets** seulement : trois copies proposées sont exportées et relues, sans écriture locale. Le snapshot complet reste identique ; récupération par écriture bloquée.
- Saturation native de Chrome avec une unique clé fictive de remplissage, dans le profil jetable : **21 refus natifs `QuotaExceededError`**, jusqu’au refus d’ajouter un caractère supplémentaire. Consommation totale estimée **10 485 760 octets UTF-16** ; remplissage de **5 238 431 caractères**. Ce chiffre décrit cette expérience, pas un quota universel.
- Une copie saine est exportée et relue sous cette saturation. SHA-256 du snapshot intégral avant/après identique : `e0a06888ef05f64f1206ff7984b62d014c5de93071c5d0e55bbe1192f06881a8`.
- Les tests unitaires rejouent aussi un quota réel injecté aux quatre phases malgré une estimation initialement favorable. Un refus avant mutation conserve le stockage complet ; une interruption après une écriture réussie peut laisser un journal/marqueur partiel, mais les versions précédentes restent conservées. Aucune garantie de rollback multi-clés n’est annoncée.

### Rétention et risque de saturation à long terme

Mesure supplémentaire avec les vrais modules applicatifs, stockage fictif en mémoire limité à **4 194 304 octets UTF-16 estimés**, et tailles de contenu constantes par série. Toutes les empreintes des copies de toutes les étapes réussies sont comparées à `node:crypto`. Comptes B et clés historiques fictives inchangés.

| Notes par version | Remplacements réussis | Journal final | Total final | Refus |
|---:|---:|---:|---:|---|
| 0 caractère | 20 | 49 518 | 51 678 | Aucun en 20 opérations |
| 1 024 caractères | 20 | 131 454 | 135 662 | Aucun en 20 opérations |
| 65 536 caractères | 15 | 3 969 414 | 4 102 646 | **16e remplacement**, stockage exactement inchangé |

Ces séries diffèrent du jeu navigateur : ne pas confondre leurs volumes absolus. Elles démontrent qu’une croissance linéaire peut néanmoins saturer rapidement le stockage avec des versions plus volumineuses. Aucun nettoyage automatique n’existe. Les copies avant/après sont conservées par opération, le quota est partagé par l’origine et la réserve prudente utilisée pour une récupération n’est pas une réservation de capacité par le navigateur.

Une politique future de rétention/archivage exige une étape dédiée, une preuve de conservation vérifiée hors profil et une décision explicite. Cette recette n’autorise aucune suppression de journaux, même sous quota atteint.

## Risques résiduels

1. **D9-01 : intégrité insuffisante du chemin de restauration historique.** Bloquant tant qu’un refus n’est pas imposé au point d’écriture ou qu’une procédure distincte de validation historique explicitement autorisée n’est pas conçue et testée.
2. localStorage n’est pas transactionnel entre clés. Les relectures et verrous ne garantissent ni la durabilité physique ni la survie à une éviction du profil. Une interruption tardive peut laisser un état nécessitant une nouvelle intervention.
3. Le contrôle d’espace utilise un budget prudent de 4 Mio et une réserve de 64 Kio ; une estimation favorable ne réserve rien. Un autre compte, onglet ou script de la même origine peut consommer le quota. L’export externe reste la sortie sûre quand l’écriture est impossible.
4. La rétention intégrale continue de croître. Les mesures à 64 Kio montrent un refus au 16e remplacement sous le budget étudié ; aucun nombre universel de remplacements sûrs ne peut être promis. L’accumulation des diagnostics téléchargés occupe aussi le disque externe au profil.
5. Le coût de vérification et de capture dépend du volume du journal. La consommation du tas JavaScript et les performances à très grand historique ne sont pas profilées ici.
6. Les empreintes ne sont pas des signatures contre un script de même origine capable de modifier contenu et empreinte. L’isolation est applicative ; elle ne protège pas contre tout script exécuté sur l’origine.
7. L’authentification distante, les transitions réelles du service d’identité et l’intégration déployée restent à valider dans un environnement dédié. La recette utilise React et les modules réels dans des serveurs autonomes, avec identité fictive ; un build réussi ne remplace pas cette validation.
8. Firefox, Safari, les modes privés, l’éviction automatique, l’erreur disque et le passage entre origines ne sont pas validés. Le refus sans Web Locks est testé, pas un mode de remplacement compatible avec tous les navigateurs.
9. L’intermittence Node et l’ancien signal de concurrence Chrome ne sont pas reproduits dans les répétitions présentes ; ils restent documentés. Une campagne finie ne démontre pas leur impossibilité.

## Conditions exactes avant toute activation d’un pilote

Les conditions ci-dessous sont **cumulatives**. Ce rapport ne donne aucune instruction d’activation immédiate.

1. Traiter D9-01 dans une étape de correction explicitement autorisée. Une simple structure valide, une nouvelle empreinte calculée à l’instant de restauration ou un diagnostic juste relu ne doivent pas certifier rétroactivement une copie historique. Conserver les archives originales ; ne pas contourner le refus en les supprimant ou en les convertissant automatiquement.
2. Obtenir ensuite **21/21 fichiers unitaires et 47/47 tests Chrome réussis**, y compris les deux nouveaux contrôles d’intégrité, sans `skip`, `expected-failure` ni retry masquant une anomalie. Rejouer les 90 tests de concurrence avec leurs assertions inchangées et documenter toute nouvelle intermittence.
3. Définir et valider le traitement des anciennes archives du périmètre pilote : une copie sans preuve d’intégrité ne doit pas devenir sélectionnable pour une restauration ordinaire. Toute expertise historique doit avoir ses propres preuves de propriétaire/intégrité et une procédure distincte approuvée ; la lecture forensique seule reste possible sans migration automatique.
4. Valider l’application déployée avec authentification confirmée dans un environnement **dédié au pilote**, distinct de Supabase production pour cette validation. Vérifier A/déconnexion/B/A, expiration, renouvellement, compte changé pendant attente, réinitialisation des formulaires et masquage immédiat des anciennes données. Ne pas se limiter au service d’identité fictif du banc.
5. Restreindre réellement l’environnement à la cohorte autorisée et au navigateur supporté, ici Chrome avec Web Locks. Le commutateur actuel est global : une simple modification à `true` dans une instance partagée ne constitue pas à elle seule un mécanisme de sélection d’une cohorte pilote.
6. Pour chaque compte admis : export indépendant conservé et relu, attribution manuelle certaine des ressources historiques au bon `user.id`, migration complète vérifiée **ou** initialisation explicite d’une liste vide pour un compte neuf. Vérifier marqueurs, propriétaire, empreintes, distinction absent/vide et modifications historiques intervenues depuis la copie. Ne pas activer implicitement les autres catégories métier.
7. Vérifier l’occupation de l’origine et le parcours d’export/restauration avec les volumes réels prévus pour le pilote dans son environnement dédié. Refuser l’écriture si l’espace est insuffisant ou inconnu ; conserver un protocole opérationnel d’export/relecture hors profil. Ne pas garantir une récupération par écriture sous saturation et ne pas ajouter un nettoyage implicite pour faire entrer les données.
8. Conserver bloquées les actions vers Prospects historiques non isolés. Garder **`CLOUD_SYNC_SUSPENDED = true`** pendant ce pilote ; toute réactivation cloud est une étape distincte.
9. Obtenir une **décision explicite d’activation**, avec périmètre, responsables de suivi, sauvegardes externes et conduite à tenir en cas d’échec. Seulement après cette décision, modifier les commutateurs requis de l’instance dédiée : `ACCOUNT_SCOPED_RESOURCES_ENABLED`, et, si les fonctions font partie du pilote autorisé, `RESOURCE_JSON_REPLACEMENT_ENABLED` et `MANUAL_RESOURCE_RECOVERY_ENABLED`. Aucun commutateur cloud n’est inclus dans cette autorisation.
10. Prévoir un arrêt des nouvelles écritures si une anomalie survient, en conservant intégralement les clés isolées, copies et fichiers. La désactivation d’un commutateur n’est pas une migration inverse ni une autorisation de réattribuer les données ou d’effacer le profil.

**Décision finale : NO-GO.** L’absence de mélange observée, les exports vérifiés sous quota saturé et les répétitions de concurrence réussies ne compensent pas l’échec du refus d’une restauration sans intégrité historique vérifiable. Le GO de D8B portait sur une prochaine recette fictive limitée aux copies v2 ; il ne valait pas validation des archives anciennes pour un pilote global. Aucun système n’est activé par cette recette.

## Fichiers ajoutés et reproduction

Uniquement des fichiers de recette et ce rapport :

- `playwright.resource-final-v2.config.mjs` : suite complète et campagne répétée, sorties D9 séparées, aucun retry.
- `tests/resource-final-v2-integrity.test.mjs` : exigence de refus d’une copie historique sans empreinte, preuve mémoire avant/après.
- `tests/browser/resource-final-v2-integrity.spec.mjs` : même exigence dans deux vrais onglets Chrome, captures et trace.
- `tests/helpers/runResourceFinalV2Node.mjs` : trente passages indépendants du test existant, logs et versions conservés.
- `tests/helpers/auditResourceRetention.mjs` : mesure bornée de trois volumes, empreintes indépendantes, refus de quota sans perte des anciennes données.
- `tests/helpers/collectResourceFinalV2.mjs` : consolidation des mesures, empreintes source, manifeste et recherche de marqueurs dans le build.
- Ce rapport. Aucun fichier `app/`, dépendance ou configuration de production modifié.

Commandes complémentaires de reproduction :

```powershell
node --test tests/resource-final-v2-integrity.test.mjs
npm run test:browser -- --config=playwright.resource-final-v2.config.mjs
$env:CRM_RESOURCE_AUDIT_MODE = 'concurrency'
npm run test:browser -- --config=playwright.resource-final-v2.config.mjs
node tests/helpers/runResourceFinalV2Node.mjs
node tests/helpers/auditResourceRetention.mjs
```

Le premier test et le passage Chrome complet retournent actuellement un code non nul en raison de D9-01. La variable de mode est locale au processus de recette ; elle ne change aucun commutateur applicatif.

Preuves détaillées : `test-results/resource-final-v2/summary.json`, `source-before.json`, `unit.log`, `typescript.log`, `eslint.log`, `build.log`, `full/results.json`, `concurrency/results.json`, `node-repetitions/summary.json`, `legacy-integrity-unit.json` et `retention.json`, plus les pièces Playwright. Ces résultats sont ignorés par Git : les conserver avec le rapport dans l’archive de validation prévue, sans supprimer les preuves des étapes précédentes.
