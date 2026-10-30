# 98A — Plan de correction de la synchronisation cloud

Audit du code présent dans l'espace de travail, le 30 octobre 2026. **Plan uniquement : aucune nouvelle synchronisation implémentée, aucune requête vers Supabase, aucune lecture de données réelles ni de secrets, aucun SQL exécuté.** Les travaux D14 non suivis déjà présents sont conservés.

## 1. Conclusion et priorités

**NO-GO pour réactiver le cloud actuel.** Le commutateur `CLOUD_SYNC_SUSPENDED = true` protège les écritures distantes et les deux automatismes, mais ne bloque pas toutes les restaurations locales depuis le cloud. L'isolation Ressources reste `false` en production ; son pilote ne prouve pas l'isolation des quatre autres catégories.

Solution recommandée : conserver les tables métier et les formes de données actuelles ; introduire une lecture cohérente et une écriture RPC transactionnelle par compte, une révision serveur commune, une sauvegarde de l'ancien état cloud et un reçu idempotent. Un conflit arrête la synchronisation et conserve les deux versions. Pas de fusion automatique, de règle « dernier horodatage gagnant », de CRDT ou de remplacement destructif au démarrage.

**Première correction proposée, à autoriser dans une étape distincte 98B : fermer le chemin de restauration locale qui échappe à la suspension**, au niveau de la fonction centrale et de son bouton, avec test négatif sans réseau. Ne pas commencer par remplacer DELETE/INSERT par un simple upsert : cela ne résout ni les conflits ni l'atomicité.

## 2. Cartographie du code actuel

Les numéros de ligne correspondent au code audité. Les requêtes de données applicatives sont concentrées dans `app/lib/cloudSync.ts`. Aucun appel RPC, canal Realtime, client Supabase serveur ou accès à Supabase Storage n'a été trouvé dans le code applicatif parcouru.

### Accès aux données Supabase

| Entrée dans `app/lib/cloudSync.ts` | Accès exacts | Effets / appelants |
|---|---|---|
| `getConnectedUserId`, ligne 163 | `auth.getUser()` via le client navigateur | Identifie l'utilisateur au début d'un appel ; pas de capture de génération couvrant toute l'opération |
| `getCloudSyncStatus`, 389 | Lecture indirecte de `crm_sync_state` via `getCloudSyncState` | Retour local immédiat du statut suspendu si le commutateur est actif ; sinon comparaison des dates |
| `getCloudDataSummary`, 423 | SELECT/count `crm_prospects`, `crm_resources` ; SELECT `crm_settings`, `crm_message_templates`, puis `getCloudSyncState` | Lecture en plusieurs requêtes, filtrées par `user_id` ; pas de snapshot commun |
| `getCloudFreshnessStatus`, 488 ; `canUploadLocalDataSafely`, 542 | Lectures indirectes via le résumé | Comparaison dates locales/cloud ; blocage seulement si zéro prospect local et au moins un cloud |
| `pruneOldCloudBackupHistory`, 571 | SELECT du seuil puis DELETE `crm_backup_history`, `created_at <= cutoff` | Limite 20, tri sur date ; purge hors transaction du remplacement |
| `createCloudBackupHistory`, 599 | INSERT `crm_backup_history`, puis purge | Sauvegarde le payload fourni, pas un état cloud relu sous verrou |
| `buildLocalCloudBackupHistoryPayload`, 622 | `getCloudSyncState` puis chargements locaux | Payload constitué de données **locales**, dates et état de synchronisation |
| `getCloudBackupHistory`, 639 | SELECT métadonnées `crm_backup_history`, utilisateur courant, limite 20 | Lecture autorisée pendant la suspension |
| `restoreCloudBackupHistoryToLocal`, 661 | SELECT payload par `user_id` + `id`, sauvegarde locale préalable dans l'historique distant et purge | Puis écrit les cinq catégories locales, successivement ; bloqué à l'entrée par la suspension |
| `uploadLocalDataToCloud`, 735 | Historique ; DELETE prospects puis ressources, INSERT de chaque liste non vide ; UPSERT settings, templates, sync_state | Requêtes indépendantes, aucune révision attendue, aucun rollback commun ; gardes avant les mutations |
| `restoreCloudDataToLocal`, 848 | Quatre SELECT sur prospects, ressources, settings, templates | Puis `saveProspects`, `saveResources`, settings/sondages/templates selon présence ; **aucune garde de suspension à l'entrée** |
| `getCloudSyncState`, 921 | SELECT `last_sync_at` dans `crm_sync_state` | Date seule, aucune version serveur |

