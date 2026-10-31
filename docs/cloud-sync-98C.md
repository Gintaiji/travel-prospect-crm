# 98C — Contrats et diagnostic brut

31 octobre 2026. Références : `cloud-sync-98A-plan.md` (étape 98C, sections 4.1 et 5), `cloud-sync-98B-restoration-guard.md`. Code actuel vérifié, y compris la correction 98B-1 de Sauvegarde.

## Périmètre exact

Contrats de snapshot, révision et erreurs ; lecteur brut de diagnostic des cinq catégories historiques ; inventaire des preuves de schéma/RLS manquantes. Aucun raccordement à une page, un stockage actif ou au service cloud. Aucun transport, RPC, SQL, bootstrap, migration, outbox ou mécanisme d'application ajouté. **98D à 98K non commencées.**

## Fichiers ajoutés

- `app/lib/cloudSnapshotContract.ts` : version de format 1, catégories explicites, enveloppe non vérifiée, révision décimale PostgreSQL bigint et erreurs typées.
- `app/lib/cloudRawDiagnostics.ts` : lecture injectée limitée à `getItem`, clés historiques explicites, diagnostic sans normalisation.
- `tests/cloud-snapshot-contract.test.mjs` : quatre tests, fixtures fictives des cinq catégories.
- `docs/cloud-sync-98C.md` : présent rapport.

Aucun fichier applicatif existant modifié ; aucune configuration de sécurité ou règle ESLint assouplie. Les journaux locaux sont dans `test-results/cloud-sync-98C/` (répertoire ignoré).

## Protections et limites du contrat

La révision reste une chaîne canonique comprise entre 0 et 9223372036854775807 ; les nombres JS, signes, zéros initiaux, versions absentes et dépassements sont refusés. Aucune décision par horodatage. Le propriétaire attendu doit être un UUID canonique et correspondre à l'enveloppe ; la version inconnue, une catégorie manquante ou supplémentaire et les métadonnées d'intégrité mal formées sont refusées avec un code explicite.

L'enveloppe s'appelle volontairement `UnverifiedSnapshotEnvelope` : la correspondance d'un identifiant ne prouve pas l'authentification ; le format d'une empreinte ne prouve pas son contenu. La validation métier complète et la vérification cryptographique restent nécessaires avant tout futur usage. Aucun résultat 98C ne confère une capacité de synchronisation ou de remplacement.

Le lecteur distingue `absent`, `empty`, `present`, `corrupt` (JSON ou conteneur) et `unreadable`. Il conserve exactement le texte lu, les champs inconnus, les textes longs et les données imbriquées. Aucun loader historique, valeur par défaut, filtrage, écriture, suppression, événement, auth ou SDK. Les listes exigent des identifiants non vides uniques ; les templates doivent contenir des chaînes et la sélection de sondage doit être cohérente. Ces contrôles de conteneurs ne certifient pas tous les champs métier : par exemple `{}` pour les paramètres est diagnostiqué vide, jamais validé pour synchronisation.

Les lectures séquentielles ne prétendent pas constituer un snapshot atomique. Leur résultat est toujours `source: legacy-global`, `owner: unverified`, `revision: unknown`, `syncEligible: false`. Se connecter ne réattribue pas les clés globales. Un vide n'est jamais une intention de suppression. Aucune opération de remplacement n'est exposée, donc aucun DELETE/INSERT ajouté.

## Inventaire schéma et RLS

Inventaire du dépôt uniquement, sans connexion ni inspection de production : `supabase/crm_backup_history.sql` est le seul SQL présent.

| Objet | Preuve disponible / manque |
|---|---|
| `crm_prospects`, `crm_resources` | Pas de DDL/RLS/grants versionnés ; NOT NULL, FK et unicité `(user_id, local_id)` non établis |
| `crm_settings`, `crm_message_templates` | Pas de DDL/RLS/grants versionnés ; unicité et FK du propriétaire non établies |
| `crm_sync_state` | Pas de DDL/RLS/grants versionnés ; révision, empreinte et version de protocole non établies |
| `crm_backup_history` | Fichier avec UUID PK, propriétaire NOT NULL/FK, index utilisateur/date, RLS et politique FOR ALL avec USING/WITH CHECK `auth.uid() = user_id` ; déploiement effectif et grants inconnus ; immutabilité non garantie par ce fichier |
| Historique V2 et reçus | Aucun schéma, contrainte d'idempotence, politique ou grant versionné |
| RPC et ancien protocole | Aucune preuve de révocation DML direct, signatures/grants EXECUTE, rôle dédié ou sécurisation search_path |

