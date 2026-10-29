# 97C-2B3B — JSON des ressources isolées, non activé

`ACCOUNT_SCOPED_RESOURCES_ENABLED` reste à `false`. Aucun import, export du
navigateur, migration réelle ou accès à Supabase n'a été effectué pendant les tests.
Les écritures cloud et les actions ressources vers l'historique/relance des
prospects restent bloquées comme auparavant.

## Formats et compatibilité

| Format | Propriétaire | Contenu et chargement |
| --- | --- | --- |
| Historique v1–v4 (ou ancien fichier sans version) | Inconnu | Les cinq champs métier restent inchangés : `prospects`, `resources`, `settings`, `streetMarketingSurvey`, `customMessageTemplates` |
| Historique exporté alors que le mode Ressources sera isolé | Aucun | Même format v4, annoté `storageScope: legacy-shared` ; jamais présenté comme appartenant au compte courant |
| Ressources isolées v5 | `ownerUserId` = UUID Supabase confirmé | `storageScope: account-resources`, date et ressources uniquement ; aucun tableau prospects vide inventé ni autre catégorie partagée |
| Copie de sécurité d'une destination absente | UUID confirmé | `storageScope: account-resource-safety`, `resources: null`, `rawResources: null` ; preuve explicite d'absence, non importable comme liste de ressources |

Le parseur conserve le payload historique sans normalisation des quatre autres
catégories, mais le nouveau chargement n'écrit que les ressources. Les anciens
fichiers valides se chargent toujours dans le parcours historique lorsque le mode
est désactivé. Les fichiers déclarés par compte sont refusés par l'ancien
importeur : ils ne peuvent pas être rétrogradés silencieusement vers les clés
partagées. La compatibilité porte sur la lecture des anciens formats, pas sur la
capacité d'une ancienne application à comprendre les fichiers v5.

Le format Ressources isolées refuse les fichiers qui contiennent aussi les
autres catégories métier. Un propriétaire incorrect, invalide ou différent du
compte confirmé est refusé, sans possibilité de passer outre par une case cochée.

## Parcours historique conservé

Quand l'indicateur est désactivé, le bouton d'export, les fonctions de chargement,
les normalisations et les cinq écritures historiques restent utilisés. Aucun
owner n'est ajouté au fichier v4. La nouvelle section isolée n'est pas montée.

Quand il sera activé, la page affichera séparément :

- le résumé et l'export historiques, explicitement partagés, sans propriétaire ;
- la section « Sauvegarde JSON des ressources isolées », liée au compte confirmé.

L'ancien import global sera désactivé dans ce mode afin de ne pas changer les
quatre autres modules ni de modifier des données partagées à partir d'un fichier
par compte. Aucun fallback vers les anciennes clés n'existe dans le nouveau
service. Les commandes cloud ne sont pas modifiées.

## Procédure préparée

1. Capturer le `user.id` et la génération via `UserSessionProvider`. Exiger une
   migration vérifiée pour l'export et l'import. Le service lit avec
   `accountBusinessStorage`; une catégorie absente ne devient jamais une liste
   vide automatiquement.
2. Lire et prévisualiser le fichier sans écriture : propriétaire déclaré ou
   inconnu, catégories présentes, nombre et liste des ressources, destination.
3. Exiger la vérification de l'aperçu, la saisie de l'UUID et une attestation de
   propriété. Pour un fichier historique, demander séparément la vérification
   manuelle de son propriétaire. En cas de doute, aucune copie.
4. Télécharger la sauvegarde préalable de la destination, puis confirmer son
   enregistrement et sa vérification. La sauvegarde est liée à cet aperçu et à
   son compte. Le navigateur ne peut pas prouver l'enregistrement physique du
   fichier : il s'agit d'une confirmation explicite, jamais cochée par défaut.
5. Vérifier à nouveau session et destination après acquisition du verrou Web
   Locks. Si la destination diffère de celle de l'aperçu, abandonner sans la
   remplacer. Un fichier importé n'a aucun effet sur le marqueur de migration.
