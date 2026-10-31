# 98D — Banc Supabase local jetable et schéma fictif

31 octobre 2026. Références : `cloud-sync-98A-plan.md`, `cloud-sync-98C.md`, `cloud-sync-98C-1.md`. Référence du code applicatif avant cette étape : `c9f80c5454893233ea032860cdae2d4ffc5350d4`.

**Implémentation du banc livrée, exécution SQL bloquée faute d'environnement vérifiable disponible. NO-GO pour commencer 98E.** Aucun accès Supabase production, aucune base réelle consultée, aucune activation.

## Périmètre exact

Le plan 98A définit 98D ainsi : « Base locale Supabase jetable, schéma versionné fictif, rôles/grants et garde réseau du banc ». Critère de sortie : « A/B isolés et refus absolu de connexion production ; aucun schéma réel importé automatiquement ».

Cette étape fournit un lanceur exécutable de base Supabase/PostgreSQL éphémère, un schéma fictif, les politiques/grants de recette, des assertions SQL sous rôles réels et les tests locaux de refus/interruption du lanceur. Le composant PostgreSQL Supabase est le seul service prévu : aucun GoTrue, PostgREST, client HTTP, transport applicatif ou session réelle. La preuve de signature/expiration JWT n'est donc pas couverte par ce banc SQL.

Pas de RPC de lecture, bootstrap de comptes CRM historiques, commit CAS, historique V2, reçu, migration de données existantes, raccordement applicatif ou automatisme. **98E à 98K non commencées.**

## Fichiers ajoutés

| Fichier | Rôle |
|---|---|
| `tests/cloud-98d/sandbox.mjs` | Construction d'un conteneur neuf, environnement Docker local limité, contrôles d'identité, refus réseau, orchestration et nettoyage conditionnel |
| `tests/cloud-98d/run.mjs` | Point d'entrée réel, commandes Docker sans shell, gestion des interruptions et sortie non nulle en cas de refus |
| `supabase/98d/schema.sql` | Schéma fictif version 1, comptes A/B fictifs, contraintes, rôles, RLS et grants fermés |
| `supabase/98d/assertions.sql` | Assertions SQL transactionnelles A/B/anon, grants et contraintes, rollback systématique des données de scénario |
| `tests/cloud-sandbox-98d.test.mjs` | Neuf tests locaux du banc avec commandes Docker simulées et réutilisation des contrats 98C |
| `docs/cloud-sync-98D.md` | Présent rapport |

Aucun fichier sous `app/`, manifeste de dépendances ou configuration ESLint modifié. Aucun SQL préexistant importé. Les fichiers SQL ne sont pas dans un répertoire de migrations automatiques.

## Isolation et refus implémentés

Le point d'entrée ne prend aucun argument : toute URL, DSN ou option supplémentaire est rejetée avant accès à l'environnement. Il ne lit aucun `.env`, clé Supabase ou configuration CRM. Les appels HTTP/TCP sont interdits par le banc, y compris vers localhost ; il n'existe aucun transport HTTP utilisé par le lanceur.

Docker est forcé explicitement sur le socket Unix local ou le named pipe Windows local avec `--host`. L'environnement transmis au processus est limité aux variables nécessaires au système ; les contextes Docker, hôtes distants, proxies, paramètres TLS et URL de base hérités ne sont pas transmis. Le banc ne lance ni pull, ni installation, ni Supabase CLI distant.

Une image locale `supabase/postgres:17.6.1.136` doit déjà être présente. Son identifiant `sha256` est résolu puis utilisé pour la création : le tag ne peut pas changer l'image au milieu d'une exécution. Cela ne constitue pas une certification indépendante de provenance de l'image locale. Le tag a été relevé dans la [configuration Docker officielle Supabase](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml) ; aucune image n'a été téléchargée ici.

Chaque exécution crée un nom et un label à nonce aléatoire, sans réutilisation de conteneur. La base porte le nom fixe `crm98d_fictional`. Le conteneur est créé avec `--pull=never`, `--network none`, sans publication de port, sans montage de répertoire/volume utilisateur et avec un PGDATA en tmpfs. Le mot de passe est aléatoire pour cette exécution ; ni les arguments de commande ni stderr Docker ne sont publiés par le lanceur.

Avant démarrage et avant chaque commande SQL, le lanceur vérifie via Docker inspect : ID complet retourné par sa création, nom, image, nonce, état, réseau désactivé, absence de privilège conteneur, de ports publiés et de montage persistant, base attendue et tmpfs. Une métadonnée de sécurité manquante provoque un refus. Les commandes SQL utilisent exclusivement `docker exec` et le socket Unix PostgreSQL interne ; aucun hôte de connexion configurable.

