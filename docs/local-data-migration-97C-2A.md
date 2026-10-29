# Migration manuelle 97C-2A

## Périmètre

La section « Migration des données locales » de `/sauvegarde` effectue uniquement
une copie locale manuelle. Les pages prospects, ressources et Street Marketing
continuent à lire les anciennes clés. La synchronisation cloud reste suspendue.
Le nouveau composant consulte l'authentification existante (`getSession`,
`getUser`, événements de session), sans requête sur les tables Supabase.

Les cinq sources sont les chaînes brutes des anciennes clés
`travel-prospect-crm-prospects`, `-resources`, `-settings`,
`-street-marketing-survey` et `-custom-message-templates`.
Les données présentes sont copiées exactement, sans normalisation ni substitution
des données absentes. Le fichier JSON préalable contient aussi les chaînes brutes
pour permettre une récupération exacte.

## Métadonnées examinées séparément

| Donnée | Décision |
| --- | --- |
| `last-backup-date` | Non copiée : une date historique ne prouve pas qu'une sauvegarde de ce compte existe |
| `last-local-change-date` | Non copiée : ne doit pas devenir un indicateur de synchronisation du nouveau compte |
| `cloud-sync-settings` | Non copiée : aucune reprise implicite des envois cloud |
| `startup-restore-status` | Non copiée : résultat d'une ancienne session, propriétaire inconnu |
| `startup-cloud-check-running` | Non copié : état temporaire |
| `notification-settings`, `install-dismissed` | Non copiés : réglages/préférences hors des cinq catégories métier |

## Déroulement et protections

1. Lire le compte affiché et demander un aperçu. Celui-ci valide `user.id` via
   l'adaptateur d'authentification et ne fait aucune écriture localStorage.
2. Télécharger le JSON de cet aperçu et confirmer son enregistrement/vérification.
3. Attester explicitement que toutes les données appartiennent exclusivement au
   compte affiché, recopier son UUID et confirmer une dernière fois la copie.
   Aucune case n'est cochée par défaut. L'email est uniquement affiché, jamais
   utilisé dans une clé ou comme preuve de propriété.
4. Prendre un verrou Web Locks partagé entre onglets. Sans support du navigateur,
   la copie est refusée. Revérifier la session, les sources et toutes les
   destinations, y compris celles dont la source est absente. Toute destination
   existante, même vide, bloque la migration.
5. Écrire et relire une réservation globale
   `travel-prospect-crm:legacy-migration:v1`, liée au compte propriétaire et à
   l'empreinte SHA-256 des sources. Elle interdit l'attribution ultérieure du même
   historique à un autre compte. Cette réservation n'est jamais supprimée
   automatiquement, même si la copie échoue.
6. Écrire l'état `migration-state` dans le stockage isolé, puis chaque chaîne brute
   et vérifier son égalité exacte avec la source capturée. Revérifier toutes les
   destinations et les sources avant de marquer la copie `verified`.

L'état contient `userId`, `createdAt`, `sourceFingerprint`, `status`, `active:false`
et, au succès, `verifiedAt`. `inspectState(owner)` compare l'empreinte courante et
retourne `sourceChanged` afin de détecter une modification historique ultérieure.
Les états ne commandent jamais la lecture des pages : aucune activation n'existe
dans cette étape, même en cas de succès.

Tout changement de session invalide l'aperçu et ses confirmations. Les jetons du
module `accountScopedStorage` bloquent aussi les opérations déjà en attente.
Une copie partielle reste conservée, non activée et réservée pour vérification
manuelle ; il n'y a ni rollback destructif, ni nettoyage, ni écrasement à la reprise.
Les anciennes clés et leur contenu sont conservés dans tous les cas.

## Limite de propriété

Le stockage historique n'a pas d'identifiant de propriétaire fiable. Un programme
ne peut pas prouver qu'il appartient à Sandra ou à Kévin à partir du nom affiché
dans les paramètres. La copie exige donc l'attestation explicite de l'utilisateur.
Si les données sont mélangées ou leur propriétaire est incertain, il faut arrêter
la procédure et effectuer une analyse/séparation manuelle. Aucune attribution
automatique au compte connecté n'est effectuée.

La réservation globale est volontairement conservatrice : migrer un autre lot sur
le même navigateur après une première tentative nécessite une procédure distincte
de récupération/validation, qui n'est pas implémentée ici.

## Tests sans base réelle

`node tests/legacy-data-migration.test.mjs`

Les tests compilent les vrais modules en mémoire et utilisent une Map, deux UUID
fictifs et un verrou simulé. Ils vérifient l'aperçu sans écriture, la confirmation,
la sauvegarde préalable, les conflits, la copie exacte, les changements de source
et de session, l'empreinte historique, les échecs et corruptions, la conservation
des sources, le refus d'attribution à un autre compte et l'absence d'activation.
