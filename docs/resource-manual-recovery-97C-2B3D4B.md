# 97C-2B3D4B — Récupération manuelle sécurisée des ressources

Recette du 29 octobre 2026. Implémentation préparée et testée exclusivement avec des comptes fictifs. Aucune récupération réelle, migration réelle, modification des clés historiques ou requête Supabase. Les autres modules métier ne sont pas modifiés.

## Activation et périmètre

`ACCOUNT_SCOPED_RESOURCES_ENABLED = false` et `CLOUD_SYNC_SUSPENDED = true` restent inchangés. Le nouveau commutateur source `MANUAL_RESOURCE_RECOVERY_ENABLED = false` bloque le parcours manuel. Le coordinateur refuse également une écriture `recovery` sans injection explicite `manualRecoveryEnabled: true`. Le banc de test injecte ces autorisations uniquement dans son stockage fictif ; aucun réglage localStorage, URL ou bouton ne permet l’activation en production.

Ces autorisations sont des garde-fous applicatifs pour les appels internes, pas une protection contre un script malveillant de même origine ou DevTools. Aucune activation de production n’est recommandée par cette recette.

## Protections et déroulement

1. **Diagnostic existant sous verrou.** `previewRecovery` réutilise l’export 97C-2B3D4A et son Web Lock par compte. L’aperçu n’écrit rien. Une session confirmée, un diagnostic nécessitant une récupération et un journal analysable sont obligatoires.
2. **Choix conservateur.** Les copies `beforeRaw` et `candidateRaw` sont proposées uniquement si le journal complet passe les contrôles de propriétaire, identifiants uniques, dates, types d’opération et validation Ressources existante. Une source explicitement attribuée à un autre compte est refusée. Une copie absente n’est jamais convertie en `[]`. Un tableau vide explicitement enregistré reste une copie valide.
3. **Aperçu.** L’interface permet de choisir la copie et affiche son contenu complet. Le candidat réel reste une chaîne privée capturée dans une WeakMap : modifier l’objet affiché ne modifie pas les octets à écrire. Les aperçus forgés, périmés ou déjà consommés sont refusés.
4. **Sauvegarde préalable obligatoire.** Le fichier JSON exporté est le diagnostic complet du compte : données courantes brutes, journal, marqueur et état de migration. Il reste utilisable comme pièce de sécurité même lorsque le marqueur est incomplet. L’utilisateur doit enregistrer puis sélectionner à nouveau ce fichier. Sa chaîne doit être exactement identique au diagnostic de l’aperçu ; cocher une case ou fournir une autre sauvegarde ne suffit pas. Le système ne peut pas garantir la durabilité physique ou la disponibilité future du fichier sur disque.
5. **Consentement.** Recopie exacte du propriétaire, validation du contenu, demande explicite de récupération et confirmation du navigateur. L’API contrôle indépendamment les confirmations, la preuve de relecture et l’identité de l’aperçu.
6. **Contrôles sous le coordinateur existant.** Après acquisition du même Web Lock que les écritures ordinaires, le propriétaire est revalidé. Les quatre valeurs brutes (`resources`, journal, marqueur, état de migration) doivent être exactement celles du diagnostic. La sélection et son intégrité sont revérifiées. Toute modification concurrente produit un conflit avant écriture.
7. **Zone temporaire dans le journal existant.** Une entrée `kind: recovery` est ajoutée sans retirer les précédentes. Elle contient `beforeRaw`, `candidateRaw`, `stagedRaw`, la sélection d’origine et le diagnostic préalable complet. Le journal est relu et comparé exactement avant de poursuivre. Cette entrée constitue la préparation persistante ; aucune clé temporaire ou second journal n’est créé.
8. **Écriture et validation.** Le marqueur `pending` est écrit et relu. La destination est comparée à nouveau à la base attendue, puis le candidat est écrit et relu exactement. Après vérification finale des données, le marqueur `verified` est écrit et relu, puis journal et ressources sont comparés exactement et le contrôle commun de cohérence est exécuté. L’API vérifie encore la session après restitution du verrou avant de signaler le succès.
9. **Échec.** L’aperçu est consommé dès la tentative d’écriture. Une erreur n’entraîne ni rollback automatique, ni effacement du journal, ni réessai automatique. Une entrée ajoutée sans marqueur, un état `pending` ou une différence de contenu maintient le blocage des écritures ordinaires. Un nouveau diagnostic et une nouvelle sauvegarde préalable sont nécessaires à une nouvelle tentative manuelle.

Le marqueur courant peut devenir `verified` pour la nouvelle opération de récupération. L’ancien marqueur incomplet est conservé à l’identique dans son diagnostic archivé, et toutes les anciennes entrées restent présentes. Il n’est pas réécrit comme si l’import initial avait réussi.

## Cas volontairement refusés

Un journal tronqué, un snapshot malformé dans l’historique, un propriétaire incohérent, un marqueur présent mais invalide ou des ressources courantes corrompues bloquent ce parcours conservateur. Il ne reconstruit pas un journal endommagé et ne propose pas de restauration depuis un fichier externe arbitraire. Ces situations nécessitent une expertise distincte ; le diagnostic brut reste exportable si les lectures fonctionnent.

Un marqueur absent avec journal complet ou une destination absente restent récupérables depuis une copie saine explicite. Un échec de lecture empêche l’aperçu ou la validation : il n’est pas assimilé à une corruption ni remplacé par une liste vide.

## Procédure recommandée