6. Avant toute copie de ressources, ajouter au journal les chaînes exactes de
   la destination précédente et du candidat. Relire ce journal pour le vérifier.
7. Écrire un état `pending`, qui bloque les lectures/écritures de ressources par
   l'adaptateur métier. Copier le candidat avec le magasin isolé lié au jeton du
   propriétaire, puis comparer exactement la chaîne relue au candidat capturé.
8. Marquer `verified` seulement après cette comparaison. Aucun indicateur global
   n'est activé par un import ; les quatre autres catégories sont inchangées.

Les deux nouvelles clés sont exclusivement par compte :

- `travel-prospect-crm:account:v1:<user.id>:resource-import-journal` : journal
  cumulatif contenant `importId`, compte, date, propriétaire source et chaînes
  `beforeRaw`/`candidateRaw` ; aucun ancien enregistrement n'est purgé.
- `travel-prospect-crm:account:v1:<user.id>:resource-import-state` : dernier état
  `pending` ou `verified`, compte, identifiant d'import et dates.

Une erreur pendant la copie laisse la sécurité conservée et l'accès aux
ressources bloqué si l'état est `pending`. Aucun rollback destructif, effacement
du journal ou nouvelle attribution à un autre compte n'est automatique. Les
autres catégories métier restent lisibles. Une récupération manuelle depuis le
journal/fichier préalable doit être prévue avant de permettre de telles opérations
en production.

## Remplacement volontairement bloqué par défaut

Même si le mode isolé est ultérieurement activé, le service refuse toute
destination déjà présente (y compris `[]`) tant que sa politique de remplacement
reste `blocked`, qui est le défaut employé par le panneau.

Les tests positifs injectent `replacementPolicy: coordinated` dans un stockage
simulé où les écritures sont contrôlées. La procédure de remplacement exige alors
en plus une autorisation explicite. Cette option n'est pas fournie par l'interface.
Elle ne devra être utilisée que lorsque **tous** les écrivains de ressources,
y compris la page Ressources et les autres onglets, respecteront le même verrou
`travel-prospect-crm:resource-json-import`.

Web Locks coordonne actuellement les imports entre eux ; les sauvegardes de liste
de la page Ressources demeurent synchrones. Une suite de comparaisons localStorage
ne constitue pas une transaction contre ces écrivains non coordonnés. Le blocage
par défaut empêche donc de présenter un remplacement comme sûr avant ce travail.

## Conditions restantes avant activation

1. Conserver l'indicateur Ressources à `false` jusqu'à la décision explicite.
2. Faire la sauvegarde JSON et la migration manuelle du bon propriétaire ; vérifier
   la copie, l'empreinte historique et les données Ressources pour chaque compte.
3. Coordonner tous les écrivains Ressources avec le verrou avant de rendre le
   remplacement disponible ; prévoir la récupération d'un import incomplet et les
   limites de taille/quota du journal, sans suppression automatique des sécurités.
4. Valider dans un navigateur les comptes A/B, les confirmations, les téléchargements,
   les changements de session et les conflits inter-onglets. Les tests de hooks
   et gestionnaires utilisent des doubles déterministes, pas une navigation réelle.
5. Définir séparément la sauvegarde isolée des quatre autres catégories avant de
   proposer un export complet par compte. Ne jamais renommer le v4 partagé en
   sauvegarde complète isolée.
6. Ne débloquer les actions ressources vers prospects qu'après isolation et
   confirmation du propriétaire des prospects. Ne réactiver aucune écriture cloud.

## Tests

`resource-backup-json.test.mjs` vérifie les propriétaires A/B, le parseur historique
des cinq catégories, les confirmations, l'aperçu sans écriture, le refus par défaut
d'une destination présente, la procédure coordonnée simulée, les conflits, les
changements de session, les quotas/corruptions, les sécurités cumulatives et le
blocage des ressources non vérifiées.

`historical-backup-compatibility.test.mjs` exécute les véritables gestionnaires de
la page avec hooks et stockage simulés : conservation des cinq catégories en mode
historique, export partagé explicite et refus de l'ancien importeur en mode isolé.
