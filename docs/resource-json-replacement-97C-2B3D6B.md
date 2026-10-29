# 97C-2B3D6B — Remplacement sécurisé des Ressources par JSON

Recette du 29 octobre 2026. Remplacement volontaire implémenté et testé exclusivement avec des identités fictives. **Aucune activation en production.** `ACCOUNT_SCOPED_RESOURCES_ENABLED = false`, `RESOURCE_JSON_REPLACEMENT_ENABLED = false`, `MANUAL_RESOURCE_RECOVERY_ENABLED = false` et `CLOUD_SYNC_SUSPENDED = true` sont conservés.

## Parcours et protections

1. **Propriétaire confirmé.** Le parseur existant contrôle le format Ressources, le périmètre du fichier, sa version et le `ownerUserId`. Le store existant confirme la session et son propriétaire. Le parcours JSON isolé refuse désormais tout fichier sans propriétaire identifié, même si une case de confirmation historique aurait été cochée. Il refuse aussi un fichier d’un autre compte. Le parseur historique et l’importateur partagé des cinq catégories restent compatibles et inchangés.
2. **Snapshot cohérent.** L’aperçu réutilise l’export de diagnostic existant sous le verrou Ressources. L’audit du journal et l’analyse structurelle doivent réussir ; la disponibilité Ressources du compte est contrôlée dans ce même verrou. Aucune erreur de lecture ne devient une liste vide. Un compte neuf doit être explicitement initialisé avant ce parcours.
3. **Aperçu avant/après.** L’interface affiche les ressources actuelles et celles du fichier, avec les contenus complets. Une liste source `[]` est annoncée comme volontairement vide. Les objets affichés sont détachés des chaînes privées de l’aperçu : une mutation de l’objet affiché ne change pas les octets à écrire.
4. **Sauvegarde préalable complète pour le périmètre Ressources.** Le JSON généré contient les ressources actuelles, leurs octets d’origine, le propriétaire et le diagnostic complet : journal, marqueur Ressources et état de migration bruts. Il ne sauvegarde ni ne lit les autres catégories métier. Le fichier est téléchargé puis sélectionné à nouveau. Sa relecture doit être exactement identique à la chaîne générée pour cet aperçu ; une case cochée, un fichier partiel ou une autre sauvegarde ne suffit pas à autoriser un remplacement.
5. **Consentement explicite.** Validation de l’aperçu, propriété exclusive, recopie du `user.id`, consentement séparé au remplacement de la destination sauvegardée et confirmation navigateur. L’API contrôle indépendamment confirmations, politique d’activation et preuve de relecture. Les aperçus forgés, consommés ou issus d’une session révoquée sont refusés.
6. **Nouvelle vérification sous Web Lock.** Le coordinateur existant reprend le verrou exclusif du compte. Il revalide la capacité propriétaire, le journal et son état, le propriétaire de la source et de la sauvegarde, puis compare exactement les quatre valeurs capturées : Ressources, journal, marqueur et migration. Un changement du journal ou du marqueur est un conflit même si les Ressources ont conservé les mêmes octets. La disponibilité et la session sont encore contrôlées avant les écritures.
7. **Préparation dans le journal existant.** Une entrée `kind: import` est ajoutée aux anciennes entrées. Elle conserve `beforeRaw`, `candidateRaw` et une section `replacement` contenant le candidat temporaire `stagedRaw`, le diagnostic et le fichier préalable complet. Le journal est relu exactement avant toute écriture définitive des Ressources. Aucun second journal ni nouvelle clé de staging n’est créé.
8. **Validation finale.** Après préparation, le marqueur `pending` est écrit et relu, la base est à nouveau comparée, puis le candidat est écrit et relu exactement. Le marqueur `verified` est ensuite écrit et relu ; le journal et les données sont encore comparés et l’audit commun est exécuté. La session est vérifiée après restitution du verrou avant d’annoncer le succès.
9. **Échec contrôlé.** Une tentative consomme l’aperçu. Aucun rollback, nettoyage, remplacement automatique ou réessai aveugle n’est exécuté. Les copies et le fichier préalable sont conservés. L’interface affiche « Récupération nécessaire » et demande un nouveau diagnostic avant intervention. Si le refus a précédé la première écriture, le diagnostic peut légitimement constater un état encore cohérent : ce message n’est pas, à lui seul, une preuve de corruption.

La relecture exacte de sauvegarde est exigée pour le remplacement d’une destination existante. Le parcours antérieur vers une destination Ressources absente conserve sa confirmation de sauvegarde d’absence explicite ; il ne peut plus accepter un fichier isolé sans propriétaire confirmé.

