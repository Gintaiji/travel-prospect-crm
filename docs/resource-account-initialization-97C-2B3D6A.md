# 97C-2B3D6A — Initialisation sécurisée d’un compte neuf

Recette du 29 octobre 2026. Le blocage D5-01 est traité par un parcours Ressources explicite, sans migration des anciennes données. **Aucune activation de production : `ACCOUNT_SCOPED_RESOURCES_ENABLED = false`, récupération manuelle désactivée et cloud suspendu.** Les opérations exécutées concernent exclusivement les comptes et données fictifs du banc de recette.

## Blocage précis et choix de conception

Avant cette étape, l’adaptateur exigeait un `migration-state` vérifié pour lire ou écrire les Ressources. Après réservation du jeu historique à A, B ne pouvait ni migrer ce jeu ni obtenir ce marqueur. La connexion seule ne créait rien, à raison.

Le nouvel état `fresh-account` / « Compte neuf sans données » signifie que toutes les clés isolées gérées localement pour le compte confirmé sont absentes. Il ne prouve pas l’absence d’un historique partagé ou de données distantes. Le choix entre migration manuelle et espace vide appartient explicitement à l’utilisateur.

L’initialisation n’écrit **aucun marqueur de migration**. Elle réutilise le journal Ressources existant avec une première entrée `kind: initialization`, `beforeRaw: null`, `candidateRaw: "[]"`, propriétaire, identifiant et date. Le marqueur Ressources `verified` termine l’opération. Lors des écritures suivantes, cette première entrée demeure présente : seules les Ressources peuvent alors être disponibles sans migration. `getStatus()` et les quatre autres catégories métier gardent leur exigence de migration vérifiée.

## États affichés

| Situation locale | État Ressources |
|---|---|
| Compte confirmé, toutes les clés isolées gérées absentes | Compte neuf sans données ; choix explicite d’initialisation vide ou de migration |
| Destination ou métadonnée isolée présente sans préparation Ressources valide | Migration nécessaire ; initialisation refusée |
| Journal/marqueur incomplet ou incohérent | Récupération nécessaire, même si aucun marqueur de migration n’existe |
| Accès au stockage impossible | Erreur propagée ; aucune conclusion de compte neuf, aucune liste vide inventée |
| Initialisation ou migration vérifiée, journal cohérent | Ressources disponibles ; ajout normal autorisé |

L’audit du journal précède désormais le contrôle de disponibilité Ressources, sous le verrou commun. Cela évite de masquer une initialisation interrompue derrière « Migration nécessaire ». Les lectures des autres catégories sont inchangées.

## Protections et écritures

- L’action « Initialiser mes ressources » apparaît uniquement pour l’état neuf, dans la branche Ressources isolées. Le compte doit être connecté et son `user.id` confirmé par le store existant, qui valide le propriétaire via son adaptateur `getUser`. Recopie du `user.id`, case explicite et confirmation navigateur sont exigées. L’API contrôle indépendamment identité et confirmation.
- Le parcours reste désactivé lorsque l’indicateur Ressources est faux. L’injection d’activation et d’authentification fictive reste exclusivement dans le serveur de recette, jamais dans une route de production.
- `isAccountEmpty` vérifie chaque nom de `ACCOUNT_STORAGE_NAMES` avec la capacité du propriétaire courant. Il ne parcourt pas localStorage et ne lit ni clé partagée ni clé d’un autre utilisateur. Une valeur existante, même vide, invalide ou appartenant à une autre catégorie, interdit l’initialisation. Une erreur de lecture est bloquante.
- Le coordinateur existant utilise le même Web Lock par compte que CRUD, imports et récupération. Après acquisition, il revalide la capacité propriétaire, l’absence d’opération incomplète, la destination attendue absente et, après le contrôle de session, l’absence de toutes les clés isolées gérées. Il n’accepte que le candidat exact `[]` pour une initialisation.
- L’ordre reste celui du mécanisme existant : **journal relu exactement → marqueur `pending` relu → Ressources `[]` relues exactement → marqueur `verified` relu → vérification finale du journal, des données et de la cohérence**. Le résultat n’est publié qu’après une dernière vérification de session.
- Une seule initialisation concurrente peut réussir. La seconde observe une destination existante sous verrou et n’ajoute aucun journal. Aucun écrasement, fusion, nettoyage ou rollback automatique n’est ajouté.
- Les anciennes clés et la réservation historique globale ne sont jamais lues ou écrites par l’initialiseur. Aucun appel Supabase métier, aucune migration ni écriture cloud n’est ajouté. Les actions Ressources vers Prospects restent indisponibles.

