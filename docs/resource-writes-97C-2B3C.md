# 97C-2B3C — Écritures Ressources coordonnées et récupération

Le mode isolé reste **désactivé** et les écritures cloud restent **suspendues**.
Aucune migration réelle, modification de Supabase ou récupération de données
réelles n'a été effectuée. Les actions Ressources vers Prospects restent bloquées.

## Inventaire et mécanisme commun

| Écriture isolée | Chemin préparé |
| --- | --- |
| Ajout, édition, suppression d'une ressource | Page Ressources → `resourceAccess` → `accountBusinessStorage` → coordinateur |
| Écriture générique `write("resources", ...)` | `accountBusinessStorage` → coordinateur |
| Import JSON | `resourceBackupJson` → coordinateur |
| Copie de migration | Verrou global de réservation historique → coordinateur par compte, maintenu jusqu'à vérification des autres catégories |
| Écriture brute ou suppression de la clé Ressources et de ses sécurités | Refusée par `accountScopedStorage` sans capacité temporaire interne du coordinateur ; suppression des clés protégées interdite |

Le coordinateur unique est `app/lib/resourceWriteCoordinator.ts`. Son verrou
exclusif est `travel-prospect-crm:resource-write:v1:<user.id>` et repose sur Web
Locks, partagé entre onglets de même origine. Il n'existe aucun verrou de secours
localStorage : sans Web Locks, toute écriture isolée est refusée.

La capacité d'écriture est liée à l'instance du stockage, au jeton propriétaire et
à la durée effective du verrou. Elle est invalidée dans `finally`. Un objet
fabriqué avec le même UUID ne suffit pas. Chaque accès revérifie également la
session via le magasin isolé ; attendre le verrou ne permet pas à une opération
sous A de reprendre sous B.

Le mode historique utilise toujours ses fonctions synchrones précédentes. La
page ne passe par l'attente et le suivi d'enregistrement que dans sa branche
isolée. Les autres catégories métier gardent leurs chemins d'écriture précédents.

## Exclusion mutuelle et conflit de version

Les écritures isolées sont asynchrones. Le verrou empêche leur chevauchement,
mais ne suffit pas à protéger une liste préparée depuis une lecture ancienne.
Le coordinateur compare donc la chaîne exacte de destination avec le snapshot de
lecture **après acquisition du verrou**. Une deuxième écriture préparée sur une
liste dépassée est refusée, sans écraser la première ni fusionner arbitrairement.

`accountBusinessStorage` exige une lecture préalable de ressources ou un snapshot
explicite. `resourceAccess` conserve celui de la liste affichée et l'actualise
seulement après succès. La page n'actualise sa liste qu'après cet acquittement et
bloque les doubles soumissions pendant l'attente. Un échec conserve formulaire et
liste affichée ; une récupération nécessaire désactive les nouvelles soumissions.

## Journal, interruptions et état lisible

Le journal existant `resource-import-journal` est maintenant commun aux trois
types d'opérations (`kind: edit/import/migration`). Chaque entrée garde :

- le `userId`, l'identifiant d'opération et la date ;
- `beforeRaw`, copie exacte de la destination précédente ou absence explicite ;
- `candidateRaw`, copie exacte du candidat ou absence pour une migration sans ressources ;
- le propriétaire source déclaré, lorsqu'il existe.

Aucune entrée précédente n'est supprimée ou purgée. Le protocole est :

1. Vérifier session, journal existant, version attendue et préconditions métier.
2. Ajouter et relire la sécurité dans le journal.
3. Écrire et relire l'état `pending`.
4. Copier, relire et comparer exactement les ressources.
5. Terminer les autres vérifications éventuelles de migration sous le même verrou.
6. Écrire puis relire l'état `verified`, lié à la dernière entrée du journal.

Les cas suivants entraînent **« Récupération nécessaire »** et refus des nouvelles
écritures : journal seul, état seul, état `pending`, identifiant final qui ne
correspond pas à la dernière entrée, propriétaire incorrect, snapshots/dates
illisibles, ou contenu actuel différent du dernier candidat vérifié. Cela couvre
notamment l'interruption **après le journal mais avant le marqueur**, et l'échec
du marqueur final après une copie réussie. Une erreur avant tout ajout durable au
journal laisse les données précédentes intactes et ne nécessite pas de réparation.

Les lecteurs de ressources vérifient ces conditions avant et après leur lecture.
`resourceAccess` expose `status: recovery-required` et un libellé lisible. Les
quatre autres catégories ne sont pas bloquées par un import Ressources incomplet.
Pendant une écriture d'un autre onglet, une lecture peut être conservativement
bloquée ; une relecture après sa fin est nécessaire. Ce n'est jamais résolu en
remplaçant les données par une liste vide.

## Diagnostic sans modification

`exportResourceRecoveryDiagnostic` prend le même verrou et exporte uniquement
les chaînes brutes du compte confirmé : ressources, journal, état d'écriture et
état de migration. Le JSON porte `storageScope: resource-recovery-diagnostic` :
ce n'est ni une sauvegarde métier ordinaire ni une commande de restauration.

