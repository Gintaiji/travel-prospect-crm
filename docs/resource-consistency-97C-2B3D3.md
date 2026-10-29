# 97C-2B3D3 — Lectures cohérentes des ressources isolées

Correction du 29 octobre 2026. Les lectures isolées et les contrôles du journal utilisent désormais le même Web Lock par compte que les écritures. **Le scénario de fausse alerte identifié en D2 est corrigé dans le chemin applicatif testé ; les vrais imports interrompus restent bloqués.** Le mode isolé reste désactivé et le cloud suspendu.

## Cause et correction

Le diagnostic [97C-2B3D2](resource-diagnostic-97C-2B3D2.md) avait identifié deux fenêtres :

1. Une écriture active avait déjà ajouté son journal et un marqueur `pending`. Une autre opération consultait ces clés avant de demander le verrou et signalait à tort une récupération.
2. Un contrôle lisait le journal de génération 1 ; un autre onglet validait la génération 2 ; le contrôle reprenait avec le marqueur de génération 2. Le rapprochement de générations différentes produisait le même faux positif.

`coordinateResourceRead` acquiert un verrou **exclusif**, avec le même nom par user.id que le coordinateur d’écriture. La lecture du statut de migration, le contrôle d’intégrité, la lecture des ressources et leur parsing ont lieu dans cette section protégée. Le propriétaire capturé est revalidé avant l’attente, après acquisition et avant restitution, puis après la résolution asynchrone du verrou. Les consommateurs de session vérifient également leur génération après `await`, y compris avant de présenter une erreur de récupération.

`accountBusinessStorage.loadResourceSnapshot()` restitue les données parsées et leur chaîne source exacte dans le même résultat. L’accès métier et l’aperçu d’import JSON utilisent cette paire ; ils ne relisent plus les ressources après libération du verrou pour reconstruire une base d’écriture ou une sauvegarde préalable. Si une écriture intervient après le snapshot, la comparaison de base dans le coordinateur refuse la proposition périmée avec « Conflit Ressources ».

Les contrôles d’intégrité effectués avant verrou lors d’une sauvegarde ont été retirés de cet emplacement. Le même contrôle complet reste exécuté **sous verrou**, avant tout journal, marqueur ou ressource écrit. Les contrôles de migration, de format, de propriétaire et de session sont conservés. Aucun verrou imbriqué n’a été ajouté.

## API interne et fonctionnement historique

- `loadResources()` et `read("resources")` de l’adaptateur isolé deviennent asynchrones. Leurs consommateurs applicatifs et leurs tests attendent le résultat.
- `loadResourceSnapshot()` fournit `{ result, raw }` pour les opérations nécessitant une base exacte ; les données absentes restent distinctes d’une liste vide volontaire.
- Les quatre autres catégories métier conservent leur API synchrone et leurs formats.
- Les pages, le stockage historique, le migrateur et les fonctions d’authentification ne sont pas modifiés. Avec l’indicateur à `false`, les pages conservent leur fonctionnement historique.
- Sans Web Locks, les lectures isolées sont désormais refusées aussi : aucun verrou localStorage ni retour aux anciennes clés.

## Garde-fous conservés

Le validateur du journal n’assouplit aucune condition : propriétaire, identifiants, dates, snapshots, statut `verified` et correspondance des ressources avec le dernier candidat restent vérifiés. Un journal ajouté sans marqueur, un marqueur `pending` abandonné, une corruption ou une copie incohérente restent bloquants une fois le verrou obtenu.

Aucun journal n’est effacé ni automatiquement validé. Aucune récupération automatique n’est exécutée. Les exceptions d’accès au stockage ou de parsing remontent ; elles ne deviennent jamais `[]`. Les sauvegardes JSON et les snapshots `beforeRaw` restent conservés.

Les migrations réelles, données CRM, clés historiques, tables Supabase et dépendances n’ont pas été modifiées dans cette étape. `ACCOUNT_SCOPED_RESOURCES_ENABLED = false` et `CLOUD_SYNC_SUSPENDED = true` sont inchangés.

## Recette déterministe et résultats

**19/19 tests navigateur réussis**, avec deux vrais onglets dans un profil Chrome neuf, uniquement des comptes et données fictifs, sans retry ni augmentation des délais. Les sorties D3 sont séparées des preuves D1/D2 et 97S.

| Scénario | Résultat observé |
|---|---|
| Contrôle négatif de l’ancienne inspection hors verrou | Pause après lecture du journal v1, validation v2 dans l’autre onglet, reprise avec marqueur v2 : fausse récupération reproduite |
| Même fenêtre via la lecture applicative corrigée | Pause avant lecture du marqueur, écrivain mis en attente ; journal et marqueur restent v1 jusqu’à la restitution du snapshot ; validation v2 seulement ensuite |
| Écriture active avant `verified` | Écriture périmée, lecture, export et aperçu JSON attendent tous le verrou ; après validation, lecture/export/sauvegarde préalable contiennent le candidat cohérent ; l’écriture périmée reçoit un conflit |
| Import interrompu avant `pending` ou avant `verified`, avec rafraîchissement | Récupération nécessaire maintenue après libération du verrou ; nouvelles écritures refusées ; journal et sauvegarde précédente inchangés |
| Deux écritures concurrentes | Une seule validation, un conflit ; ancienne ressource conservée dans le journal |
| Lecture et export en attente sous A puis connexion B | Les deux opérations A sont refusées ; une nouvelle lecture B ne retourne que les ressources B |
| Écriture A en attente puis connexion B | Refus sans écriture dans A ou B |
| Échec de lecture du marqueur | Exception remontée, stockage inchangé, aucune liste vide ; lecture correcte possible après retrait du défaut fictif |
| Échecs d’écriture du journal, des ressources ou du marqueur final | Sources/snapshots et sauvegardes conservés ; vrais états incomplets toujours bloqués |
| Accès inter-comptes, JSON A sous B | Refus conservés |
| Import réussi puis édition | Fonctionnement conservé ; ancien JSON et journal préservés |
| Absence de Web Locks | Lecture et export isolés refusés, aucune modification du stockage |
| Résistance bornée : graines 7, 19, 73, 103 | 12 tours / 24 tentatives : un succès et **un conflit obligatoire** par tour ; récupération n’est plus acceptée comme résultat alternatif |

