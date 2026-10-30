# 97C-2B3D10 — Intégrité cohérente de l’export et de la restauration

30 octobre 2026. **Correction de D9-01 validée sur données fictives.** Aucune activation de production.

## Cause et correction minimale

Le coordinateur vérifiait que la copie choisie figurait dans `recoverableResourceCopies`. Cette liste accepte les anciens formats structurellement lisibles pour le diagnostic, y compris des entrées sans empreinte persistée. L’export certifié imposait déjà une empreinte v2, mais cette exigence manquait au point de restauration.

Trois fichiers applicatifs corrigés :

- `app/lib/resourceArchiveIntegrity.ts` : ajout de `verifiedResourceCopyFingerprint`, contrôle commun de propriétaire/provenance, format v2, correspondance exacte du contenu et intégrité via le vérificateur existant `validFlatEntry`. Aucun nouvel algorithme de hachage.
- `app/lib/resourceBackupJson.ts` : l’export certifié utilise ce contrôle commun au lieu de son contrôle séparé.
- `app/lib/resourceWriteCoordinator.ts` : la restauration utilise le même contrôle sous le Web Lock de compte. Il est exécuté lors de la validation de la sélection, puis à nouveau immédiatement avant la première écriture, après le contrôle d’espace. Les octets persistés des ressources, journal, état et migration doivent toujours correspondre au diagnostic ; chaque lecture revalide aussi la session.

Une copie historique sans empreinte persistée est refusée **avant toute écriture** et avant toute création d’entrée de récupération. Aucune empreinte ne lui est ajoutée pour la rendre admissible. Les validateurs historiques de lecture restent inchangés ; leurs journaux et copies restent disponibles pour diagnostic. Une copie moderne vérifiée reste restaurable même si des entrées historiques sans empreinte sont conservées dans le même journal.

Le message explicite, remonté par les panneaux existants, est :

> Copie historique sans empreinte SHA-256 persistée et vérifiable : restauration et export certifié refusés. Journaux et copies conservés pour diagnostic.

Le refus s’applique également à l’inspection préparatoire d’une restauration non admissible. Le diagnostic historique reste exportable. Les confirmations, les comparaisons de snapshot, la relecture de sauvegarde, le contrôle du quota, les permis révocables et l’ordre journal → pending → ressources → verified restent conservés.

## Validation

| Contrôle | Résultat final |
|---|---|
| `node --test tests/*.test.mjs tests/cloud-sync-suspension.cjs` | **21/21 fichiers réussis**, dont le contrôle D9 auparavant en échec |
| `npm run test:browser -- --config=playwright.resource-restoration-integrity.config.mjs` | **47/47 réussis**, vrai Chrome, aucun retry |
| `node node_modules/typescript/bin/tsc --noEmit` | Réussi |
| ESLint ciblé : trois modules applicatifs, tests modifiés et nouvelle configuration | Réussi sans avertissement |
| `npm run build` | Réussi, Next.js 16.4.3, 20 pages |
| `git diff --check` | Réussi |

La suite Chrome réutilise la recette V2 : deux vrais onglets, remplacement concurrent, initialisation concurrente, récupération interrompue puis reprise contrôlée, sessions périmées, Web Locks absent, vingt remplacements sans imbrication et export sous quota natif saturé. L’assertion D9 de refus reste inchangée et passe désormais.

| Cas obligatoire / complémentaire | Résultat |
|---|---|
| Ancienne copie sans SHA-256 | Restauration refusée en mémoire et dans Chrome ; **zéro écriture**, stockage exact inchangé |
| Même copie, export certifié | Refus confirmé |
| Copie moderne avec empreinte persistée valide | Restauration exacte autorisée avec espace suffisant et confirmations |
| Empreinte incorrecte ou absente dans une entrée v2 | Refus, y compris lors d’un appel direct au coordinateur avec diagnostic fourni ; aucune mutation |
| Mauvais propriétaire de l’entrée ou de la provenance | Refus ; comptes et journaux inchangés |
| Source altérée pendant le contrôle d’espace | Nouveau contrôle avant écriture : refus ; **zéro écriture applicative** et aucune modification supplémentaire après l’altération fictive injectée |
| Journal mêlant copies anciennes et modernes | Refus de l’ancienne copie, restauration de la moderne ; octets et espaces du journal antérieur conservés, aucune empreinte ajoutée à l’ancienne entrée |
| Deux onglets concurrents | Un succès et un conflit, aucun écrasement silencieux |
| Interruption et récupération sécurisée | Anciennes copies conservées, diagnostic frais et confirmations nécessaires ; reprise moderne vérifiée |
| Quota insuffisant / session périmée | Protections existantes maintenues et tests réussis |

La fixture de récupération saine du test unitaire existant a été actualisée pour contenir des empreintes **dès la création de ses données fictives**, calculées indépendamment avec `node:crypto`. Ses assertions de succès, concurrence et interruption n’ont pas été affaiblies. Les tests D9 conservent une véritable copie historique sans empreinte et leurs assertions de refus. Des cas supplémentaires couvrent les empreintes invalides, propriétaires incorrects, altérations tardives et journaux mixtes.

Lors de l’ajout du test d’altération tardive, une première assertion attendait le libellé « Conflit ». Le gestionnaire existant constate le journal désormais corrompu et remonte l’erreur d’intégrité de récupération. L’assertion a été précisée sur cette erreur ; les exigences de zéro écriture et de conservation exacte restent vérifiées. Aucun correctif de quota ou de classification générale des erreurs n’a été ajouté.

## Fichiers de tests et preuves

- `tests/resource-manual-recovery.test.mjs` : fixture saine v2 et cas complémentaires de refus/conservation.
- `tests/resource-final-v2-integrity.test.mjs` : assertions D9 intactes ; sorties courantes déplacées vers le dossier D10 pour conserver les preuves D9 précédentes.
- `playwright.resource-restoration-integrity.config.mjs` : réutilisation de la suite V2, sans retry, sorties dédiées.
- Preuves : `test-results/resource-restoration-integrity/browser-results.json`, pièces Playwright `legacy-integrity-browser.json` et `legacy-integrity-unit.json`. Le test mémoire atteste `exportRefused: true`, `outcome.status: rejected`, `writes: 0` et les snapshots avant/après identiques.

## Limites et sécurité maintenues

Les anciennes copies sans empreinte ne peuvent pas être restaurées par le parcours ordinaire ; elles sont conservées pour une expertise distincte. Leur attribuer aujourd’hui une nouvelle empreinte ne prouverait pas leur intégrité historique.

Les limites localStorage, la croissance linéaire du journal et l’absence de transaction multi-clés restent celles des étapes précédentes. Une empreinte n’est pas une signature contre un script de même origine capable de modifier données et empreinte. L’authentification distante et les autres conditions de pilote ne sont pas réévaluées par cette correction ciblée.

`ACCOUNT_SCOPED_RESOURCES_ENABLED`, `RESOURCE_JSON_REPLACEMENT_ENABLED` et `MANUAL_RESOURCE_RECOVERY_ENABLED` restent `false`. `CLOUD_SYNC_SUSPENDED` reste `true`. Aucun changement Supabase, aucune migration réelle, aucune donnée réelle utilisée, aucune copie supprimée et aucune route de test ajoutée à l’application.

**D9-01 est corrigée dans les scénarios validés. Ce bilan ne prononce pas à lui seul un GO pilote et n’active aucun système.**