Les listes écrites utilisent `{user_id, local_id, data}` ; settings/templates utilisent `{user_id, data}`, avec `onConflict: "user_id"`. Les SELECT et DELETE métier sont filtrés par `user_id`. Ces filtres client ne remplacent pas RLS ; les contraintes d'unicité effectives ne sont pas établies par ce code.

### Déclencheurs, authentification et suspension

| Fichier | Chemin actuel |
|---|---|
| `app/lib/supabaseClient.ts:1` | Seul constructeur SDK trouvé : client navigateur singleton, URL/clé publiques prises dans les variables Next, `createClient`. Ne pas confondre présence de configuration et autorisation de synchroniser. Sa validation actuelle d'URL n'accepte pas directement un Supabase local HTTP. |
| `app/lib/userSessionStore.ts` | `getSession`, `getUser`, `onAuthStateChange`, expiration, capture `{userId,generation}`, `assertCurrent`, stockage par propriétaire. Réutilisable ; `cloudSync.ts` n'utilise pas ce protocole de capture. |
| `app/connexion/page.tsx:25` | `getSession`, inscription `signUp` (86), connexion `signInWithPassword` (120), déconnexion `signOut` (144). L'authentification n'est pas suspendue avec le cloud métier. |
| `app/components/CloudAutoSync.tsx:22` | Événement local → délai minimal 10 s, défaut 30 s → contrôle de sécurité → upload auto. Suspension et génération protègent le lancement différé ; pas l'ensemble des awaits internes à l'upload. Après succès, efface le marqueur global de changement local. |
| `app/components/CloudStartupRestore.tsx:18` | `getSession`/abonnement auth → comparaison de fraîcheur → restauration automatique si cloud jugé plus récent ou local vide. Retour immédiat lorsque suspendu. La logique latente reste dangereuse. |
| `app/components/QuickCloudSyncButton.tsx:40` | Session et contrôles, confirmation, upload manuel. Effet et affichage bloqués lorsque suspendu, upload également bloqué centralement. |
| `app/layout.tsx:52` | Monte UserSessionProvider, CloudStartupRestore et CloudAutoSync sur l'application. |
| `app/sauvegarde/page.tsx:279` | Rafraîchit statut, résumé, fraîcheur et historique ; session ligne 335. Montage → `refreshSession` ligne 409, donc certaines lectures distantes restent possibles. Upload manuel 518 environ ; restauration principale 568 ; historique 604. Bouton upload et restauration historique désactivés par suspension ; bouton **Charger depuis le cloud**, vers 1065, désactivé uniquement par `isSyncing`. |
| `app/aujourdhui/page.tsx:164` | `getSession`, puis statut/résumé/fraîcheur (181). Les lectures résumé/fraîcheur ne sont pas neutralisées par la suspension du statut. Monte aussi QuickCloudSyncButton. |
| `app/cloud/page.tsx` | Redirige vers `/sauvegarde`, aucun autre accès de données. |
| `app/lib/cloudSyncSuspension.ts` | Constante littérale `true`, message et `assertCloudWritesAllowed`. Garde de mutation distante, pas interrupteur général d'accès réseau. |
| `app/lib/cloudSyncSettingsStorage.ts` | Préférence partagée locale `autoSyncEnabled: true` par défaut, distincte du commutateur de sécurité. Ne jamais lever ce dernier en supposant que les préférences empêcheront un redémarrage automatique. |
| `app/lib/cloudStartupRestoreStorage.ts`, `localChangeTracker.ts` | Statuts, pause booléenne, date sale et événements globaux non isolés par compte. Événement personnalisé limité à l'onglet ; pas de coordination inter-appareils. |
| `public/sw.js` | Cache réseau des GET de même origine seulement ; ne synchronise pas les données Supabase. D'anciens bundles peuvent néanmoins conserver l'ancien protocole : bloquer leurs écritures côté serveur avant toute future activation. |