Un bouton est préparé dans le panneau JSON isolé. Celui-ci reste masqué tant que
le mode Ressources est désactivé. Le diagnostic est possible pour une session
confirmée même si les ressources sont bloquées. Aucun marqueur n'est modifié.

## Procédure sûre de reprise ou retour arrière

Cette étape **ne fournit pas de bouton qui répare ou efface automatiquement**.
La procédure ci-dessous doit être suivie par un outil de maintenance explicite,
audité et validé avant toute ouverture de la récupération en production. Les
API normales refusent de contourner un état incomplet.

1. **Geler les écrivains.** Garder les indicateurs de production désactivés et le
   cloud suspendu. Fermer les anciennes versions de l'application ; utiliser une
   version connue du code. Pendant l'examen, conserver le verrou du compte afin
   qu'aucun autre onglet coopérant ne modifie les données.
2. **Préserver avant d'agir.** Exporter le diagnostic, les sauvegardes JSON déjà
   enregistrées, ainsi qu'une copie indépendante du lot historique concerné par
   une migration. Conserver aussi les octets actuels, même illisibles. Ne pas
   nettoyer localStorage, retirer une réservation ou supprimer le journal.
3. **Confirmer le propriétaire.** Revalider le `user.id` avec la session et
   comparer tous les propriétaires présents. Pour les sources historiques sans
   propriétaire fiable, demander une vérification humaine explicite. Si le lot
   est mélangé, incomplet ou incertain, arrêter la procédure.
4. **Vérifier l'intégrité.** Parser les snapshots, vérifier leurs structures et
   identifiants, l'ordre des opérations et leur lien avec l'état final. Comparer
   les chaînes exactes aux sauvegardes indépendantes ; calculer des empreintes
   hors stockage pour documenter cette comparaison. Le journal n'est pas une
   signature contre une modification malveillante de même origine.
5. **Choisir une action explicite.** Si le contenu est exactement le candidat
   prévu, une reprise pourra seulement finaliser l'opération après toutes les
   vérifications. Pour une migration, vérifier aussi les cinq catégories et
   l'empreinte de la source avant toute finalisation. Si un retour arrière est
   choisi, sélectionner le `beforeRaw` vérifié et conserver le candidat actuel.
6. **Ne pas effacer les preuves.** L'outil de maintenance devra ajouter une nouvelle
   entrée d'audit de récupération, conserver les snapshots et copier le choix
   sous le même verrou et la même identité. Il ne devra jamais simplement changer
   `pending` en `verified` ou supprimer l'état pour débloquer l'interface.
7. **Vérifier avant réouverture.** Relire la copie exacte et l'audit de récupération,
   exporter le résultat puis faire confirmer le propriétaire. Une version future
   de l'outil devra rendre cette décision traçable ; aucune activation implicite.

Si le snapshot précédent était **absent**, ne pas supprimer la clé actuelle et ne
pas prétendre qu'une liste `[]` représente cette absence. Conserver le blocage
jusqu'à définition d'une reprise non destructive adaptée. Une incohérence ou une
copie de sécurité manquante impose le même arrêt.

## Vérification et limites restantes

- Douze suites de tests couvrent les chemins existants et le coordinateur.
- Deux graphes de modules indépendants partagent le stockage simulé et les vrais
  Web Locks natifs de Node ; un test supplémentaire vérifie l'exclusion entre
  deux threads réels avec les Web Locks natifs.
- Il n'y a pas de test dans deux onglets réels de navigateur : Playwright n'est
  pas installé. La recette inter-onglets et PWA reste obligatoire avant activation.
- Les verrous protègent les écrivains de cette version sur la même origine.
  Une ancienne version, les outils de développement ou un script de même origine
  peuvent contourner le code. Les divergences détectables sont bloquées, sans
  prétendre protéger contre un script qui falsifierait aussi le journal.
- localStorage n'est pas transactionnel sur plusieurs clés. Les journaux et le
  blocage rendent une interruption détectable ; ils ne suppriment pas ce risque.
- Le journal cumulatif consomme de l'espace. Un quota insuffisant bloque
  l'opération ; aucune purge automatique de sauvegardes n'est introduite.
- Il n'y a ni fusion automatique de modifications concurrentes, ni outil de
  réparation destructif. L'interface de maintenance décrite reste à implémenter
  et valider séparément.
- `ACCOUNT_SCOPED_RESOURCES_ENABLED` reste `false`, la politique de remplacement
  JSON reste `blocked` par défaut et le cloud reste suspendu. La coordination
  préparée ne constitue pas une autorisation d'activer ces chemins.

## Fichiers concernés

Nouveau coordinateur ; adaptation de `accountScopedStorage`,
`accountBusinessStorage`, `resourceAccess`, `resourceBackupJson`,
`legacyDataMigration`, de l'injection de test dans `userSessionStore`, de la page
Ressources et du panneau JSON ; nouveau test du coordinateur, chargeur de modules
TS commun et adaptations des tests des étapes précédentes.