Ces absences ne sont pas corrigées par des suppositions ni par du SQL ajouté en 98C. Les tests de rôles réels, transactions et RLS nécessiteront les étapes ultérieures sur environnement jetable autorisé ; aucun mock ne vaut preuve de RLS.

## Validation

| Vérification exécutée | Résultat |
|---|---|
| Nouveaux tests 98C | 4/4 réussis : cinq catégories, octets préservés, absence/vide/corruption/lecture refusée, doublons, références sondages, bigint au-delà de la précision JS, propriétaire/version/intégrité |
| Tous `tests/*.test.mjs` + `tests/cloud-sync-suspension.cjs` | 27/27 réussis, aucun échec ni test ignoré (`unit.log`) |
| `npx tsc --noEmit` | Réussi (`typescript.log`) |
| ESLint des deux modules et du test ajoutés | Réussi (`eslint-targeted.log`) |
| ESLint `app/sauvegarde/page.tsx` | Réussi (`eslint-backup.log`), correction 98B-1 conservée |
| `npm run lint` | Échec : 8 erreurs, 2 avertissements préexistants, détail ci-dessous (`eslint-global.log`) |
| `npm run build` | Réussi (`build.log`) |
| `node tests/pilot/verify-production-build.mjs` | Réussi : flag production false, branche historique compilée, 439 fichiers inspectés, zéro marqueur pilote |
| Chrome, config `playwright.cloud-restoration-guard.config.mjs` | 2/2 réussis PC/mobile simulé, suspension et aller-retour JSON fictif, réseau externe bloqué (`browser.log`) |
| `git diff --check` | Réussi |

ESLint global, fichiers inchangés par 98C (aucun diff des fichiers suivis) :

- `app/assistant/page.tsx:1634` : `react-hooks/set-state-in-effect`.
- `app/connexion/page.tsx:56` : même règle ; ligne 259 : `react/no-unescaped-entities`.
- `app/hooks/useSpeechRecognition.ts:89` : `react-hooks/set-state-in-effect`.
- `app/prospects/page.tsx:1104` : même règle ; ligne 1149 : avertissement `exhaustive-deps`.
- `app/street-marketing/page.tsx:113`, 129, 133 : `react-hooks/set-state-in-effect`.
- `app/aujourdhui/page.tsx:331` : avertissement `no-unused-vars`.

Les tests unitaires injectent uniquement des Maps/lecteurs mémoire. Les essais Chrome utilisent les fixtures et le barrage réseau du banc 98B, sans session réelle ni accès Supabase. Le build compile l'application ; il n'active pas le cloud. Aucun test SQL/RLS réel n'est revendiqué. Les avertissements Chrome NO_COLOR/FORCE_COLOR n'ont pas fait échouer les scénarios.

## Risques restants et verdict

Les risques 98A restent présents derrière la suspension : ancien remplacement non transactionnel, absence de CAS/reçus, propriété historique inconnue, isolation incomplète et protocole serveur non certifié. Le diagnostic brut ne résout ni ces risques ni la cohérence entre plusieurs lectures. Les empreintes serveur et les schémas métier complets ne sont pas certifiés par l'inspection d'enveloppe.

**NO-GO pour 98D à ce stade : validation globale ESLint encore en échec**, malgré les validations ciblées 98C réussies. Les anomalies sont préexistantes et hors périmètre ; elles sont signalées sans correction opportuniste. Aucune base jetable ni suite 98D créée.

`CLOUD_SYNC_SUSPENDED` reste `true` ; `ACCOUNT_SCOPED_RESOURCES_ENABLED` reste `false`. Aucune activation réelle, aucun accès Supabase production, aucune donnée réelle touchée.