### Périmètre métier et propriétaire

| Catégorie | Stockage local historique actuel | Cloud actuel |
|---|---|---|
| Prospects | `prospectStorage.ts`, `travel-prospect-crm-prospects` | `crm_prospects.data` ; comprend `conversationHistory`, notes et données terrain |
| Ressources | `resourceStorage.ts`, `travel-prospect-crm-resources` | `crm_resources.data` ; le cloud lit toujours ce stockage historique, pas le lecteur Ressources isolé |
| Paramètres métier | `settingsStorage.ts`, `travel-prospect-crm-settings` | `crm_settings.data.appSettings` ; compatibilité avec ancienne forme plate |
| Messages personnalisés | `messageTemplateStorage.ts`, `travel-prospect-crm-custom-message-templates` | `crm_message_templates.data` ; les modèles par défaut sont du code, les conversations sont dans les prospects |
| Sondages Street Marketing | `streetMarketingSurveyStorage.ts`, `travel-prospect-crm-street-marketing-survey` | `crm_settings.data.streetMarketingSurvey` (questions, sondages, sélection active) ; les contacts/réponses convertis par la page terrain sont dans les notes/historiques des prospects |

Les clés historiques ne portent pas de propriétaire. Se connecter sous B ne démontre pas que leur contenu appartient à B. `accountScopedStorage.ts` prépare le préfixe `travel-prospect-crm:account:v1:<userId>:` ; `accountBusinessStorage.ts` couvre les cinq catégories, mais les pages métier ne sont pas toutes basculées dessus. Les protections Ressources de `resourceWriteCoordinator.ts`, `resourceArchiveIntegrity.ts`, `resourceBackupJson.ts` et les migrations vérifiées sont à conserver ; elles ne sécurisent pas par transitivité un upload global historique.

## 3. Risques établis et inconnues

1. **Atomicité absente.** Une panne après DELETE ou après une catégorie laisse un cloud vide/partiel. Les lectures multiples peuvent également assembler des versions différentes. Les lectures de listes REST sans pagination explicite risquent d'être tronquées par la limite serveur ; une restauration tronquée peut ensuite devenir un upload destructif.
2. **Historique insuffisant.** Le payload archivé avant upload est le candidat local. Il ne permet pas nécessairement de récupérer les données distantes réellement perdues. Historique, purge et remplacement ne forment pas une transaction. Pas d'empreinte persistée/version complète dans le contrat historique actuel. La politique SQL de l'historique autorise aussi UPDATE/DELETE au propriétaire.
3. **Versions et conflits absents.** `last_sync_at` provient de l'horloge du navigateur ; la fraîcheur n'est pas un CAS. Les modèles de messages n'apportent pas leur date à `getLocalDataLastUpdatedAt`. Les suppressions et les dérives d'horloge ne se résument pas au maximum des dates d'objets.
4. **Vide ambigu.** Les loaders historiques peuvent retourner `[]`, `{}` ou des défauts sur absence/JSON invalide, et certains normalisent en écrivant pendant une lecture. La protection actuelle vise seulement les prospects : elle ne protège pas une liste Ressources vide ni la remise à zéro des autres catégories. Les fonctions de résumé ne constituent donc pas un diagnostic brut sans effet.
5. **Session et concurrence.** Les identifications peuvent être répétées au cours d'une opération sans capture commune ; un changement A/B peut associer des lectures, données locales ou résultats UI incohérents. `isSyncingRef` n'exclut ni un autre onglet ni un téléphone. Un changement local pendant l'envoi peut être masqué par l'effacement ultérieur du marqueur sale.
6. **98A-01 — Restauration locale destructive encore accessible sous suspension.** `restoreCloudDataToLocal` n'a ni garde centrale, ni sauvegarde locale préalable systématique, ni revalidation de génération juste avant ses écritures multi-clés. La confirmation visuelle n'est pas une protection suffisante. Reproduction en VM avec uniquement des dépendances mémoire : suspension `true`, quatre lectures simulées, puis deux appels de sauvegarde locale avec listes vides ; **zéro réseau réel**.
7. **RLS non certifiable depuis le dépôt.** Le seul SQL présent est `supabase/crm_backup_history.sql` : RLS activée, politique `FOR ALL` avec `USING` et `WITH CHECK (auth.uid() = user_id)`, FK auth et index utilisateur/date. Cela décrit un fichier, pas son déploiement. Aucun DDL/politique versionné trouvé pour prospects, ressources, settings, templates ou sync_state. Le schéma, les grants et les RLS réellement déployés sont **inconnus**, pas déclarés sûrs. Aucune inspection de production effectuée.

