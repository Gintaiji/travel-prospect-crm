# 98B-1 — Effet initial de la page Sauvegarde

30 octobre 2026. Référence : `docs/cloud-sync-98B-restoration-guard.md`.

**GO pour passer à 98C.** L'erreur et l'avertissement de la page Sauvegarde sont corrigés, les validations ciblées passent. L'ESLint global reste en échec sur des anomalies distinctes, confirmées comme préexistantes et listées ci-dessous. Ce GO ne vaut ni autorisation de déploiement ni réactivation du cloud. 98C n'a pas été commencé.

## Cause précise

Dans `app/sauvegarde/page.tsx`, l'ancien effet des lignes **408–410** appelait `refreshSession()` directement avec des dépendances vides.

- **Erreur `react-hooks/set-state-in-effect`, ligne 409** : déclarer une fonction `async` ne rend pas tout son corps asynchrone. Lorsque `createBrowserSupabaseClient()` retournait `null`, `refreshSession` appelait immédiatement plusieurs setters React, depuis l'effet. Les autres mises à jour et sous-fonctions étaient également mêlées au chargement externe dans ce chemin.
- **Avertissement `react-hooks/exhaustive-deps`, ligne 410** : `refreshSession` manquait aux dépendances. L'ajouter seul aurait été incorrect : sa référence, ainsi que celles de ses trois sous-fonctions de rafraîchissement, étaient recréées à chaque rendu, avec risque de relancer continuellement l'effet.

## Correction limitée

La lecture externe est isolée dans `readBackupSession`, hors du composant. Elle renvoie le résultat de `auth.getSession()` ou l'absence de client, sans modifier d'état React. `refreshSession` publie ensuite le résultat dans le callback de cette lecture asynchrone, et renvoie toujours une promesse aux appelants existants.

`refreshCloudSyncState`, `refreshCloudDataOverview` et `refreshCloudBackupHistory` utilisent `useCallback` avec dépendances vides : leurs seules références sont des imports stables et des setters React. `refreshSession` dépend explicitement de ces trois callbacks ; l'effet dépend explicitement de `refreshSession`. Les rendus ne changent plus ces références.

Les branches identiques « client absent » et « session absente/en erreur » sont regroupées sans changer leurs messages ni les états réinitialisés. La lecture de session commence toujours au montage ; les mises à jour liées à son résultat suivent désormais le contrat asynchrone, y compris en l'absence de client. L'ordre connecté reste : statut, aperçu/fraîcheur, historique. Les rafraîchissements explicites existants restent disponibles.

Aucun timer ajouté, aucun délai artificiel, aucune règle désactivée, aucun `eslint-disable`, aucune dépendance masquée. L'effet existant de chargement local et sa temporisation initiale restent inchangés. Le traitement métier des fichiers JSON et les gardes 98B n'ont pas été modifiés.

## Fichiers

- `app/sauvegarde/page.tsx` : lecteur externe, callbacks stables et dépendances de l'effet.
- `tests/helpers/resourceHookHarness.mjs` : prise en charge de `useCallback` par la mémorisation déjà utilisée dans le banc de hooks.
- `tests/backup-session-effect.test.mjs` : test de cycle de vie de la vraie page compilée en mémoire, avec dépendances fictives.
- `playwright.cloud-session-effect.config.mjs` : réutilise les deux scénarios Chrome de 98B et conserve leurs preuves dans un répertoire propre à 98B-1.

## Validation

| Contrôle | Résultat |
|---|---|
| ESLint page et tous les fichiers de code ajoutés/modifiés | **Réussi, 0 erreur, 0 avertissement** |
| Unitaires existants + nouveau test de cycle de vie | **23/23 fichiers réussis**, aucun échec ni test ignoré |
| Chrome PC 1440 px | **1/1 réussi** |
| Chrome mobile simulé 390 px | **1/1 réussi** |
| TypeScript `npx tsc --noEmit` | Réussi |
| `npm run build` | Réussi |
| Vérification du build de production | Isolation `false`, branche historique compilée, **446 fichiers sans marqueur de pilote** |
| `git diff --check` | Réussi |

