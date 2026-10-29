# 97C-2B3D4A — Préparation de la récupération manuelle

Recette du 29 octobre 2026. Aucune activation, récupération, suppression, migration réelle ou écriture Supabase. `ACCOUNT_SCOPED_RESOURCES_ENABLED` reste `false` et `CLOUD_SYNC_SUSPENDED` reste `true`. Le panneau préparé reste donc masqué en production.

## Résultat et fichiers

- `app/lib/resourceWriteCoordinator.ts` : enrichit l’export de diagnostic existant à partir d’un seul snapshot sous le Web Lock existant ; contrôle du propriétaire avant, pendant et après l’attente. Les chaînes brutes restent disponibles pour expertise. Aucun nouveau journal.
- `app/lib/resourceRecoveryAssessment.ts` : analyse pure du snapshot ; propriétaire et opération, copies avant/candidat, validité structurelle, correspondance avec les données, options indicatives et conservation.
- `app/lib/resourceValidation.ts` et `app/lib/resourceAccess.ts` : extraction sans changement du validateur Ressources existant, réexporté pour compatibilité ; partagé avec l’analyse sans dépendance circulaire.
- `app/lib/resourceBackupJson.ts` : réutilise le parseur de sauvegarde pour vérifier un fichier externe du même compte sans lire la destination bloquée ; revalide aussi la session avant restitution du diagnostic.
- `app/components/ResourceJsonBackupPanel.tsx` : affiche le diagnostic exporté, les copies disponibles, le volume, l’avertissement, les options et la politique de conservation ; vérification externe distincte de l’import.
- `tests/resource-recovery-preparation.test.mjs` : scénarios dédiés, stockage en mémoire refusant toute écriture et toute suppression, refus d’accès à B.
- `tests/browser/resource-harness-server.mjs` : autorise les deux nouvelles dépendances du banc fictif.
- `playwright.resource-recovery.config.mjs` : sorties de recette séparées, sans écraser les preuves précédentes.

## Interprétation

Une exception de lecture, un verrou indisponible ou une session révoquée empêche la publication du diagnostic. L’interface indique que l’intégrité reste indéterminée : aucune corruption ne doit être déduite d’une erreur d’accès.

Après une lecture réussie, du JSON malformé ou une structure invalide constitue une anomalie structurelle observable. Un état `pending`, un marqueur absent ou une différence avec le candidat vérifié exige un examen, sans prouver une corruption des ressources. Un tableau structurellement valide ne prouve ni la justesse métier ni l’authenticité des données. Les copies d’un propriétaire incohérent sont exclues des propositions ; aucun accès à son espace de stockage n’est effectué.

Les copies avant/après de chaque entrée sont contrôlées avec le validateur existant. Une copie absente reste distincte d’une liste vide. Les sauvegardes externes ne sont pas recherchées sur le disque : seule la sélection explicite d’un fichier déclenche sa vérification. Les fichiers historiques sans propriétaire confirmé sont refusés par ce parcours de vérification ; ils exigent une expertise séparée.

## Volume et conservation proposée

Le diagnostic mesure les valeurs du journal et du marqueur à raison de deux octets par unité UTF-16 ; les clés et le surcoût navigateur sont exclus. Ce n’est ni une mesure de quota ni une mesure disque. Le seuil indicatif de volume anormal est fixé à 1 Mio cumulé ; aucun nettoyage n’est déclenché.

Conserver intégralement les journaux tant qu’une opération reste non résolue. Pour une étape future, proposer un examen à 90 jours ou au franchissement du seuil, avec conservation du dernier état vérifié et de toutes les copies nécessaires aux opérations non résolues. Avant tout éventuel nettoyage : exporter, relire et vérifier l’archive pour le même propriétaire, obtenir une décision explicite, reprendre le verrou commun et revérifier session et état. Âge et volume ne constituent jamais seuls une autorisation de suppression. Aucun mécanisme de nettoyage n’est implémenté ici.

## Procédure manuelle recommandée

1. Maintenir les indicateurs actuels. Ne pas utiliser l’import normal pour contourner un blocage et ne pas modifier localStorage dans DevTools.
2. Dans un environnement de validation autorisé, avec le compte concerné confirmé, demander le diagnostic existant. Il attend la fin d’une écriture active ; ne pas forcer la libération d’un verrou.
3. Conserver le fichier exporté contenant données, journal et marqueurs bruts. Le stocker dans un emplacement privé ; il contient des données du compte. Relever propriétaire, identifiant, type, date et statut de l’opération.
4. Si la lecture échoue, résoudre d’abord l’accès ou la session et refaire le diagnostic. Ne décider d’aucune récupération à partir de ce seul échec.
5. Comparer les données actuelles avec les copies avant/après, vérifier leur intégrité et examiner une sauvegarde externe du même compte si disponible. Contrôler manuellement date, contenu et complétude ; ne pas assimiler validité structurelle et contenu correct.
6. Préparer une décision documentée : conserver les données actuelles, examiner le retour à une copie avant, ou examiner le candidat. Une copie absente, invalide ou non attribuable ne doit pas être restaurée. Si aucune copie fiable n’existe, conserver les preuves et solliciter une expertise.
7. S’arrêter à cette proposition. L’exécution nécessitera une étape distincte explicitement autorisée, avec sauvegardes vérifiées, nouvelle lecture sous verrou et contrôle du propriétaire. Cette version ne restaure rien et ne marque aucune opération comme réparée.

## Validation

- `node --test tests/*.test.mjs tests/cloud-sync-suspension.cjs` : 14/14 fichiers réussis.
- Scénarios dédiés : import interrompu avant/après copie, marqueur absent, état cohérent vérifié, copies absentes/corrompues, journal malformé, ressources corrompues, propriétaire incohérent, changement de compte pendant l’attente et après restitution du verrou, erreurs de lecture des quatre clés, journal volumineux et fichier externe valide/invalide/d’un autre compte. Conservation du stockage vérifiée.
- `npm run test:browser -- --config=playwright.resource-recovery.config.mjs` : 19/19 tests réussis, comptes fictifs, requêtes externes bloquées. Sorties dans `test-results/resource-recovery-97C-2B3D4A/` (ignorées par Git).
- `node_modules\.bin\tsc.cmd --noEmit` : réussi.
- `npm run build` : réussi, Next.js 16.4.3, 20 pages générées.
- ESLint ciblé sur les fichiers applicatifs, tests et configuration modifiés : réussi sans avertissement.

Les tests navigateur vérifient les API de stockage et leur coordination entre onglets ; ils ne constituent pas une recette visuelle du nouveau panneau masqué. Aucun test ne manipule de véritables comptes ou données CRM.