## 4. Architecture recommandée

### 4.1 Contrat et source d'autorité

Un **snapshot logique par compte**, comprenant les cinq catégories explicitement présentes, `schemaVersion`, `ownerUserId`, `revision` serveur, empreinte et date serveur. Les données métier seules sont synchronisées : aucun journal local, historique de récupération, archive ou copie de sauvegarde dans ce payload. Les contenus longs et champs métier existants sont conservés ; les formats illisibles/incomplets sont refusés, jamais normalisés en vide.

Conserver les tables existantes pour éviter une seconde source d'autorité. Prévoir, uniquement dans une future base de recette :

- extension de `crm_sync_state` avec révision monotone par utilisateur, empreinte et version de protocole ; `last_sync_at` reste indicatif ;
- historique **V2 distinct** de l'ancien, immuable pour les clients, avec propriétaire, révision précédente, payload métier complet et empreinte serveur ;
- reçus idempotents uniques `(user_id, operation_id)` contenant empreinte de requête et révision résultat, sans recopier inutilement tout le snapshot.

Les noms/contraintes finaux restent à confirmer sur un schéma de recette documenté. Une révision PostgreSQL `bigint` est transportée comme chaîne décimale pour éviter les pertes de précision JavaScript. Aucun timestamp client ne décide de la priorité.

### 4.2 Lecture cohérente

Une RPC `read_account_snapshot_v1` renvoie révision et données ensemble. Elle utilise le même verrou de ligne par compte que l'écrivain, avec verrou partagé pendant l'agrégation, ou une unique requête SQL fournissant un snapshot MVCC cohérent. Aucune lecture en quatre requêtes ni pagination oubliée. Tester au-delà de 1 000 prospects ; limiter explicitement la taille globale et échouer clairement si elle dépasse le contrat, sans retourner une liste partielle.

### 4.3 Écriture atomique avec CAS

Contrat proposé : `commit_account_snapshot_v1(expected_owner, expected_revision, operation_id, schema_version, candidate, deletion_intents)` ; réponse succès avec révision/empreinte/reçu, ou conflit explicite, ou erreur sans changement.

Dans **une transaction PostgreSQL** :

