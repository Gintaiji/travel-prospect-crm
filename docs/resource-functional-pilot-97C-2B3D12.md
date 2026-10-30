# 97C-2B3D12 — Pilote fonctionnel local Ressources

30 octobre 2026. **NO-GO pour préparer une activation réelle PC/mobile en l’état.** Le pilote PC est fonctionnel et les protections de données restent vérifiées, mais la récupération mobile présente un blocage d’interface reproductible. Aucun correctif métier ni contournement de confirmation n’est appliqué pendant ce pilote.

## Environnement dédié livré

Le serveur de recette existant dispose maintenant d’un mode pilote autonome : commandes React visibles de connexion fictive A/B et déconnexion, navigation locale entre les panneaux, simulations explicites d’interruption, d’expiration et de quota. Les véritables composants Ressources, migration, initialisation, sauvegarde et récupération sont utilisés avec leurs véritables coordinateurs et contrôles. Seuls l’identité et le stockage de test sont adaptés par le banc.

Les styles Tailwind et polices publics sont ceux du build local ; les écrans ne sont plus testés sans CSS. Le conteneur du pilote reçoit un fond sombre explicite. Aucun style de composant métier n’a été modifié pour masquer un problème mobile.

Lancement reproductible depuis le dépôt :

```powershell
npm run build
node tests/pilot/verify-production-build.mjs
node tests/pilot/start-resource-pilot.mjs --headed
```

Le lanceur ouvre un **nouveau profil Chrome persistant** dans un dossier UUID sous `test-results/resource-functional-pilot/`, une origine `http://127.0.0.1:<port éphémère>` et un chemin aléatoire. Ne pas réutiliser le profil CRM habituel ni importer ses fichiers. Fermer le navigateur ou utiliser Ctrl+C pour arrêter le pilote. Les profils fictifs ne sont pas effacés automatiquement ; chaque lancement en crée un nouveau.

Le démarrage du lanceur a été exécuté et vérifié en mode headless, puis l’instance de vérification fermée. Aucun serveur de production n’a été lancé ou modifié.

### Cloisonnement

- Activation uniquement dans le registre de modules **en mémoire** du serveur autonome, jamais dans `app/` ni via un paramètre de production.
- Le serveur et le lanceur refusent `NODE_ENV=production`. Écoute uniquement sur loopback, port aléatoire, méthode GET et Host strictement contrôlés ; aucun accès aux fichiers arbitraires du dépôt.
- SDK Supabase remplacé par un module qui refuse son utilisation ; aucun `.env` n’est chargé par le pilote. Identités fixes A/B uniquement, domaines de données `example.invalid`.
- CSP `connect-src 'none'`, scripts/styles/polices locaux, service workers bloqués par le contexte de test/lanceur et requêtes hors origine interrompues.
- Stockage limité aux clés fictives préfixées. Un profil contenant des clés étrangères est refusé avant le montage de l’application ; le test conserve exactement son témoin fictif préexistant.
- Les tests vérifient zéro clé lors du premier chargement. Cette mesure est capturée avant les rechargements du parcours ; tous les profils de la revue finale sont confirmés vierges.

Ce pilote est une application React locale utilisant les composants réels, **pas une authentification Supabase réelle ni une validation du déploiement Next complet**. La navigation hôte est adaptée aux panneaux locaux. Les autres modules métier ne sont pas modifiés.

## Résultats

Chrome **156.0.8078.49**, PC **1440 × 1000** et mobile **390 × 844**, tactile/viewport émulés dans Chrome ; aucun téléphone physique ou Safari n’est revendiqué.

| Vérification | Résultat |
|---|---|
| Tests unitaires | **22/22 fichiers réussis**, dont la frontière pilote/production |
| Régression Chrome existante | **47/47 réussis**, sans retry |
| Passage complet initial | **51/53 réussis**, deux échecs dans les parcours mobiles |
| Revue finale ciblée du pilote | **PC : 3/3 ; mobile : 1/3**, soit 4/6 ; deux échecs de manipulation des confirmations mobiles |
| TypeScript `tsc --noEmit` | Réussi |
| ESLint ciblé, y compris lanceur et collecteur | Réussi sans avertissement |
| `npm run build` | Réussi, Next.js 16.4.3, 20 pages |
| Vérification explicite du build de production | Réussie : commutateur source littéral `false`, rendu précompilé de la branche historique, aucune route pilote et aucun marqueur pilote dans **439 fichiers** inspectés |
| Empreintes de non-modification | **75 fichiers applicatifs/configuration/dépendances identiques avant/après** |