Après vérification du conteneur, une lecture compare exactement `current_database()` au nom attendu. Le SQL vérifie aussi le rôle d'amorçage, l'absence de tables/vues métier publiques et d'utilisateurs existants, ainsi que la présence des objets Supabase `auth.users`, `auth.uid()` et de rôles API non privilégiés. En cas d'absence, il échoue ; aucun remplacement de `auth.uid()` par un faux n'est créé. Les objets auth restent ceux de l'image Supabase, dont le [schéma initial est versionné en amont](https://github.com/supabase/postgres/blob/develop/migrations/db/init-scripts/00000000000001-auth-schema.sql).

Une interruption bloque les commandes suivantes et empêche un verdict réussi. En sortie, le conteneur est inspecté à nouveau avant tout arrêt ; si son identité ne peut plus être vérifiée, le banc refuse aussi de le toucher. Aucun `rm`, suppression de volume, arrêt global ou recherche de conteneur par nom générique. Le conteneur arrêté est conservé pour inspection de sa configuration et de ses logs ; **le tmpfs est volontairement éphémère et n'est pas une sauvegarde**. Ce banc ne contient aucune donnée préexistante à préserver. L'identité du moteur Docker local et la confiance dans son administrateur restent des prérequis ; ce n'est pas une défense contre un administrateur Docker malveillant.

## Schéma et séparation des comptes

Le schéma est fictif, sans prétendre représenter le DDL déployé en production. Il conserve la répartition des catégories décrite en 98A : prospects, ressources, paramètres + sondages dans `crm_settings`, messages personnalisés, état de synchronisation et historique ancien distinct.

- Propriétaire NOT NULL avec FK `auth.users`, identifiant de liste non vide et PK `(user_id, local_id)` ; PK propriétaire pour les singletons. Les objets de liste doivent porter l'identifiant correspondant.
- Révision serveur `bigint` non négative, obligatoire ; version de schéma 1 et format d'empreinte SHA-256. Le format d'empreinte ne certifie pas son contenu : aucune empreinte serveur de snapshot n'est calculée en 98D.
- Rôle propriétaire des tables et rôle écrivain distincts, NOLOGIN, NOSUPERUSER, NOBYPASSRLS et sans droit de création de rôles. Aucune appartenance de rôle n'est accordée aux clients.
- RLS activée et forcée. Lecture authenticated limitée à `auth.uid()` non nul et au propriétaire ; anon ne reçoit aucune politique de lecture. Accès écrivain restreint par USING et WITH CHECK du propriétaire.
- Aucun INSERT/UPDATE/DELETE/TRUNCATE accordé à authenticated ou anon. Le rôle écrivain n'est pas exposé : aucune RPC ni opération applicative nouvelle. Le banc ne propose aucun remplacement de snapshot sans CAS ; le CAS reste à construire en 98F.
- Deux identités fictives aux adresses `account-a@98d.invalid` et `account-b@98d.invalid`. Aucun mot de passe utilisateur, jeton, donnée CRM ou schéma réel importé.

L'amorçage du schéma est transactionnel. Les scénarios de données sont exécutés dans une autre transaction terminée par ROLLBACK. `psql -X` ignore les fichiers de démarrage utilisateur ; `ON_ERROR_STOP=1` arrête au premier échec. Aucun DELETE suivi d'INSERT n'est un mécanisme de remplacement. Le DELETE du fichier d'assertions est exclusivement un essai de refus sous le rôle API.

Les contrats 98C sont réutilisés par les fixtures unitaires : propriétaire attendu, révision `9007199254740993` sans perte JS et cinq catégories explicites. Le diagnostic brut reste non mutable et `syncEligible: false`. Il n'est jamais traité comme une permission d'écriture, même avec des listes vides.

## Assertions SQL préparées, non exécutées ici

Le fichier exécutable prévoit :

- A/B avec le même identifiant local, chacun lisant seulement ses lignes sur les six tables ; authenticated sans identité et anon sans accès.
- Contrôle des vrais catalogues PostgreSQL : propriétaire, ENABLE/FORCE RLS, rôles sans bypass et absence de grants DML ou d'escalade par appartenance.
- Refus des anciens DELETE/UPDATE, INSERT et UPSERT clients ; refus par WITH CHECK d'un propriétaire falsifié et d'une réattribution de propriétaire.
- Refus des doublons d'identifiant local, identifiants incohérents, propriétaire nul et révisions inconnues/négatives ; révision bigint relue comme texte.
- Tentative d'édition intercompte affectant zéro ligne ; état fictif de référence conservé et rollback final.

Les claims sont injectés par `set_config` sous des rôles PostgreSQL réels : c'est un test de la frontière RLS en base, pas une preuve de validation cryptographique JWT ou de sécurité de l'API REST. La [documentation officielle RLS Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security) reste la référence de cette distinction.

## Validation réellement exécutée

| Vérification | Résultat |
|---|---|
| Recherche locale Docker/Supabase CLI/psql/podman dans le PATH | Aucun trouvé. Seul Docker est nécessaire au lanceur, psql devant être dans l'image |
| `node tests/cloud-98d/run.mjs` | **Refus attendu, code 1** : Docker local indisponible ; aucune création de conteneur, aucune commande SQL, aucune connexion Supabase (`isolated-db.log`) |
| Nouveaux tests du banc | **9/9 réussis**, réseau et commandes Docker simulés : endpoints, environnement distant, identité, cycle complet, outillage/image absents, faux succès SQL, interruptions et identité modifiée (`unit-targeted.log`) |
| Tous `tests/*.test.mjs` + `tests/cloud-sync-suspension.cjs` | **37/37 réussis**, aucun échec ni test ignoré (`unit.log`) ; après le dernier ajout d'un contrôle d'interruption final, les 9 tests ciblés ont été rejoués avec succès |
| ESLint ciblé du banc et de ses tests | Réussi (`eslint-targeted.log`) |
| `npm run lint` global | Réussi, zéro erreur et zéro avertissement (`eslint-global.log`) |
| `npx tsc --noEmit` | Réussi (`typescript.log`) |
| `npm run build` | Réussi (`build.log`) |
| Vérification du build de production | Réussi : isolation false, branche historique compilée, 439 fichiers, aucun marqueur pilote (`production-build.log`) |
| Chrome suspension, configuration 98B | **2/2 réussis**, PC et mobile simulé, sauvegarde JSON fictive et réseau externe bloqué (`browser.log`) |
| Comparaison du code applicatif et dépendances au début de 98D | Aucun diff sous `app/`, dans package.json, package-lock.json ou ESLint ; protections 98C/98C-1 conservées |
| `git diff --check` | Réussi |
| Application réelle du schéma, compilation SQL et assertions RLS A/B | **Non exécutées, bloquées** ; aucun succès SQL/RLS revendiqué |

Journaux locaux sous `test-results/cloud-sync-98D/`, ignorés par Git. Le succès du cycle Docker **simulé** prouve l'orchestration et les refus testés, pas le fonctionnement d'une base ou de ses politiques. Les avertissements Chrome NO_COLOR/FORCE_COLOR sont sans incidence sur les deux scénarios réussis.

## Reproduction et prérequis pour 98E

Commande du banc, sans URL ni argument :

```powershell
node tests/cloud-98d/run.mjs
```

Il faut d'abord disposer d'un moteur Docker **local** vérifiable et de l'image exacte déjà préparée localement. Le lanceur n'installe et ne télécharge rien. Il ne peut pas se rabattre sur un Supabase hébergé. La création, le démarrage, les catalogues réels, le rôle bootstrap et le schéma auth de l'image doivent être vérifiés lors de la première exécution ; toute incompatibilité de l'image ou de ses métadonnées reste un échec, sans assouplissement du garde-fou.

Pour clore 98D et envisager 98E :

1. Exécuter le banc sur ce moteur local isolé et obtenir une preuve réelle `98D_SQL_ASSERTIONS_PASSED`, puis une sortie 0 après nettoyage vérifié.
2. Corriger tout échec effectif du provisionnement ou des assertions, sans retirer les contrôles ni ajouter de repli distant ; joindre identifiant d'image, résultats A/B, grants/catalogues et logs sans secrets.
3. Rejouer les validations du code résultant. Les tests de mocks ne remplacent jamais les assertions SQL.

Les RLS de production restent inconnues ; aucun schéma déployé n'est certifié par ces fichiers. Les risques 98A de CAS, historique V2/reçus, cohérence des snapshots, propriété des données historiques et isolation locale complète restent ouverts et appartiennent aux étapes suivantes. Aucun test de transaction de commit RPC, concurrence interappareils ou signature JWT n'est revendiqué en 98D.

## Verdict

**NO-GO pour commencer 98E.** L'implémentation locale du banc et du schéma fictif est livrée, mais le critère de sortie « A/B isolés » n'a pas encore de preuve sur une base réelle. Le refus réseau attendu est effectivement validé ; il ne transforme pas l'absence de Docker en test RLS réussi.

**Aucune activation réelle autorisée.** `CLOUD_SYNC_SUSPENDED` reste `true` et `ACCOUNT_SCOPED_RESOURCES_ENABLED` reste `false`. Aucune synchronisation réactivée, aucune migration réelle, aucune politique de production modifiée, aucune donnée utilisateur consultée ou supprimée.