Le passage Chrome complet se termine normalement en **6,3 secondes**, sans retry. Les profils sont vierges, toutes les origines externes sont bloquées avant navigation et aucune requête externe n'est tentée. Les clics PC/tactiles sur le bouton désactivé laissent le stockage strictement identique et ne déclenchent aucune confirmation. L'export puis l'import du véritable JSON téléchargé réussissent. Les deux boutons cloud restent protégés et le service central de restauration n'a pas été modifié.

Le test ajouté vérifie quatre cas : client non configuré, session déconnectée, erreur de session et compte A fictif connecté. Il contrôle le chargement initial, l'ordre des lectures d'aperçu/historique et leur absence de répétition après quatre rendus supplémentaires. Aucun upload ni restauration n'est autorisé par ce banc. Les tests existants couvrent également les protections de session/compte et l'import/export JSON non vide des cinq catégories. Le compte connecté du test est simulé intégralement, sans SDK réseau.

Le total passe de 22 à **23** fichiers unitaires par ajout de `backup-session-effect.test.mjs` ; aucun test existant n'est supprimé.

### ESLint global : anomalies préexistantes distinctes

`npm run lint -- --format json --output-file test-results/cloud-sync-98B-1/eslint-global.json` : **146 fichiers examinés, 8 erreurs et 2 avertissements**, code de sortie 1.

| Fichier | Lignes | Résultats préexistants |
|---|---|---|
| `app/assistant/page.tsx` | 1634 | 1 erreur `react-hooks/set-state-in-effect` |
| `app/connexion/page.tsx` | 56, 259 | 1 erreur `react-hooks/set-state-in-effect`, 1 erreur `react/no-unescaped-entities` |
| `app/hooks/useSpeechRecognition.ts` | 89 | 1 erreur `react-hooks/set-state-in-effect` |
| `app/prospects/page.tsx` | 1104, 1149 | 1 erreur `react-hooks/set-state-in-effect`, 1 avertissement `react-hooks/exhaustive-deps` |
| `app/street-marketing/page.tsx` | 113, 129, 133 | 3 erreurs `react-hooks/set-state-in-effect` |
| `app/aujourdhui/page.tsx` | 331 | 1 avertissement `@typescript-eslint/no-unused-vars` |

Chaque fichier a été relu depuis **HEAD** puis analysé avec la même configuration ESLint via stdin. Toutes les lignes, règles et sévérités restantes correspondent à cette base. La page Sauvegarde de HEAD produit bien l'ancienne erreur ligne 409 et l'avertissement ligne 410 ; sa version corrigée n'en produit aucun. Aucun de ces autres modules n'est modifié dans cette étape. Le lint global n'est pas présenté comme vert.

## Commandes et preuves

```powershell
npx eslint app/sauvegarde/page.tsx tests/helpers/resourceHookHarness.mjs tests/backup-session-effect.test.mjs playwright.cloud-session-effect.config.mjs
npm run lint -- --format json --output-file test-results/cloud-sync-98B-1/eslint-global.json
$tests = @((Get-ChildItem tests -Filter '*.test.mjs').FullName) + @((Resolve-Path tests/cloud-sync-suspension.cjs).Path)
node --test $tests
npm run build
npm run test:browser -- --config=playwright.cloud-session-effect.config.mjs
npx tsc --noEmit
node tests/pilot/verify-production-build.mjs
```

Preuves dans `test-results/cloud-sync-98B-1/` : `unit.log`, `eslint-targeted.log`, `eslint-global.json`, `eslint-exit-codes.json`, `eslint-head-baseline.json`, `eslint-summary.json`, `browser-results.json`, captures et JSON fictifs sous `browser/`.

**Bilan : le blocage propre à Sauvegarde est levé ; GO pour 98C dans le cadre de préparation prévu par 98A.** Les défauts globaux préexistants restent à traiter séparément avant de déclarer une validation globale verte. Cloud toujours suspendu, isolation Ressources de production désactivée ; aucune donnée réelle, table, politique Supabase ou migration touchée.