Dans un environnement de validation explicitement autorisé uniquement : confirmer le compte, préparer l’aperçu, examiner la copie, enregistrer le diagnostic complet, relire le fichier enregistré, recopier le propriétaire et confirmer. Après un succès, refaire un diagnostic et vérifier le contenu. Après un échec, conserver les fichiers et les journaux, refaire le diagnostic et décider manuellement d’une nouvelle intervention. Ne pas modifier les clés dans DevTools ni contourner le verrou. Le parcours reste masqué et désactivé dans la configuration livrée.

## Tests et résultats

- `node --test tests/*.test.mjs tests/cloud-sync-suspension.cjs` : **16/16 fichiers réussis**. Inclut tous les tests antérieurs, les tests API de récupération et les tests du panneau via le banc de hooks.
- `npm run test:browser -- --config=playwright.resource-manual-recovery.config.mjs` : **21/21 tests réussis** avec deux onglets Chromium, stockage préfixé par scénario, comptes fictifs et requêtes externes bloquées. Inclut 19 régressions antérieures et deux nouveaux scénarios : une récupération concurrente réussit, l’autre reçoit un conflit ; une récupération interrompue reste bloquée après rafraîchissement puis réussit uniquement après une nouvelle préparation manuelle.
- `node_modules\.bin\tsc.cmd --noEmit` : réussi.
- ESLint ciblé sur les composants, modules, tests et configuration modifiés : réussi sans avertissement.
- `npm run build` : réussi, Next.js 16.4.3, 20 pages générées.

Les tests API couvrent : copie saine, aperçu modifié sans effet sur le candidat, fichier préalable absent/différent, confirmations manquantes, sélection forgée, copie absente/corrompue, mauvais propriétaire ou source étrangère, absence de marqueur/destination, quatre types de modifications concurrentes, session révoquée pendant l’attente, deux demandes sur le verrou natif, interruption avant et après persistance de chacune des quatre écritures, quota localStorage, écritures silencieusement altérées et erreur de lecture après copie. Les anciennes entrées, diagnostics et sentinelles B/historiques sont contrôlés. Les tests UI vérifient les portes de confirmation, le fichier relu, le succès et l’état d’échec imposant un nouveau diagnostic. Ils ne remplacent pas une recette visuelle avec React DOM.

Preuves navigateur séparées : `test-results/resource-manual-recovery-97C-2B3D4B/` (ignoré par Git). Les sorties D4A et précédentes ne sont pas écrasées.

## Limites restantes

- **Pas de transaction atomique multi-clés.** Les quatre écritures restent séparées. Une panne peut laisser un état partiel et nécessiter une intervention. Le journal rend cet état détectable ; il ne garantit ni rollback atomique ni récupération universelle.
- Si l’écriture finale `verified` a effectivement persisté mais que l’appel échoue ensuite, l’appel ne signale pas de succès. Un diagnostic frais peut constater un état cohérent déjà vérifié ; il ne faut pas relancer aveuglément. Ce cas est testé par une exception injectée après persistance du marqueur final.
- Les lectures exactes établissent la cohérence visible à cet instant, pas la durabilité disque. Une perte du profil, une éviction du stockage ou une corruption physique peut détruire toutes les copies locales. Le fichier externe vérifié reste indispensable.
- Web Locks coordonne les appels coopératifs d’une même origine. Il ne bloque pas les modifications directes par un script extérieur au coordinateur. Une erreur de stockage qui altère elle-même un journal au lieu de conserver la valeur demandée ne permet pas de garantir la conservation locale ; aucun succès n’est alors déclaré.
- La présence d’un propriétaire et la validité structurelle ne sont pas une signature cryptographique ou une preuve de justesse métier. L’examen humain reste obligatoire.
- Archiver le diagnostic complet dans une nouvelle entrée augmente le volume, surtout lors de tentatives répétées. Un quota insuffisant provoque un refus ; aucun nettoyage automatique ne libère de place. La stratégie de conservation D4A reste applicable pour une étape future explicitement autorisée.
- Seules les ressources sont récupérées. L’état de migration et les autres catégories ne sont jamais modifiés ; cette récupération ne répare pas une migration des autres modules.

## Fichiers modifiés ou ajoutés

| Fichier | Rôle |
|---|---|
| `app/lib/resourceWriteCoordinator.ts` | Branche de récupération désactivée par défaut, revalidation sous verrou, préparation journalisée, contrôles exacts finaux |
| `app/lib/resourceRecoveryAssessment.ts` | Éligibilité conservatrice et validation des entrées de récupération |
| `app/lib/resourceBackupJson.ts` | Commutateur désactivé, aperçu privé, relecture de sauvegarde et exécution confirmée |
| `app/components/ResourceManualRecoveryPanel.tsx` | Nouveau parcours manuel et états succès/échec |
| `app/components/ResourceJsonBackupPanel.tsx` | Intégration au panneau existant derrière l’isolation désactivée |
| `tests/resource-manual-recovery.test.mjs` | Tests de sûreté API, concurrence et pannes |
| `tests/resource-manual-recovery-ui.test.mjs` | Tests des confirmations et états d’interface |
| `tests/browser/resource-harness.mjs` | API de récupération injectée exclusivement dans le banc fictif |
| `tests/browser/resource-manual-recovery.spec.mjs` | Concurrence entre onglets et interruption avec rafraîchissement |
| `playwright.resource-manual-recovery.config.mjs` | Recette D4B, sorties séparées |
| Ce rapport | Protections, procédure, validations et limites |
