# 98B — Garde centrale de restauration cloud

30 octobre 2026. Référence : `docs/cloud-sync-98A-plan.md`, anomalie 98A-01.

**La restauration cloud vers local est désormais refusée centralement pendant la suspension.** Aucun accès à un compte réel, aucune requête Supabase réelle, aucun changement de table/RLS, migration ou suppression. Les fichiers non suivis des étapes précédentes ont été conservés.

## Correction ciblée

- `app/lib/cloudSync.ts`, `restoreCloudDataToLocal` : ajout de `assertCloudWritesAllowed()` en première instruction, avant `getConnectedUserId`, toute création de client, lecture distante, pause du suivi ou sauvegarde locale. Réutilisation exacte de `cloudSyncSuspension.ts`, sans second état de suspension.
- `app/sauvegarde/page.tsx`, `restoreFromCloud` : retour avec le message existant avant la confirmation et l'appel au service lorsque suspendu. Les **deux** boutons « Charger depuis le cloud » (principal et recommandation de fraîcheur) ont maintenant `disabled={CLOUD_SYNC_SUSPENDED || isSyncing}`. Un message visible explique l'indisponibilité et le maintien des parcours JSON selon leurs protections habituelles.
- Aucun changement du corps de restauration après la garde, des formats JSON, de la validation d'intégrité, des contrôles Ressources ou des règles métier. Lorsque la garde sera légitimement levée dans une étape ultérieure, le chemin existant après cette garde reste inchangé ; cela ne le rend pas suffisamment sûr pour une réactivation aujourd'hui.

## Fonctions et chemins protégés

| Chemin | Protection |
|---|---|
| Appel direct de `restoreCloudDataToLocal` / import depuis un autre composant | Refus central avant accès au client ; ne dépend pas du bouton |
| Bouton principal et recommandation de fraîcheur de `/sauvegarde` | Désactivés, message explicite, gestionnaire également protégé |
| Appel direct du gestionnaire React en contournant `disabled` | Retour avant confirmation et avant service cloud |
| `CloudStartupRestore`, chargement initial et changement/reconnexion de session | Retour existant lorsque suspendu ; même une invocation directe du service rencontre maintenant la garde centrale |
| `restoreCloudBackupHistoryToLocal` | Garde centrale déjà présente, conservée et retestée ; couvre l'ancien historique et ses appels directs |
| `uploadLocalDataToCloud`, manuel ou auto | Gardes existantes conservées et retestées |
| `CloudAutoSync`, délais périmés et changement de session | Suspension et invalidation existantes conservées et retestées |
| Sauvegardes/restaurations JSON locales | Aucun verrouillage cloud ajouté ; fonctionnement autorisé conservé, refus des fichiers isolés dans l'import historique conservé |

La suspension est globale : le refus se produit **avant toute identification du compte**. Les appels simulés A → B → A ne créent aucun client et ne peuvent donc consulter ni modifier le stockage d'un autre compte. Ce résultat ne constitue pas un test des RLS distantes.

## Validation exécutée

| Validation | Résultat exact |
|---|---|
| Tous les fichiers unitaires `tests/*.test.mjs` + `tests/cloud-sync-suspension.cjs` | **22/22 réussis**, zéro échec ou test ignoré |
| Suspension renforcée | Appels directs restauration courante/historique sous A/B/A refusés ; zéro création de client et zéro appel de sauvegarde locale ou de pause/reprise du suivi |
| Interface React en mémoire | Bouton désactivé, appel forcé du gestionnaire sans confirmation ni restauration ; export/restauration JSON non vide des cinq catégories toujours fonctionnels selon le mode autorisé |
| Chrome réel, page compilée `/sauvegarde` | **2/2 réussis** : PC 1440 px et mobile simulé 390 px ; aucun retry, aucun test ignoré |
| Clic PC / toucher mobile | Événement pointeur normal au centre du bouton désactivé ; aucune boîte de confirmation, stockage complet exactement identique avant/après |
| JSON local dans Chrome | Téléchargement du snapshot fictif, puis import du fichier exact par le véritable champ ; succès, témoin local conservé, restauration cloud toujours désactivée |
| Réseau Chrome | Toutes les origines externes bloquées avant navigation, profils vierges sans identifiants ; **aucune requête externe tentée**, aucune erreur de page |
| TypeScript `npx tsc --noEmit` | Réussi |
| `npm run build` | Réussi |
| Vérification du build | Isolation Ressources littéralement `false`, branche historique compilée, **446 fichiers inspectés sans marqueur de pilote** |
| ESLint service, tests et configuration ajoutés/modifiés | Réussi |
| ESLint page `app/sauvegarde/page.tsx` | **Échec préexistant : 1 erreur et 1 avertissement**, détaillés ci-dessous |
| `git diff --check` | Réussi |