### Parcours utilisateur

| Parcours | PC | Mobile |
|---|---|---|
| Connexion fictive A, aperçu et sauvegarde préalable de migration, confirmation et copie | Réussi | Réussi |
| Affichage, création, modification et suppression via les composants React | Réussi | Réussi |
| Déconnexion A, connexion B, initialisation volontaire à zéro puis ressource B spécifique | Réussi | Réussi |
| Retour A et conservation exacte des ressources A/B | Réussi | Réussi |
| Sauvegarde JSON isolée, refus du fichier A sous B sans mutation, remplacement A confirmé | Réussi | Réussi |
| Interruption de l’import, sauvegarde du diagnostic, choix d’une copie moderne | Réussi | Réussi jusqu’à l’étape de confirmation |
| Récupération confirmée, relecture et retour exact à la version précédente | Réussi | **Bloqué sur une case de confirmation** |
| Export de secours sous quota natif saturé, rejet d’un fichier différent, relecture SHA-256 du fichier exact | Réussi | Sous-parcours réussi ; test global ensuite bloqué/intermittent sur les confirmations de récupération |
| Récupération désactivée sous quota malgré les confirmations | Réussi | Contrôle logique validé par la régression ; parcours tactile complet non validé |
| Session expirée : masquage et ancienne écriture refusée sans mutation | Réussi | Fin du parcours non atteinte après le blocage de récupération ; couvert par les unités et la régression Chrome |
| Profil contenant un stockage étranger | Refus sécurisé, témoin intact | Refus sécurisé, témoin intact |

Aucun mélange A/B, aucune écriture avec ancien handle, aucune écriture Supabase ni relance cloud observés. Les commandes d’historique/relance vers Prospects restent absentes, et le témoin Prospects fictif reste `[]`. Les refus et interruptions gardent les copies précédentes ; aucun succès de récupération mobile n’est annoncé artificiellement.

## Problèmes d’interface identifiés

### D12-UI01 — Blocage mobile, avant activation

Après affichage du diagnostic et du sélecteur de copies, le document atteint environ **571 à 576 px pour un viewport configuré à 390 px**, contre 390 px pendant la migration et le CRUD. Dans l’export sous quota, la dernière revue mesure également **575 px**. Les aperçus et contrôles sont tronqués/décalés.

Le clic normal sur « J’ai vérifié le contenu de cette copie » échoue : Playwright signale des interceptions par des éléments parents/voisins. La case reste non cochée et la récupération ne peut pas être confirmée. Les screenshots et traces montrent le problème ; le calcul de largeur compare désormais le document au viewport configuré, car `innerWidth` seul peut lui-même s’élargir en émulation mobile.

Le parcours principal est bloqué à plusieurs reprises. Le test sous quota a réussi entièrement lors d’une revue intermédiaire, puis a de nouveau échoué sur une confirmation lors de la dernière revue : **sensibilité de l’interface mobile à conserver au bilan**, pas une preuve de fiabilité. L’export de secours, effectué en premier pour mettre la copie à l’abri, réussit et est vérifié avant ces échecs. Aucun clic forcé, modification DOM de la case ou appel API de restauration n’a remplacé la confirmation utilisateur.

L’origine précise du défaut de dimensionnement/hit-test et le comportement sur téléphone réel restent à diagnostiquer. Aucune correction de composant métier n’est faite silencieusement. Captures : `mobile-recovery-overflow.png`, `mobile-emergency-export.png` ; trace et pièce `confirmation-hit-test.json` dans les résultats de revue.

### D12-UI02 — Rafraîchissement après récupération

Sur PC, la restauration écrit et vérifie les bons octets, mais la vue Ressources doit être explicitement rechargée via le bouton existant avant de réafficher les cartes. Le lecteur annexe Ressources-vers-Prospects, monté simultanément dans ce banc, peut conserver son ancien diagnostic d’interruption. Il reste bloqué et sans action d’écriture ; cette observation ne démontre pas un accès indu aux Prospects. Clarifier le retour utilisateur et tester le rafraîchissement dans la navigation déployée.