Le fichier JSON est uniquement adapté à la nouvelle disponibilité Ressources : export/aperçu d’un compte non initialisé refusé explicitement, puis contrôle de disponibilité spécifique aux Ressources avant import. **La politique `replacementPolicy`, ses confirmations et son défaut bloquant sont inchangés.**

## Tests et résultats

| Vérification | Résultat |
|---|---|
| `node --test tests/*.test.mjs tests/cloud-sync-suspension.cjs` | **17/17 fichiers réussis** |
| `npm run test:browser -- --config=playwright.resource-initialization.config.mjs` | **30/30 tests réussis**, sans retry |
| `node_modules\.bin\tsc.cmd --noEmit` | Réussi |
| ESLint ciblé sur les fichiers applicatifs, tests et configuration modifiés | Réussi sans avertissement |
| `npm run build` | Réussi, Next.js 16.4.3, 20 pages générées |

La recette navigateur conserve les régressions D5/D4B et remplace le scénario de blocage B neuf par sa résolution. Elle ajoute les interruptions, la concurrence et le changement de compte propres à l’initialisation. Les vrais composants React sont montés dans le serveur local autonome ; seuls les comptes fictifs A/B et les clés préfixées de recette sont autorisés. Les requêtes externes sont bloquées et aucune tentative externe n’est observée.

### Scénarios spécifiques

1. A migre son historique fictif avec sauvegarde et confirmation ; la réservation historique appartient à A. B sans clé isolée voit « Compte neuf sans données ». La tentative de migration reste refusée à B, puis B initialise volontairement un espace vide par la vraie interface.
2. Le journal B contient l’initialisation, ses ressources sont exactement `[]` et aucun `migration-state` B n’est créé. B ajoute `B-initialized`. Une nouvelle initialisation est refusée ; retour sur A avec données exactement conservées. Réservation et anciennes clés inchangées.
3. Deux onglets tentent l’initialisation : un succès, un refus, une seule entrée de journal. Le test unitaire utilise également deux graphes de modules distincts partageant le verrou natif.
4. Une initialisation en attente derrière le verrou B, suivie d’une connexion à A, est refusée sans écriture isolée. Les tests unitaires couvrent aussi une modification concurrente d’une métadonnée et une révocation de session pendant la persistance.
5. Une interruption avant `verified`, suivie d’un rafraîchissement réel, affiche « Récupération nécessaire », masque l’action d’initialisation et laisse exporter le diagnostic existant avec le journal `initialization`, `[]` et l’absence explicite de migration. Réinitialiser ne contourne pas le blocage.
6. Chaque clé isolée gérée, prise séparément comme déjà présente, empêche l’initialisation. Les tests refusent tout accès aux clés A ou partagées depuis l’initialiseur B. Prospects et les autres catégories restent non disponibles faute de migration.
7. Échecs de lecture sur données, journal, état, migration et autres métadonnées : refus, aucune écriture. Interruption/quota avant et après persistance de chacune des quatre écritures ; altération silencieuse des octets écrits ; aucune réussite annoncée sans vérification.
8. Après initialisation puis ajout B, l’export JSON isolé contient les données B et son propriétaire. Les tests antérieurs d’import, de refus A sous B et de remplacement bloqué restent réussis.

Les preuves sont séparées des recettes précédentes dans `test-results/resource-initialization-97C-2B3D6A/` : résultats JSON, diagnostics téléchargés, capture A préservé/B initialisé et métadonnées de sécurité. Ces artefacts sont ignorés par Git et doivent être archivés séparément avec ce rapport.