Le test unitaire `cloud-sync-suspension.cjs` garde ses assertions précédentes : absence d'envoi automatique, aucune restauration au startup, invalidation des délais après changement de session et historique restant lisible. Des fonctions de sauvegarde et de suivi injectées échouent immédiatement si elles sont appelées lors des refus. Aucun SDK réseau n'est utilisé dans ces tests.

Le banc Chrome démarre le build existant uniquement sur `127.0.0.1:31498`, refuse de réutiliser un serveur déjà présent, bloque les service workers et intercepte tout réseau externe avant de charger la page. Aucun endpoint de test n'a été ajouté dans l'application.

### Anomalies de validation conservées au bilan

**ESLint préexistant.** La ligne 409 appelle `refreshSession()` depuis un effet ; ESLint signale `react-hooks/set-state-in-effect`, et la ligne 410 produit l'avertissement `react-hooks/exhaustive-deps`. Même résultat obtenu sur `git show HEAD:app/sauvegarde/page.tsx` avec ESLint via stdin : l'effet n'a pas été modifié par 98B. Aucune règle désactivée, aucun changement de cet effet ou de ses dépendances effectué pour obtenir artificiellement un bilan vert. Les autres fichiers ciblés passent ESLint.

**Arrêt du serveur Chrome sous Windows.** Les deux scénarios réussissaient, mais le premier banc basé sur `webServer` restait en attente de l'arrêt du processus Next. Le seul processus de recette identifié a été arrêté ; un redémarrage prématuré avait aussi été refusé car le port était encore occupé. Le banc final utilise un enfant Node direct, sans shell, avec arrêt explicite et vérification de fin. Dernier passage complet : **2/2, sortie 0 en 6,5 secondes**, arrêt sans intervention. Ce problème de banc ne correspond pas à une restauration ou à une mutation métier.

## Reproduction

```powershell
Set-Location D:\travel-prospect-crm
$tests = @((Get-ChildItem tests -Filter '*.test.mjs').FullName) + @((Resolve-Path tests/cloud-sync-suspension.cjs).Path)
node --test $tests
npx tsc --noEmit
npx eslint app/lib/cloudSync.ts app/sauvegarde/page.tsx tests/cloud-sync-suspension.cjs tests/historical-backup-compatibility.test.mjs tests/browser/cloud-restoration-guard.spec.mjs tests/browser/cloud-restoration-guard-setup.mjs playwright.cloud-restoration-guard.config.mjs
npm run build
node tests/pilot/verify-production-build.mjs
npm run test:browser -- --config=playwright.cloud-restoration-guard.config.mjs
```

La commande ESLint incluant la page retourne actuellement un code non nul pour l'anomalie ci-dessus. Preuves sous `test-results/cloud-restoration-98B/` : `unit.log`, `eslint-baseline.log`, `eslint-current.log`, résultat initial `browser-results.json`, dernier passage `browser-results-direct.json`, captures et téléchargements fictifs dans `browser-direct/`.

Fichiers de test : `tests/cloud-sync-suspension.cjs`, `tests/historical-backup-compatibility.test.mjs`, `tests/browser/cloud-restoration-guard.spec.mjs`, `tests/browser/cloud-restoration-guard-setup.mjs` et `playwright.cloud-restoration-guard.config.mjs`.

## Limites et suites

- Les résumés, comparaisons de fraîcheur et l'historique distant peuvent encore être **lus** avec une session réelle dans les chemins recensés en 98A. La présente garde interdit les restaurations destructives ; elle n'est pas un coupe-circuit universel d'authentification ou de lecture réseau.
- Le protocole DELETE/INSERT, l'absence de CAS/transaction commune, l'historique candidat local et les défauts d'isolation globale recensés en 98A restent à traiter. Aucune nouvelle garantie de synchronisation future n'est annoncée.
- La correction s'applique au code mis à jour. Elle ne peut pas modifier rétroactivement un ancien bundle déjà chargé ou conservé hors ligne sur un autre appareil. La vérification des versions/PWA fait partie d'un futur déploiement contrôlé ; aucune activation ni opération de production faite ici.
- Les essais Chrome utilisent des profils fictifs et un réseau externe bloqué ; aucune RLS de production ni session réelle n'a été examinée. Le mobile est simulé, pas un appareil physique.

**Verdict : NO-GO formel pour passer à 98C avec une validation 98B entièrement verte**, car ESLint échoue encore sur la page concernée, même si l'erreur est antérieure à cette correction. Le blocage fonctionnel 98B est vérifié. Traiter séparément cet effet et son avertissement, sans assouplir ESLint ni réactiver le cloud, puis rejouer la validation avant le passage. `CLOUD_SYNC_SUSPENDED` reste `true` et `ACCOUNT_SCOPED_RESOURCES_ENABLED` reste `false`.
