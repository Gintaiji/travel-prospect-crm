# 97C-2B3A — Préparation de l'isolation des ressources

## Activation technique

`app/lib/resourceIsolationSettings.ts` contient
`ACCOUNT_SCOPED_RESOURCES_ENABLED = false`. Aucun paramètre d'URL, préférence
localStorage, compte connecté ou variable d'environnement ne l'active.
Les tests injectent le mode isolé en mémoire, sans modifier cet indicateur sur disque.

La branche désactivée conserve les lectures/écritures de `resourceStorage` dans
la page Ressources et les lectures historiques dans les fiches prospects.
Elle ne demande ni session confirmée ni migration. Aucune donnée n'a été migrée,
supprimée ou modifiée par cette préparation. Le cloud reste suspendu.

## Inventaire des chemins examinés

| Chemin | Usage | Préparation |
| --- | --- | --- |
| `app/ressources/page.tsx` | Liste, création, édition, suppression, recherche, types, favoris, copie de lien | Branche isolée complète derrière l'indicateur ; branche historique conservée |
| `app/prospects/page.tsx`, « Partager une ressource » | Sélection, copie, ouverture, ajout à l'historique | Lecteur isolé séparé derrière le même indicateur ; aucun chargement historique dans ce mode |
| `app/prospects/page.tsx`, assistant de messages | Sélection, copie lien/message, historique et relance associée | Lecteur isolé séparé ; l'ancien assistant reste inchangé en mode historique |
| `app/sauvegarde/page.tsx` | Résumé, export/import JSON | Inchangé ; concerne encore les données historiques |
| `app/lib/cloudSync.ts` et boutons cloud | Résumés, snapshots, envois/restaurations | Inchangé ; écritures cloud toujours suspendues |
| `app/lib/legacyDataMigration.ts` / `LocalDataMigration.tsx` | Copie manuelle des ressources avec les autres catégories | Inchangé ; aucune copie réelle exécutée |
| `app/lib/resourceStorage.ts` | Normalisation historique et localStorage global | Inchangé ; ne constitue jamais un secours pour une erreur du mode isolé |

Les fiches prospects utilisent encore des prospects sans propriétaire confirmé.
En mode isolé de préparation, leurs nouveaux panneaux peuvent lire et copier les
ressources du compte courant, mais ne peuvent pas les ajouter à l'historique d'une
fiche ni déclencher une relance. Les anciens gestionnaires restent accessibles
uniquement dans la branche historique. Les commandes qui ne concernent pas une
ressource dans l'assistant de messages ne sont pas modifiées.

## Accès préparé

`resourceAccess.ts` est l'interface commune testable :

- Le mode historique appelle les fonctions existantes sans exiger de migration.
- Le mode isolé exige une capture `userId:generation`, issue du fournisseur de
  session. `userSessionStore.beginOperation` confirme le propriétaire et donne un
  accès `accountBusinessStorage` lié à ce propriétaire.
- Une migration absente, partielle ou invalide retourne « Migration nécessaire ».
  Une catégorie absente après migration vérifiée est signalée séparément ; aucune
  liste vide n'est initialisée. Une collection explicitement vide reste utilisable.
- Les erreurs de format/stockage remontent sans lecture des anciennes clés.
- Les sauvegardes de ressources utilisent exclusivement l'opération capturée.
  Une ancienne opération A est refusée sous B, même si les deux ressources ont
  le même identifiant local. Aucun changement des formats métier n'est effectué.

`usePreparedResources` utilise le fournisseur existant sans abonnement Supabase
supplémentaire. Un changement de compte/génération masque les anciennes données
dès le rendu, relance la lecture et ignore les réponses anciennes. Les composants
isolés sont placés derrière `AccountSessionBoundary` afin de réinitialiser les
formulaires, sélections et retours de copie en mémoire. Les accès en cours gardent
leur propriétaire initial ; ils ne sont jamais réattribués au nouveau compte.

La page Ressources n'actualise sa liste ni ne réinitialise le formulaire qu'après
une sauvegarde réussie. Les erreurs d'écriture conservent la liste et le formulaire
précédents. La recherche et les filtres existants sont réutilisés.

Les copies dans le presse-papiers vérifient la session avant l'appel et ignorent
les retours périmés après l'attente. Une demande au presse-papiers déjà transmise au
navigateur n'est pas annulable ; aucune écriture métier n'en découle dans les
nouveaux panneaux des fiches prospects.

## Conditions exactes avant activation en production

1. Laisser l'indicateur à `false` jusqu'à la décision explicite d'activation.
2. Conserver un export JSON indépendant et effectuer la migration manuelle vers
   le bon `user.id`, après confirmation explicite du propriétaire. Une connexion
   ne suffit jamais à attribuer les données historiques.
3. Vérifier pour chaque compte le marqueur de migration `verified`, ses dates,
   son empreinte et la présence/validité de la catégorie Ressources. Distinguer une
   catégorie absente d'une collection volontairement vide. Vérifier aussi les
   modifications historiques postérieures à la copie via l'outil de migration.
4. Valider l'authentification confirmée, les changements de génération et les
   parcours chargement/déconnexion/erreur/migration nécessaire dans le navigateur
   cible, avec deux comptes et plusieurs onglets. Les tests unitaires ne remplacent
   pas cette recette dans un navigateur.
5. Résoudre la cohérence des sauvegardes/imports : les commandes JSON actuelles
   ciblent encore le stockage historique et ne sauvegarderont pas les futures
   modifications isolées. Préparer leur branche isolée ou un parcours distinct
   explicite avant une activation de production. Cette étape ne les modifie pas.
6. Garder l'ajout des ressources à l'historique et la relance associés bloqués tant
   que les prospects eux-mêmes ne sont pas isolés et leur propriétaire confirmé.
   Leur réactivation doit être une étape distincte ; ne pas écrire dans des fiches
   historiques à partir des ressources d'un compte.
7. Envisager séparément la gestion des modifications concurrentes du même compte
   entre onglets : cette étape protège le propriétaire et les générations, elle
   n'ajoute pas de fusion ou de verrou aux mises à jour concurrentes d'une liste.
8. Ne réactiver aucune écriture cloud : ses gardes doivent rester en place, même
   si le mode Ressources est ultérieurement activé.

## Tests sans données réelles

- `node tests/resource-isolation.test.mjs` : comptes A/B, migration, listes absentes
  et vides, écriture différée périmée, erreur de stockage et mode désactivé.
- `node tests/prepared-resources-hook.test.mjs` : rechargement, masquage immédiat
  des anciennes données, résultats périmés et absence d'accès quand désactivé.
- `node tests/resource-page-preparation.test.mjs` : véritables gestionnaires de
  création/édition/suppression/recherche dans les deux branches et lecteur isolé
  des fiches prospects. Le stockage et les hooks sont simulés en mémoire.

Le harnais de hooks est déterministe : ces tests ne prétendent pas effectuer une
recette complète React DOM ou une navigation réelle entre comptes Supabase.
