# 98C-1 — Levée des blocages locaux après 98C

31 octobre 2026. Références prioritaires : `cloud-sync-98A-plan.md`, `cloud-sync-98C.md`. Comparaison avec le commit précédant cette étape : `f7fb832ce2df9def5ae72706cc092727e3898b1e`.

**GO pour commencer ultérieurement 98D sur environnement local jetable et données fictives uniquement. NO-GO pour réactiver le cloud réel.** 98D n'est pas commencée dans cette étape.

## Causes exactes du NO-GO 98C

Le motif explicite du verdict 98C était l'échec d'ESLint global : huit erreurs et deux avertissements dans six fichiers préexistants. La page Sauvegarde, corrigée en 98B-1, passait déjà sa validation ciblée.

Les réserves de sécurité du rapport sont distinctes : ancien remplacement non transactionnel derrière la suspension, absence de CAS/reçus, attribution inconnue des stockages historiques, isolation locale incomplète, empreinte non vérifiée et schéma/RLS/grants non certifiés. Les corriger maintenant anticiperait les étapes suivantes. Elles interdisent une activation réelle, mais ne doivent pas être confondues avec une exigence de disposer déjà des preuves que le futur banc 98D doit permettre de construire.

## Corrections ciblées

| Fichier | Cause | Correction |
|---|---|---|
| `app/assistant/page.tsx` | Recopie synchrone du transcript vers l'état du formulaire dans un effet | Le résultat vocal met le formulaire à jour depuis l'événement de reconnaissance, via le setter transmis au hook ; suppression de cet effet dérivé |
| `app/hooks/useSpeechRecognition.ts` | Détection de capacité navigateur copiée dans un état depuis un effet | `useSyncExternalStore` lit la capacité du navigateur, avec snapshot serveur `false` pour l'hydratation ; la capacité statique ne nécessite aucun abonnement actif. L'effet de nettoyage avec `abort` reste présent |
| `app/connexion/page.tsx` | `refreshSession` pouvait mettre à jour l'état synchroniquement depuis l'effet, notamment sans configuration | Séparation de la lecture asynchrone `readConnexionSession` et de la publication du résultat ; callback stable et dépendance explicite, selon le modèle déjà utilisé dans Sauvegarde |
| `app/connexion/page.tsx` | Apostrophe JSX non échappée | `&apos;`, même texte affiché |
| `app/prospects/page.tsx` | Application synchrone du mode URL depuis l'effet | Application différée après montage, dans le même ordre que les actions URL déjà différées ; nettoyage du délai dans toutes les branches |
| `app/prospects/page.tsx` | Dépendance `openNewProspectForm` manquante | Callback stable dépendant explicitement des trois valeurs de localisation par défaut ; ajout à la liste des dépendances. Les champs non vides restent conservés |
| `app/street-marketing/page.tsx` | Deux chargements locaux publiaient directement leur résultat dans les effets | Chargements planifiés après montage, suivant le modèle existant des pages Assistant/Prospects ; annulation des délais au nettoyage, dépendance `quickContactMessage` conservée pour relire les contacts |
| `app/street-marketing/page.tsx` | Effet de redimensionnement de l'état des réponses selon les questions | Ajustement conditionnel lors du changement de référence des questions ; réponses initiales préparées pour les questions par défaut ; même conservation par index et même troncature/complément par chaîne vide |
| `app/aujourdhui/page.tsx` | Fonction `openFollowUpTreatmentForm` déclarée mais jamais appelée | Suppression de cette déclaration inutilisée, sans ajout ni changement de parcours utilisateur |

Aucune règle désactivée, aucun `eslint-disable`, aucun changement de configuration ESLint. Les chargements locaux et le mode URL restent des opérations de montage : leur publication est désormais différée d'une tâche navigateur et annulable avant exécution. Ce changement d'ordonnancement est explicite ; les résultats une fois chargés sont comparés à ceux d'avant correction. Le redimensionnement des réponses et le transcript ne sont plus recopiés par des effets supplémentaires.

La reconnaissance conserve les options `fr-FR`, sans résultats intermédiaires, les erreurs, stop et abort. Un transcript final identique au précédent ne réécrit pas une commande éventuellement modifiée à la main, comme auparavant avec la dépendance de l'effet sur la chaîne transcript.

Fichier de validation ajouté : `tests/cloud-lint-regression.test.mjs`. Le banc différentiel extrait les vrais effets via l'AST TypeScript et lit la version de référence avec `git show` sur le commit ci-dessus ; il nécessite donc l'historique Git local. Il n'importe aucun SDK réel et n'effectue aucune requête réseau. Son harness mémoire ne remplace pas React DOM ou une validation fonctionnelle complète des six pages.

## Comparaison des comportements sensibles