Le contrôle négatif appelle explicitement l’ancienne inspection non verrouillée depuis le banc de test uniquement. Il ne constitue ni une route de diagnostic de production ni un chemin métier. Les vrais consommateurs passent par le coordinateur.

Les assertions vérifient notamment le compte B intact, les copies initiales du compte A dans le journal, la correspondance candidat/ressources du dernier état vérifié, l’absence de nouvelle écriture pendant récupération et la conservation de la sauvegarde JSON précédente. Le scénario de snapshot cohérent vérifie aussi que sa base v1 reste périmée après l’écriture v2 : elle ne peut pas l’écraser silencieusement.

### Autres validations

- **13/13 fichiers de tests unitaires réussis**, dont le nouveau `resource-consistent-read.test.mjs` : attente d’un écrivain actif, vraie interruption bloquante, déconnexion/changement de compte/reconnexion au même identifiant, erreurs de lecture des différentes clés, corruption JSON et absence de Web Locks.
- **TypeScript** : `tsc --noEmit` réussi.
- **ESLint ciblé** sur les quatre modules modifiés, les tests concernés et la configuration D3 : réussi.
- **Build** : `npm run build` réussi sous Next 16.4.3, 20 pages générées.

Commandes principales :

```text
node --test tests/*.test.mjs tests/cloud-sync-suspension.cjs
npm run test:browser -- --config=playwright.resource-consistency.config.mjs
node_modules\.bin\tsc.cmd --noEmit
npm run build
```

Les artefacts navigateur sont dans `test-results/resource-consistency-97C-2B3D3/` : résultats JSON, métadonnées par scénario et captures des scénarios existants. Les anciennes traces et rapports sont conservés à leurs emplacements initiaux. Le répertoire de résultats est ignoré par Git.

## Fichiers concernés

| Fichier | Changement |
|---|---|
| `app/lib/resourceWriteCoordinator.ts` | Coordinateur de lecture partageant le verrou des écritures, revalidation du propriétaire |
| `app/lib/accountBusinessStorage.ts` | Snapshot isolé asynchrone sous verrou ; suppression des contrôles de récupération hors verrou |
| `app/lib/resourceAccess.ts` | Consommation du snapshot et contrôle de génération après attente |
| `app/lib/resourceBackupJson.ts` | Export et aperçu fondés sur une lecture cohérente, sans relecture hors verrou |
| `tests/resource-consistent-read.test.mjs` | Régressions et conservation des données |
| `tests/account-business-storage.test.mjs`, `resource-backup-json.test.mjs`, `resource-write-coordinator.test.mjs` | Adaptation à l’API asynchrone ; vérification des verrous de lecture supplémentaires |
| `tests/browser/resource-harness.mjs` | Jobs de lecture/export/aperçu, défaut de lecture fictif et contrôle négatif hors verrou |
| `tests/browser/resource-diagnostic.spec.mjs` | Comparaison déterministe avant/après, session périmée, lecture en échec, résistance stricte |
| `tests/browser/resource-isolation.spec.mjs` | Refus dès la lecture en absence de Web Locks |
| `playwright.resource-consistency.config.mjs` | Sorties D3 séparées, délais et retries inchangés |
| Ce rapport | Résultats, justification et limites |

## Limites restantes

1. Web Locks est une coordination coopérative entre les opérations partageant la même origine et le même nom de verrou. Une écriture externe aux API protégées, DevTools ou une altération du profil n’est pas rendue atomique par cette correction.
2. Les écritures multi-clés localStorage restent non transactionnelles : une fermeture ou panne réelle peut laisser un état partiel. Le blocage et le journal restent nécessaires ; cette étape ne réalise pas la procédure manuelle de récupération.
3. Les lectures exclusives attendent les écritures et les autres lectures. Un onglet conservant un verrou longtemps peut retarder une lecture ; aucun timeout n’est transformé en fausse récupération, aucun mécanisme de déverrouillage forcé n’est ajouté. Un changement de compte invalide le résultat, mais ne retire pas immédiatement sa demande de la file native.
4. Un snapshot cohérent peut devenir ancien après restitution. La comparaison de base protège les écritures ultérieures ; cette étape n’ajoute pas de rafraîchissement en temps réel de toutes les vues.
5. Le tout premier échec D1 conserve une cause exacte non démontrée, faute d’instrumentation interne dans sa trace. La course confirmée D2 et sa prévention D3 sont démontrées pour les ordonnancements testés, sans prétendre couvrir toutes les pannes ou tous les navigateurs.

**Aucune activation autorisée par cette recette.** Les prérequis de migration explicite, sauvegardes vérifiées, récupération manuelle et isolation des autres modules restent applicables ; les actions Ressources vers Prospects ne sont pas débloquées.