### D12-UI03 — Texte de migration ambigu

Le message « les pages continuent d’utiliser les données historiques » reste affiché après la migration, alors que le pilote active explicitement les lecteurs isolés. Le marqueur de migration non activée est conservé conformément au mécanisme existant, mais l’explication des pages est ambiguë dans ce mode. Ne pas changer les marqueurs pour corriger un texte.

Un premier échec du nouveau test concernait un sélecteur de test sur « Type » : il a été remplacé par le rôle accessible `combobox` déjà utilisé dans les tests existants. Le contrôle de non-écriture vers Prospects est effectué quand le lecteur est disponible puis quand il reste bloqué après récupération. Aucun garde d’intégrité, quota, session ou confirmation n’a été affaibli. Les échecs mobiles sont laissés visibles.

## Risques et conditions avant une activation réelle

1. Corriger et revoir D12-UI01 sans supprimer de confirmation : reprise sur 360/390 px et PC, avec diagnostic, nombreuses copies, UUID longs, fichier relu et reprise après interruption. Valider aussi sur téléphone réel. Obtenir tous les tests du pilote verts sans `force`, retry ou abandon d’assertion.
2. Clarifier les messages de migration et de fin de récupération, puis vérifier les relectures sous verrou dans la vraie navigation. Ne jamais masquer un journal `pending` en le déclarant réparé sans contrôle.
3. Tester séparément l’authentification et le déploiement dans un environnement autorisé dédié. Les connexions fictives ne prouvent pas la sûreté d’un fournisseur d’identité distant. Aucune intervention sur Supabase production n’est autorisée par ce rapport.
4. Définir une cohorte et une instance/origine réellement séparées avant tout changement du commutateur global. Le build partagé de production doit rester désactivé jusqu’à une décision explicite distincte ; garder cloud et actions vers Prospects bloqués.
5. Conserver le contrôle SHA-256 persisté, la relecture des fichiers externes, le refus des anciennes copies non vérifiables, Web Locks et les contrôles de session. Aucune conversion ou suppression automatique d’archives.
6. Prévoir surveillance et conduite à tenir sous quota. localStorage reste partagé par origine, non transactionnel entre clés et sujet à l’éviction. Une estimation ne réserve pas l’espace ; une restauration par écriture sous saturation n’est jamais garantie. Les exports externes vérifiés restent nécessaires.
7. Réserver le pilote aux fichiers synthétiques fournis/générés. Le propriétaire réel d’un fichier est refusé par les comptes fictifs, mais un contenu volontairement réétiqueté ne peut pas être certifié « fictif » par le sélecteur de fichiers. Ne jamais réutiliser les exports CRM réels.

**Verdict : NO-GO pour préparer une activation réelle tant que le blocage mobile n’est pas corrigé et revalidé.** Le pilote PC isolé peut servir à poursuivre les essais fictifs. Le GO V3 sur la sécurité des données n’impliquait pas une validation de cette interface mobile stylée, désormais examinée.

## Fichiers et preuves

Ajouts D12 : configuration `playwright.resource-functional-pilot.config.mjs`, scénario `tests/browser/resource-functional-pilot.spec.mjs`, test `tests/resource-pilot-boundary.test.mjs`, interface/lanceur/vérification de build/collecteur dans `tests/pilot/`. Les deux fichiers du banc existant `resource-chain-server.mjs` et `resource-chain-harness.mjs` ont été étendus pour le pilote. Aucun fichier `app/`, manifeste de dépendances, table Supabase ou autre module métier modifié.

Les variantes des helpers de preuve introduites en D11 restent conservées. Leurs anciens résultats ne sont pas supprimés. Preuves D12 sous `test-results/resource-functional-pilot/` : `summary.json`, `production-build.json`, `browser-results.json`, `review/browser-results.json`, logs unitaires/build, fichiers téléchargés, captures et traces. Le collecteur distingue le passage complet et les revues ciblées ; il ne les présente pas comme un unique passage intégral vert.

**Production explicitement vérifiée : `ACCOUNT_SCOPED_RESOURCES_ENABLED = false`, remplacement/récupération désactivés par défaut, `CLOUD_SYNC_SUSPENDED = true`. Aucune activation automatique.**