1. Vérifier `auth.uid()` non nul, correspondance `expected_owner`, format, tailles, identifiants uniques et toutes les catégories. Le paramètre propriétaire est une assertion anti-changement de compte, jamais une autorité d'accès.
2. Acquérir la ligne de coordination du compte par `SELECT ... FOR UPDATE`. Prévoir création atomique et unicité de cette ligne pour deux premières connexions simultanées ; ne pas compter sur un verrou de ligne inexistante. Un compte avec données anciennes mais sans révision relève du rapprochement initial, pas d'une création vide automatique.
3. Chercher le reçu de l'opération **sous ce verrou, avant de rejeter la révision**. Même identifiant et même requête déjà validée → renvoyer le reçu initial, sans nouvel historique ni nouvelle écriture ; même identifiant et autre contenu → refus.
4. Comparer strictement la révision attendue à la révision courante. Un appareil périmé reçoit un conflit et n'écrit rien, même si son horloge est plus récente.
5. Lire le précédent état cloud complet sous verrou ; l'insérer dans l'historique V2 avec propriétaire, révision et SHA-256 calculée côté serveur sur une représentation canonique définie/versionnée. Échec de sauvegarde ou de capacité → rollback de tout le commit.
6. Appliquer les upserts et **seulement les suppressions explicitement décrites et validées**. Les retraits déduits du candidat doivent correspondre exactement aux intentions sur la base attendue ; une catégorie absente/invalide n'est jamais une instruction de suppression. Les remises à zéro de paramètres/templates exigent également une intention. Effacer la dernière entrée exige une vraie action de suppression, pas un simple tableau vide reçu.
7. Incrémenter la révision, calculer l'empreinte du nouvel état et enregistrer le reçu dans la même transaction. Tout défaut ultérieur à la sauvegarde fait également annuler celle-ci et les mutations. Ne pas absorber une exception SQL en retournant un faux succès.