- Prospects : même résultat pour URL vide, qualification, ajout complet, ajout rapide, focus et combinaison qualification/ajout ; traitement initial unique, mêmes appels d'ouverture et défilement après exécution des tâches ; annulation au nettoyage.
- Connexion : mêmes textes et états finaux sans configuration, déconnecté, erreur et connecté ; une seule lecture au montage et aucune relance sur rerender. Les actions inscription/connexion/déconnexion gardent leurs appels et leur rafraîchissement de session. Les données et réponses auth sont entièrement fictives.
- Terrain : mêmes résultats des loaders, choix du sondage actif, brouillon, filtre Street Marketing et tri décroissant ; même conservation des réponses et des autres champs lors d'un changement du nombre de questions ; aucune lecture différée après démontage.
- Voix : API navigateur simulée, transcript final nettoyé, doublon ignoré pour la commande, erreur de permission, arrêt et nettoyage testés. Aucun microphone réel utilisé.
- Sauvegarde et sessions centrales : suite existante rejouée ; tests Chrome réels PC/mobile simulé de suspension et aller-retour JSON fictif. Réseau externe bloqué avant navigation par le banc existant.

Le test vérifie aussi l'identité du contenu, hors fins de ligne, de `cloudSnapshotContract.ts`, `cloudRawDiagnostics.ts`, `cloudSync.ts`, `cloudSyncSuspension.ts`, `resourceIsolationSettings.ts` et `app/sauvegarde/page.tsx` par rapport à la référence. Aucun contrat snapshot/révision/erreur, diagnostic brut, protocole de synchronisation ou protection de sauvegarde n'a changé.

## Résultats exécutés

Journaux locaux dans `test-results/cloud-sync-98C-1/` (ignorés par Git).

| Validation | Résultat |
|---|---|
| ESLint ciblé, six fichiers corrigés et nouveau test | Réussi, aucune erreur ni avertissement (`eslint-targeted.log`) |
| `npm run lint` global, passage final | **Réussi, zéro erreur et zéro avertissement** (`eslint-global.log`) |
| Tous `tests/*.test.mjs` + `tests/cloud-sync-suspension.cjs` | **28/28 réussis**, zéro échec/ignoré (`unit.log`) |
| Test différentiel étendu aux réponses de sondage | Réussi après le passage complet ; aucun code applicatif modifié ensuite |
| `npx tsc --noEmit` | Réussi (`typescript.log`) |
| `npm run build` | Réussi (`build.log`) |
| `node tests/pilot/verify-production-build.mjs` | Réussi : isolation production `false`, branche historique compilée, 439 fichiers inspectés, aucun marqueur pilote (`production-build.log`) |
| Chrome, `playwright.cloud-restoration-guard.config.mjs` | **2/2 réussis**, PC et mobile simulé, sans retry ni test ignoré (`browser.log`) |
| `git diff --check` | Réussi |

Une première passe a détecté une erreur ESLint dans le nouveau faux objet de reconnaissance (`no-this-alias`) ; le banc a été corrigé pour collecter ses instances, sans désactiver la règle. Les passages finaux sont verts. Les avertissements d'environnement Chrome NO_COLOR/FORCE_COLOR n'affectent pas les scénarios.

## Conditions non levées localement

Les RLS ne sont **pas vérifiées**. Le seul SQL du dépôt décrit l'ancien historique ; il ne prouve ni son déploiement ni les politiques/grants des autres tables. Aucun test de rôle SQL, transaction réelle, isolement serveur A/B, immutabilité d'historique, reçu idempotent ou interdiction du DML ancien n'est revendiqué.

Ces preuves nécessitent une base Supabase locale jetable ou une recette dédiée, des comptes fictifs et des rôles réels. Leur préparation appartient à 98D ; les RPC de lecture/commit et leurs tests appartiennent aux étapes suivantes. Aucun environnement Supabase, schéma ou migration n'a été créé ici et aucun schéma réel n'a été importé.

Les réserves 98A concernant CAS, écrasement non transactionnel, cohérence des lectures, propriété historique et isolation globale restent ouvertes derrière la suspension. Les comparaisons locales ne les valident pas et ne justifient aucune levée de protection.

## Verdict et portée

**GO pour commencer 98D dans une étape distincte**, limitée à une base locale jetable, un schéma fictif versionné, des rôles/grants de test et une garde réseau refusant absolument la production. Le blocage local ESLint est levé et les validations demandées passent. L'absence actuelle des preuves serveur n'est pas artificiellement transformée en succès : elle définit le travail restant du plan.

**NO-GO pour toute réactivation du cloud réel.** Un GO de développement sur données fictives n'autorise ni une connexion production, ni une migration réelle, ni une activation. `CLOUD_SYNC_SUSPENDED` reste `true`, `ACCOUNT_SCOPED_RESOURCES_ENABLED` reste `false`. Aucun accès aux données des utilisateurs, aucune connexion Supabase production, aucune modification SQL et aucun changement des règles de synchronisation pendant 98C-1.