## Activation de recette uniquement

Le nouveau commutateur source `RESOURCE_JSON_REPLACEMENT_ENABLED` reste faux. Par défaut, le composant et l’API refusent le remplacement d’une destination existante. L’injection interne `replacementPolicy: coordinated` reste disponible pour les fixtures contrôlées.

Le serveur autonome de tests peut activer le commutateur uniquement dans son bundle en mémoire via une option du serveur. Il ne modifie aucun fichier applicatif et ne crée ni paramètre URL d’activation ni contournement d’authentification dans l’application Next. Le profil est neuf, les clés sont préfixées par scénario, seuls les UUID fictifs A/B sont autorisés, les connexions externes sont bloquées et le SDK Supabase est remplacé par un refus. Les indicateurs source avant/après sont vérifiés par empreintes dans les preuves de recette.

Aucune ancienne clé, réservation historique, table Supabase, synchronisation cloud ou action Ressources vers Prospects n’est modifiée. Les seuls fichiers applicatifs modifiés concernent le panneau JSON, l’API JSON, le coordinateur Ressources et l’analyse de son journal.

## Résultats

| Vérification | Résultat final |
|---|---|
| `node --test tests/*.test.mjs tests/cloud-sync-suspension.cjs` | **18/18 fichiers réussis** |
| `npm run test:browser -- --config=playwright.resource-json-replacement.config.mjs` | **36/36 tests réussis**, sans retry |
| `node_modules\.bin\tsc.cmd --noEmit` | Réussi |
| ESLint ciblé sur les fichiers applicatifs, tests et configuration modifiés | Réussi sans avertissement |
| `npm run build` | Réussi, Next.js 16.4.3, 20 pages générées |

Les 36 tests navigateur comprennent les 30 régressions précédentes et six nouveaux scénarios avec les vrais composants React. Les anciens tests API ont été adaptés pour fournir un fichier propriétaire confirmé et la preuve de relecture désormais obligatoire ; aucune assertion de conflit, d’interruption ou de conservation n’a été supprimée. Les fixtures API simulent la sauvegarde relue en mémoire ; les six nouveaux tests UI téléchargent et relisent réellement les fichiers via les APIs navigateur et le disque du banc.

### Scénarios demandés

| Scénario | Résultat observé |
|---|---|
| Remplacement valide A | Aperçu avant/après, consentement séparé, fichier préalable relu et ressources exactement égales au candidat |
| B inchangé | Octets B conservés, anciennes clés et première entrée du journal conservées |
| Mauvais propriétaire | A/B incohérents ou propriétaire absent : refus avant modification ; fichiers historiques sans propriétaire refusés par le parcours isolé |
| JSON corrompu | Parsing/structure invalides refusés sans destination modifiée |
| Sauvegarde impossible | Fichier préalable différent refusé ; accès stockage impossible pendant l’aperçu refusé ; quota lors de l’archivage du journal empêche le remplacement, destination intacte et fichier externe conservé |
| Deux onglets | Deux aperçus sur la même base : un succès et un conflit, aucune deuxième entrée de remplacement ni écrasement silencieux |
| Changement de session | Opération en attente sous A puis connexion B : résultat ancien refusé, aucune écriture de remplacement et aucun affichage des données A sous B |
| Interruption | Les quatre points d’écriture sont testés avant/après persistance en mémoire ; interruption avant le marqueur final et rafraîchissement réel dans Playwright : état bloqué et copies préservées |
| Récupération précédente | Vrai panneau manuel, fichier diagnostic de récupération téléchargé et relu, choix `beforeRaw` de l’import interrompu : octets précédents restaurés exactement, entrée d’import et sauvegarde complète conservées |
| Liste volontairement vide | Message explicite puis remplacement confirmé par `[]`, clé Ressources toujours présente et anciennes ressources conservées dans le journal |

Les tests unitaires couvrent également une modification cohérente du journal, du marqueur ou de la migration sans changement des Ressources ; une altération silencieuse des données ou du marqueur ; une erreur de lecture après copie ; la corruption des métadonnées de préparation et la consommation de l’aperçu après tentative. Aucun succès n’est annoncé dans ces cas.

Les sorties D6B sont séparées dans `test-results/resource-json-replacement-97C-2B3D6B/` : résultats JSON, fichiers préalables téléchargés, diagnostic avant récupération et preuves de sécurité par scénario. Elles sont ignorées par Git et doivent être archivées avec ce rapport. Les preuves des étapes précédentes ne sont pas écrasées.

