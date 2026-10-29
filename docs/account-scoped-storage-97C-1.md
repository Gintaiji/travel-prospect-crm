# 97C-1 — Infrastructure de stockage par compte

Cette étape ajoute uniquement `app/lib/accountScopedStorage.ts` et ses tests.
Aucune page ni fonction de stockage existante ne l'importe. La synchronisation
cloud reste suspendue. Aucun accès à Supabase, migration ou accès au stockage réel
n'est effectué par les tests.

## Inventaire des clés applicatives existantes

Toutes les clés ci-dessous commencent par `travel-prospect-crm-`.

| Suffixe de clé | Fichier actuel | Destination future envisagée |
| --- | --- | --- |
| `prospects` | `app/lib/prospectStorage.ts` | Par compte |
| `resources` | `app/lib/resourceStorage.ts` | Par compte |
| `settings` | `app/lib/settingsStorage.ts` | Par compte |
| `street-marketing-survey` | `app/lib/streetMarketingSurveyStorage.ts` | Par compte |
| `custom-message-templates` | `app/lib/messageTemplateStorage.ts` | Par compte |
| `last-backup-date` | `app/lib/backupReminderStorage.ts` | Par compte |
| `last-local-change-date` | `app/lib/localChangeTracker.ts` | Par compte |
| `cloud-sync-settings` | `app/lib/cloudSyncSettingsStorage.ts` | Par compte |
| `startup-restore-status` | `app/lib/cloudStartupRestoreStorage.ts` | Par compte |
| `startup-cloud-check-running` | `app/lib/cloudStartupRestoreStorage.ts` | À remplacer à terme par un état de session en mémoire |
| `notification-settings` | `app/lib/notificationSettingsStorage.ts` | Par compte |
| `install-dismissed` | `app/components/PwaInstallPrompt.tsx` | Préférence du navigateur, rester globale |

Le seul accès direct hors des modules de stockage se trouve dans
`PwaInstallPrompt.tsx` (lecture et écriture de `install-dismissed`). Aucun accès
direct à localStorage dans les pages CRM n'a été trouvé. Les autres accès directs
sont les implémentations des modules ci-dessus, y compris les normalisations à la
lecture dans `prospectStorage`, `resourceStorage`, `messageTemplateStorage` et
`streetMarketingSurveyStorage` : ils devront aussi être adaptés ultérieurement.

`supabaseClient.ts` crée également un client avec persistance d'authentification
gérée par le SDK. Ses clés d'authentification sont générées par Supabase (famille
`sb-<project-ref>-auth-token`, avec d'éventuelles clés auxiliaires du SDK selon le
flux d'authentification). Elles ne sont pas des données CRM à migrer ; ne pas les
renommer ou supprimer. L'inventaire porte sur le code, sans inspecter les sessions
réelles ni les secrets de configuration.

## Contrat du nouveau module

Format : `travel-prospect-crm:account:v1:<user.id>:<nom>`.
Les noms sont limités à une liste explicite ; aucun nom ne peut pointer vers une
ancienne clé. L'identifiant doit être un UUID canonique Supabase, jamais un email.

L'adaptateur futur devra fournir :

1. Un instantané de session en mémoire (`userId`, `revision`), initialement sans
   utilisateur. La révision doit changer à chaque transition de session, même
   lors d'une déconnexion/reconnexion au même compte. L'adaptateur devra écouter
   les événements d'authentification et leurs changements inter-onglets.
2. Une validation de l'utilisateur courant, fondée sur `auth.getUser()`, sans
   déduire l'identité d'un email, d'une ancienne clé ou d'une préférence locale.
3. Une instance partagée du module pour le contexte d'authentification concerné.

`validateOwner(userId)` vérifie l'identité et la stabilité de la session avant et
après la validation asynchrone. Elle délivre un jeton opaque, reconnu uniquement
par cette instance. Une nouvelle validation invalide les anciens jetons, même
si elle échoue. `read`, `write`, `remove` exigent ce jeton et revérifient la session
immédiatement avant l'accès synchrone au stockage. Une opération asynchrone doit
conserver son jeton initial jusqu'à son écriture, sans en acquérir un autre pour
appliquer un résultat ancien au compte courant.

`invalidateSession()` invalide uniquement les jetons : aucune clé n'est effacée.
Les erreurs de stockage remontent à l'appelant sans être transformées en données
vides. Le module ne choisit aucun propriétaire par défaut et ne lit jamais les
anciennes clés. Sans adaptateur branché, les pages restent sur leur fonctionnement
actuel : cette étape ne prétend donc pas avoir déjà isolé les données existantes.

Cette isolation prévient les mélanges applicatifs ; localStorage reste accessible
aux scripts de la même origine. Elle ne remplace ni la sécurité contre les XSS,
ni les politiques d'accès cloud.

## Migration future sans perte

1. Conserver la suspension cloud. Exporter une copie JSON indépendante des données
   existantes avant toute adaptation ; les anciennes données peuvent déjà être
   mélangées et n'ont pas de propriétaire fiable.
2. Faire identifier explicitement le propriétaire de chaque ensemble, avec aperçu
   et confirmation. Ne jamais attribuer les anciennes clés au prochain connecté.
3. Valider le compte destinataire, capturer son jeton et copier vers les nouvelles
   clés. Refuser un écrasement si la destination contient déjà des données ; prévoir
   une comparaison ou fusion explicite et une copie de sécurité distincte.
4. Relire et valider le contenu copié (schéma, nombres, identifiants et contenu).
   Gérer les quotas et interruptions par étapes reprenables, sans marquer la
   migration terminée tant que toutes les vérifications ne passent pas.
5. Basculer les fonctions de stockage, les normalisations à la lecture et les
   écrans vers le compte validé. Garder les anciennes clés et l'export pour retour
   arrière. Aucune suppression à la déconnexion.
6. Tester deux comptes, plusieurs onglets, déconnexion/reconnexion et interruption
   avant d'envisager une reprise distincte des écritures cloud.

## Vérification reproductible

`node tests/account-scoped-storage.test.mjs`

Les tests utilisent deux UUID fictifs et une Map, couvrent les accès sans identité
validée, les faux jetons, le changement de compte pendant la validation, les
opérations périmées, la reconnexion au même compte, la suppression ciblée d'une
nouvelle clé, la conservation des anciennes clés et les erreurs de stockage.