## Limites et risques restants

- localStorage n’est pas transactionnel entre clés. Après la première écriture persistante du journal, une interruption laisse un état bloquant et diagnostiquable. Avant toute persistance, le compte reste neuf. Si `verified` a persisté mais que l’appel échoue ensuite, un nouveau diagnostic peut constater un état déjà cohérent ; cela ne constitue pas un succès annoncé par l’appel interrompu. Ces points sont testés.
- L’initialisation n’efface ni ne réessaie une opération interrompue. Les copies saines et le journal restent exploitables par la procédure de récupération existante, sous ses propres confirmations et son indicateur désactivé. Aucun droit de récupération automatique n’est accordé par cette étape.
- La vérification de vacuité porte sur les clés isolées gérées par l’application. Une nouvelle clé isolée introduite à l’avenir doit être ajoutée à la liste centrale. La vérification ne consulte pas le cloud ou un autre appareil.
- L’existence d’une simple préférence isolée suffit volontairement à refuser l’initialisation : aucune métadonnée n’est écrasée pour rendre le compte artificiellement neuf. Un tel compte nécessite une décision distincte.
- Web Locks protège les opérations coopératives de la même origine. DevTools, un script extérieur au coordinateur, une éviction du profil ou une défaillance physique restent hors garantie. La relecture exacte n’est pas une preuve de durabilité disque.
- Le journal d’initialisation devient une preuve nécessaire de disponibilité Ressources en l’absence de migration. Un futur nettoyage ne doit pas retirer cette première entrée sans concevoir un mécanisme équivalent et une transition explicitement autorisée. Aucun journal n’est nettoyé ici.
- La recette utilise Chromium et des sessions synthétiques, pas un service Supabase de production. L’activation du stockage isolé, le remplacement JSON et l’activation des autres métiers restent des décisions séparées. Cette étape résout D5-01 sans autoriser l’activation générale ni lever les autres réserves de D5.

## Fichiers modifiés ou ajoutés

| Fichier | Modification |
|---|---|
| `app/lib/accountScopedStorage.ts` | Contrôle de vacuité à partir de la liste centrale, propriétaire vérifié |
| `app/lib/accountBusinessStorage.ts` | État neuf et disponibilité Ressources indépendante d’une migration globale ; audit sous verrou avant lecture |
| `app/lib/resourceWriteCoordinator.ts` | Opération `initialization`, garde de vacuité sous verrou et validation de l’entrée initiale |
| `app/lib/resourceRecoveryAssessment.ts` | Diagnostic du type `initialization` et de sa structure attendue |
| `app/lib/resourceAccess.ts` | Propagation de l’état neuf sans inventer une collection disponible |
| `app/lib/resourceAccountInitialization.ts` | Nouvelle API explicite de création vide, session et confirmations |
| `app/components/ResourceAccountInitialization.tsx` | Nouveau formulaire propriétaire, consentement, confirmation et échec |
| `app/components/PreparedResourceViews.tsx` | Action d’initialisation dans la notice de compte neuf, migration toujours proposée |
| `app/lib/resourceBackupJson.ts` | Disponibilité Ressources initialisées et message de refus avant initialisation ; politique de remplacement inchangée |
| `tests/resource-account-initialization.test.mjs` | Tests de sûreté dédiés |
| `tests/resource-page-preparation.test.mjs` | Dépendance du nouveau composant dans le banc des gestionnaires existants |
| `tests/browser/resource-chain-server.mjs` | Autorise les nouvelles dépendances dans le bundle fermé de recette |
| `tests/browser/resource-chain-harness.mjs` | API d’initialisation explicitement activée uniquement dans le banc fictif |
| `tests/browser/resource-chain.spec.mjs` | Mise à jour du blocage D5-01 et nouveaux scénarios navigateur |
| `playwright.resource-initialization.config.mjs` | Sorties D6A séparées des preuves D5 |
| Ce rapport | Diagnostic du blocage, protections, résultats et limites |