## Procédure recommandée dans la recette

Confirmer le compte, sélectionner un fichier isolé du même propriétaire et examiner les deux listes. Télécharger la sauvegarde complète générée et relire ce fichier exact. Confirmer le contenu, le propriétaire et le remplacement, puis valider la confirmation navigateur. Après succès, refaire un diagnostic et vérifier le contenu.

Après un échec, ne pas réutiliser l’aperçu : conserver les fichiers et exporter un nouveau diagnostic. En cas d’état incomplet, préparer une récupération manuelle depuis une copie saine, avec sa propre sauvegarde préalable relue et sa confirmation. Une sauvegarde JSON ne contourne pas le blocage d’un journal incomplet.

## Risques résiduels

- **Aucune transaction atomique multi-clés localStorage.** Journal, marqueur et données restent des écritures séparées. Une interruption peut nécessiter une intervention manuelle ; aucune garantie de rollback automatique ou de récupération universelle n’est fournie.
- Si le marqueur final a persisté avant une interruption de l’appel, un diagnostic frais peut constater un état déjà vérifié alors que l’appel n’avait pas annoncé de succès. Le test après persistance du marqueur final couvre ce cas. Ne pas restaurer ou réessayer sans diagnostic.
- Les relectures exactes prouvent les octets visibles à cet instant, pas leur durabilité physique. Le système ne peut pas garantir la conservation future du fichier externe, du profil navigateur ou du disque. Une éviction du stockage peut supprimer les copies locales.
- Les sauvegardes complètes et diagnostics archivés contiennent déjà l’historique précédent. Leur imbrication augmente le volume du journal, parfois rapidement lors de remplacements répétés. Le quota et la mémoire peuvent limiter une nouvelle opération. Aucun journal n’est supprimé et aucun nettoyage n’est introduit ; la politique de conservation doit être traitée séparément.
- Web Locks protège les appels coopératifs de même origine. Il ne bloque pas un script extérieur au coordinateur ni DevTools. Les propriétaires dans les fichiers ne constituent pas une signature cryptographique de leur contenu ; l’examen humain reste nécessaire.
- La recette utilise Chromium et des sessions synthétiques. Elle ne valide pas un service Supabase distant, d’autres navigateurs ou une activation de production. Les garde-fous applicatifs ne constituent pas une protection contre du code malveillant de même origine.
- Une liste vide peut être un choix légitime mais retire toutes les ressources de la destination courante. Les anciennes copies restent conservées ; aucun retour arrière automatique n’est effectué.

**Cette étape autorise uniquement la recette fictive.** Toute activation du stockage, du remplacement JSON, de la récupération ou du cloud en production demeure une décision distincte.

## Fichiers modifiés ou ajoutés

| Fichier | Rôle |
|---|---|
| `app/lib/resourceBackupJson.ts` | Commutateur faux par défaut, snapshot diagnostic réutilisé, propriétaire strict, aperçu courant, sauvegarde complète et preuve privée de relecture |
| `app/lib/resourceWriteCoordinator.ts` | Vérification du snapshot sous verrou, préparation/archivage dans le journal existant et validation du propriétaire |
| `app/lib/resourceRecoveryAssessment.ts` | Contrôle des métadonnées et copies de remplacement dans les diagnostics et audits |
| `app/components/ResourceJsonBackupPanel.tsx` | Aperçu avant/après, fichier préalable relu, consentement, liste vide et message d’échec |
| `tests/resource-json-replacement.test.mjs` | Nouveaux tests de sûreté, concurrence, erreurs et récupération exacte |
| `tests/resource-backup-json.test.mjs` | Propriétaire confirmé et sauvegarde relue dans les régressions JSON |
| `tests/resource-write-coordinator.test.mjs` | Preuve de relecture dans la régression migration/CRUD/import |
| `tests/browser/resource-harness.mjs` | Preuve de sauvegarde simulée pour les anciens tests API fictifs |
| `tests/browser/resource-chain-harness.mjs` | Indicateur de recette et adaptation des imports API fictifs |
| `tests/browser/resource-chain-server.mjs` | Activation du remplacement uniquement dans le bundle de recette |
| `tests/browser/resource-chain.spec.mjs` | Option de fixture, contrôle de l’indicateur et partage du banc avec les nouveaux scénarios |
| `tests/browser/resource-json-replacement.spec.mjs` | Six nouveaux parcours UI avec téléchargements, relectures et récupération |
| `playwright.resource-json-replacement.config.mjs` | Suite complète et preuves D6B séparées |
| Ce rapport | Résultats, procédure et limites |