Le verrou serveur garantit le CAS entre **appareils** ; Web Locks ne coordonne que les onglets de la même origine. Référence : [verrous PostgreSQL](https://www.postgresql.org/docs/current/explicit-locking.html).

### 4.4 RLS, grants et ancien protocole

Versionner dans la recette le schéma et les tests de politiques de **toutes** les tables concernées. Exiger `user_id NOT NULL`, FK utilisateur et unicité `(user_id, local_id)` pour les listes, `user_id` unique pour les singletons. RLS avec vérification explicite de l'identité sur SELECT et mutations ; tester également historique et reçus.

Le client public ne doit plus pouvoir faire de DML direct sur les tables, l'état, l'historique V2 ou les reçus. Sinon un ancien navigateur contournera le CAS. Les anciens INSERT/DELETE/UPSERT doivent échouer côté serveur, même si l'ancien code est encore en cache PWA. Aucun service-role dans le navigateur.

Si la RPC doit utiliser `SECURITY DEFINER` pour ce passage étroit, exiger `search_path` vide, objets qualifiés, absence de SQL dynamique, vérification interne `auth.uid()` et rôle propriétaire dédié NOLOGIN/NOBYPASSRLS, distinct du propriétaire des tables, avec privilèges minimaux et politiques adaptées. Ne pas supposer que RLS protège une fonction privilégiée par défaut. Révoquer EXECUTE à PUBLIC/anon et accorder uniquement les signatures prévues au rôle authenticated ; vérifier aussi les privilèges par défaut. Les fonctions de lecture suivent la même règle de cloisonnement. Voir [fonctions Supabase](https://supabase.com/docs/guides/database/functions) et [RLS Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).

### 4.5 Couche locale, reprise et synchronisation automatique

Prérequis bloquant : les cinq catégories et les métadonnées de synchronisation doivent être rattachées à un propriétaire validé. Aucun adaptateur cloud ne doit charger les clés historiques globales « parce qu'un utilisateur est connecté ». Réutiliser le store de session et les adaptateurs préparés ; toute future intégration des autres catégories passe par des étapes séparées, sans modifier les règles métier de scoring, messages ou sondages.

Pour éviter une pseudo-transaction sur cinq clés, préparer un dépôt de snapshot local par compte, avec manifeste de version et bascule atomique d'un pointeur vers un snapshot vérifié. Garder séparés le draft métier, la base commune, les métadonnées et les copies de récupération plates. Les lectures/écritures passent par les adaptateurs de stockage ; ne pas garder deux ensembles de clés actifs concurrents. Le choix de ce format et sa compatibilité avec le coordinateur Ressources sont à tester avant tout raccordement. Une intégration partielle limitée aux Ressources n'autorise pas l'envoi global.

Réutiliser le Web Lock Ressources existant pour les chemins Ressources et définir un ordre de verrous unique avec la coordination du snapshot global, sans réentrance/deadlock. Toutes les sauvegardes locales doivent participer au protocole ; un verrou supplémentaire ignoré par les écrivains actuels ne protège rien. Quota insuffisant, journal interrompu ou Web Locks indisponibles → refus sûr ; export externe vérifié disponible, aucun nettoyage automatique.

Chaque opération capture `{userId,generation,localRevision,baseCloudRevision}` et un contenu immuable. Contrôler la session après chaque attente et avant l'appel RPC, avant toute publication locale et sous le verrou local. Logout/changement de compte invalide délais, requêtes planifiées et résultats. Les changements locaux pendant le réseau restent sales : acquitter uniquement la révision locale réellement envoyée.

Avant envoi, conserver une outbox durable bornée, avec identifiant d'opération et même contenu pour chaque tentative ; pas une file croissante de copies complètes identiques. Réseau coupé après commit mais avant réponse → statut « résultat à vérifier », consultation/rejeu du même reçu. Un reçu ancien prouve seulement ce commit, pas que le cloud n'a pas changé depuis : relire la tête avant d'annoncer « à jour ». Échec de persistance de l'outbox → ne pas envoyer.

Un AbortController ne garantit pas l'annulation d'une transaction déjà acceptée. Après logout, une requête partie sous A peut encore avoir été validée pour A ; elle ne doit jamais être appliquée localement sous B ni rejouée avec le jeton B. Le reçu permet le rapprochement lors d'une reconnexion à A. Une garantie plus stricte de révocation immédiate exigerait un protocole serveur de révocation supplémentaire ; ne pas la promettre avec le seul JWT.

Après activation future autorisée : réutiliser le debounce local, ajouter vérification au retour en ligne, focus/visibilité et interrogation périodique modérée lorsque connecté. Realtime n'est pas nécessaire en première version. Si local propre et révision cloud différente, appliquer seulement après sauvegarde locale et validation ; si local sale, tenter le CAS uniquement sur sa base connue, sinon conflit. Aucun automatisme pour un état jamais rapproché. Les indicateurs deviennent par compte : hors ligne, attente, conflit, récupération nécessaire, synchronisé à une révision donnée, suspendu.

## 5. Sauvegardes, conflits et première synchronisation

### Sauvegardes et conflits

- Historique V2 : état cloud réellement remplacé, complet et plat, copie indépendante de la requête candidate, date serveur, propriétaire, version de format, révision et empreinte persistée. Ne jamais y inclure récursivement les anciens historiques.
- Préserver intégralement l'historique ancien ; ne pas lui inventer une empreinte pour le rendre certifié. Un format ancien non vérifiable reste diagnostiquable, sans restauration certifiée automatique. Une éventuelle procédure d'import historique sera distincte et manuelle.
- Pas de purge dans la RPC de commit. Mesurer capacité et croissance ; si sauvegarder devient impossible, bloquer les mutations. Toute politique de rétention/export sera une étape distincte, avec vérification des copies, sans suppression automatique dans ce chantier.
- Au conflit PC/téléphone : arrêter les envois du compte, conserver local, cloud courant et base commune, afficher écarts et retraits. En première version, choix explicite de conserver le cloud ou de préparer un candidat local après examen ; une fusion manuelle peut suivre. Une restauration historique est elle aussi un nouveau candidat soumis au CAS, jamais un écrasement privilégié.
- Sauvegarder les deux états avant un choix destructif. Reconfirmer la révision cloud au moment d'appliquer la résolution ; s'il a encore changé, nouveau conflit. Aucun rebasage automatique de la révision attendue pour faire passer un candidat périmé.

### Premier rapprochement, appareil par appareil

1. Déconnecter les automatismes. Identifier le propriétaire et les catégories réellement disponibles, absentes, invalides ou en récupération. Capturer les octets historiques sans appeler les loaders qui réécrivent ; aucune attribution automatique des données globales au compte connecté.
2. Dans une future étape autorisée sur environnement dédié, obtenir un snapshot cloud cohérent complet, y compris l'état historique sans révision. Préserver/exporter séparément local et cloud, avec manifeste propriétaire, format et empreinte, puis relire les fichiers. Pas de modification à ce stade.
3. Local absent/vide et cloud présent : proposer l'adoption **locale** du cloud après vérifications et confirmation, sans upload de vide. Local présent et cloud absent : proposer initialisation distante explicite sous CAS « absent ». Deux états identiques : établir la base vérifiée. Deux états différents : rapprochement manuel, jamais choix par horodatage. État inconnu/invalide : bloquer. Deux états vides : initialisation explicite, sans effacement ni inférence de propriété.
4. Le bootstrap d'un ancien cloud vers une révision V1 doit sauvegarder son ancien état dans la même transaction et vérifier l'empreinte de prévisualisation sous verrou. Ne pas faire de migration de masse ni initialiser implicitement un ancien compte lors d'une simple lecture.
5. Persister la base et le reçu, vérifier les cinq catégories et les écritures locales, puis seulement rendre cet appareil éligible à la synchronisation automatique. Chaque autre appareil effectue son propre rapprochement. Aucun GO de pilote fictif ne bascule un commutateur de production.

## 6. Tests indispensables avant activation

| Domaine | Scénarios et assertions minimales |
|---|---|
| Suspension | Appels directs et UI d'upload, restauration courante/historique, startup et délais ; aucun client ni écriture locale/destructive lorsque bloqué. Définir séparément les lectures diagnostiques autorisées. |
| Atomicité serveur | Échec injecté après sauvegarde, après chaque catégorie, avant révision/reçu ; état précédent exact, aucune mutation partielle ni historique orphelin. Sauvegarde égale au précédent cloud, pas au candidat. |
| Versions | PC/téléphone sur même base : un succès et un conflit ; même test sur première création sans ligne. Horloges inversées sans effet. Révisions au-delà de la précision entière JS. |
| Idempotence | Réponse perdue après commit, rejeu après redémarrage, même UUID/contenu, UUID réutilisé avec autre contenu, reçu ancien après nouveau commit ; jamais deux commits pour une opération. |
| Auth/RLS | Comptes A/B fictifs, anon, JWT expiré, propriétaire/IDs falsifiés, accès direct REST et anciennes méthodes ; refus SELECT intercompte et refus DML de contournement. Vérifier grants, RLS, rôle de fonction et historique/reçus. |
| Sessions | Changement pendant attente Web Lock, lecture, envoi, réponse et application ; aucun résultat A publié sous B, aucune outbox A envoyée avec B. Reconnexion A rapprochée par reçu, pas par supposition d'échec. |
| Vide et schémas | Clé absente, JSON cassé, liste partielle, page tronquée, champ manquant, defaults, dernière suppression explicite, reset templates/settings ; jamais d'effacement sur simple vide. |
| Local | Deux vrais onglets Chrome + deux contextes/appareils indépendants, édition pendant upload/download, crash/refresh pendant publication, quota, SHA-256 invalide, anciennes copies ; anciennes données récupérables et marqueur sale correct. |
| Premier rapprochement | Matrice absent/vide/présent/invalide pour chaque catégorie et compte, cloud ancien sans révision, deux bootstrap concurrents, refus de données globales sans attribution vérifiée. |
| Volume et sauvegardes | Plus de 1 000 objets, limites payload, 20+ commits, croissance linéaire sans imbrication, capacité d'historique épuisée ; refus plutôt que purge/perte. |
| Parcours utilisateur | PC et Android physique : reconnexion, réseau coupé, conflit explicite, choix annulé, export/relecture puis récupération vérifiée ; aucune sélection automatique dangereuse. |

Réutiliser les 21 fichiers `tests/*.test.mjs`, `tests/cloud-sync-suspension.cjs`, les bancs React/Chrome existants et le pilote fictif. Ajouter de vrais tests SQL de transaction/RLS sur une instance locale Supabase jetable ou une recette explicitement dédiée, avec clients A/B et rôles réels : des mocks ne prouvent pas RLS. Configuration de transport de test injectée et refus des hôtes de production ; ne pas affaiblir le validateur du client partagé pour rendre le test local possible.

## 7. Petites étapes Codex proposées

Chaque étape garde cloud suspendu et isolation production désactivée ; aucune commande SQL de production. Une étape se clôt par preuves et revue avant la suivante.

| Étape | Changement limité à prévoir | Critère de sortie |
|---|---|---|
| **98B** | Fermer l'échappatoire de suspension de `restoreCloudDataToLocal` et de son bouton ; message explicite ; test central et UI sans client réseau | Appel direct et clic refusés avant lectures/écritures ; listing historique intentionnellement lisible ; aucun changement d'activation |
| **98C** | Contrats snapshot/révision/erreurs et lecteurs bruts de diagnostic, sans raccordement cloud ; inventaire schéma/RLS manquant | Fixtures cinq catégories, absence ≠ vide ≠ corruption, zéro mutation en lecture |
| **98D** | Base locale Supabase jetable, schéma versionné fictif, rôles/grants et garde réseau du banc | A/B isolés et refus absolu de connexion production ; aucun schéma réel importé automatiquement |
| **98E** | RPC lecture cohérente et bootstrap explicite sur cette base, sous feature gate de recette | Grands volumes complets, legacy/sans révision refusé hors rapprochement, bootstrap concurrent contrôlé |
| **98F** | RPC CAS transactionnelle + historique V2 + reçus ; révocation DML direct en recette | Fault injection complète, sauvegarde précédente exacte, concurrence et idempotence prouvées |
| **98G** | Dépôt local par compte et adaptateurs de stockage, une catégorie à la fois puis snapshot global ; conserver le protocole Ressources | Les cinq catégories ont un propriétaire et une révision, récupération locale et concurrence vérifiées ; pas de double source active |
| **98H** | Client de transport injecté, captures de session, outbox et reçus, synchronisation manuelle fictive | Réseau interrompu/reprise/session A-B, édition pendant envoi, pas d'acquittement d'une version non envoyée |
| **98I** | Assistant de premier rapprochement et écran de conflit, exports vérifiés | Toutes les branches du rapprochement et annulations testées, ancien cloud conservé |
| **98J** | Automatismes limités à la recette, debounce/focus/reconnexion et statuts | Deux appareils, réseau perturbé, conflits visibles, aucune boucle de remplacement |
| **98K** | Recette finale Chrome/Android et revue des politiques, capacité, sauvegardes, ancien client/PWA | Rapport GO/NO-GO fictif ; préparation distincte d'une éventuelle activation autorisée, jamais activation automatique |

Les étapes d'implémentation devront exécuter les tests unitaires complets (inclure le CJS cloud), SQL/RLS lorsque concernés, Playwright Chrome, TypeScript, ESLint ciblé et build. Les résultats de tests restent attachés à leur étape et ne sont pas hérités comme preuve d'un code ultérieur.

## 8. Vérifications réalisées pour ce plan

- Recherche des constructeurs SDK, appels Auth, `.from`, `.rpc`, canaux, chemins de restauration et gardes ; lecture du code courant et du seul SQL présent. Aucun navigateur applicatif ni SDK réel lancé pour l'audit.
- `node --test tests/cloud-sync-suspension.cjs` : **1/1 réussi**. Ce test vérifie upload/historique/startup/délais, mais ne couvre pas la restauration principale : son succès n'invalide pas l'anomalie 98A-01 ci-dessus.
- Reproduction mémoire de 98A-01 : quatre lectures simulées et deux sauvegardes locales malgré la suspension. Aucun fichier de données ni localStorage réel touché.
- Livrable de cette étape : ce document uniquement. Pas de nouvelle migration, SQL, fonction métier ou synchronisation. TypeScript/build/Playwright non rejoués pour ce changement documentaire ; ne pas les présenter comme exécutés en 98A.

**Bilan : l'architecture peut rester simple avec un CAS transactionnel global par compte, mais la suspension, l'isolation locale complète et l'absence de contournement serveur sont des prérequis. Première action concrète : 98B, garde centrale de la restauration cloud vers local, sans réactivation.**
