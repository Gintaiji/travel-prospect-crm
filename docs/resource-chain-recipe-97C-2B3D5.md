# 97C-2B3D5 — Recette complète du stockage isolé Ressources

Date : 29 octobre 2026. **Avis : activation générale déconseillée en l’état.** La chaîne fonctionne pour des destinations préparées et les garde-fous testés tiennent. Un compte neuf ne dispose toutefois pas d’un parcours d’initialisation après réservation des anciennes données par un autre compte. Le remplacement JSON reste aussi volontairement bloqué dans l’interface par défaut.

## Sécurité et périmètre exécuté

Aucun fichier applicatif, manifeste de dépendances, clé historique réelle ou table Supabase n’a été modifié. `ACCOUNT_SCOPED_RESOURCES_ENABLED = false`, `MANUAL_RESOURCE_RECOVERY_ENABLED = false` et `CLOUD_SYNC_SUSPENDED = true` sont conservés en production. Aucune récupération ou migration de données réelles n’a été exécutée.

Le nouveau serveur de recette est autonome, lié à `127.0.0.1` sur un port aléatoire, sous un chemin aléatoire. Il ne lance pas Next, ne lit aucun `.env` et ne charge pas le SDK Supabase. Le module client Supabase du bundle est remplacé par un refus systématique. Les identités autorisées sont exclusivement deux UUID fictifs A/B ; leurs sessions et événements d’authentification sont synthétiques.

Le bundle charge les vrais composants React/React DOM installés et les vrais modules de stockage, avec une liste fermée de dépendances. Les indicateurs Ressources et récupération deviennent `true` uniquement dans ce bundle en mémoire. Aucun fichier source n’est modifié pour cela. Il n’existe ni route Next de recette, ni paramètre URL d’activation de production, ni adaptateur d’authentification fictive dans `app/`.

Le profil navigateur est neuf par test. Tous les accès de stockage du nouveau banc passent par une façade qui n’autorise que les clés prévues et les préfixe par `tpc-chain:e2e-<UUID>:`. Les suppressions sont interdites. Même les lectures historiques du vrai panneau de migration utilisent ces clés fictives préfixées. Les anciens bancs conservent leurs propres préfixes par scénario. Les événements de stockage natifs entre onglets restent utilisés pour leur coordination.

Playwright bloque toutes les requêtes hors de l’origine locale ; la CSP interdit les connexions. Aucune tentative externe n’a été observée. Les empreintes des trois fichiers contenant les indicateurs avant/après figurent dans les preuves de chaque nouveau scénario et sont identiques. La recherche des marqueurs `chainRecipe`, `tpc-chain:` et du client interdit dans `.next/server` et `.next/static` après build n’a trouvé aucun résultat. Aucun import du banc n’existe dans `app/`.

## Résultats exécutables

| Vérification | Résultat |
|---|---|
| `node --test tests/*.test.mjs tests/cloud-sync-suspension.cjs` | **16/16 fichiers réussis** |
| `npm run test:browser -- --config=playwright.resource-chain.config.mjs` | **27/27 tests réussis**, un worker, aucun retry, délais inchangés |
| `node_modules\.bin\tsc.cmd --noEmit` | Réussi |
| ESLint ciblé sur les quatre nouveaux fichiers de recette | Réussi sans avertissement |
| `npm run build` | Réussi, Next.js 16.4.3, 20 pages générées |

La suite navigateur combine six nouveaux scénarios React DOM et les 21 scénarios de coordination, isolation et récupération déjà existants. Les tests d’un refus attendu sont réussis lorsque le refus est observé ; cela ne signifie pas que le parcours fonctionnel refusé est disponible.

ESLint ciblé :

```text
node_modules\.bin\eslint.cmd tests/browser/resource-chain-server.mjs tests/browser/resource-chain-harness.mjs tests/browser/resource-chain.spec.mjs playwright.resource-chain.config.mjs
```

## Scénarios validés

| Parcours | Vérification effective |
|---|---|
| Préparation A | Jeu historique entièrement fictif attribué manuellement à A ; avant migration, la page affiche « Migration nécessaire », aucune ressource A n’est créée implicitement |
| Sauvegarde avant migration | Téléchargement par le vrai panneau, lecture du fichier sur disque et comparaison du contenu fictif |
| Migration manuelle vers A | Vrai aperçu, confirmations, identifiant propriétaire, verrou et migrateur ; destination exactement égale aux octets historiques, marqueurs vérifiés, anciennes clés inchangées |
| Affichage et CRUD | Vraie page Ressources : ajout A-created, modification A-edited, ajout puis suppression A-deleted ; les cartes reflètent les opérations |
| A → déconnexion → B → A | Cartes A masquées à la déconnexion ; aucune carte ou titre A sous B ; aucun accès aux clés du compte A pendant l’affichage de B ; création B-only ; données A et B conservées exactement |
| B préparé | Destination B fictive, vide et déjà marquée vérifiée dans la fixture ; cette préparation est explicite et ne constitue pas un parcours d’initialisation de production |
| JSON isolé | Export A par le vrai panneau, téléchargement et lecture sur disque, propriétaire A et ressources égales aux données stockées |
| Import JSON autorisé dans l’interface | Scénario distinct B avec migration vérifiée mais destination Ressources absente : aperçu du fichier B, bouton initialement bloqué, téléchargement de sécurité avec `resources: null` et `rawResources: null`, confirmations, import relu et affichage après rechargement |
| Import JSON vers destination existante | Refus observé dans la vraie interface par politique par défaut. L’API est aussi testée avec injection explicite `replacementPolicy: coordinated` exclusivement dans la recette, pour vérifier l’import autorisé sous verrou et la conservation exacte des données |
| A JSON sous B | Refus par le parseur/API, stockage intégralement inchangé, aucune réattribution du fichier |
| Opération A périmée sous B | Handle capturé sous A refusé après transition, aucun écrasement de B |
| Deux onglets et base périmée | Web Locks natif, file contrôlée ; une validation et un conflit obligatoire ; aucun écrasement silencieux ; quatre graines / trois ordonnancements chacune |
| Lecture cohérente | Un écrivain ne peut séparer les lectures journal/marqueur ; lecteur, export et aperçu attendent la fin de l’écriture active. L’ancien comportement reste reproduit comme contrôle négatif de test uniquement |
| Import interrompu | Exceptions simulées avant `pending` et avant `verified`, plus rafraîchissement réel ; données et copies conservées, « Récupération nécessaire », écritures ordinaires refusées |
| Diagnostic visible | Vrai panneau et export local après import interrompu ; fichier téléchargé relu et état `recovery-required` contrôlé |
| Récupération manuelle | Vrai panneau : choix d’une copie saine, téléchargement du diagnostic préalable complet, relecture du fichier par input, propriétaire recopié, cases explicites et confirmation navigateur ; succès seulement après relectures du coordinateur |
| Intégrité après récupération | Données A exactement égales à la sauvegarde attendue, B inchangé, marqueur final `verified`, première entrée de migration conservée et diagnostic préalable exactement archivé dans la nouvelle entrée de récupération |
| Récupération interrompue/concurrente | Banc entre deux onglets : un succès et un conflit ; échec puis rafraîchissement maintient le blocage ; nouvelle préparation manuelle obligatoire. Tests unitaires des quatre points d’écriture avant/après persistance et des erreurs de quota |
| Lecture en échec | Vraie interface : erreur de lecture explicite, aucune qualification en « Récupération nécessaire », aucun effacement ; lecture normale après retrait du défaut fictif |
| Session expirée | Horloge injectée uniquement dans le store de recette ; invalidation du propriétaire, cartes masquées et ancienne opération refusée sans changement de stockage |
| Web Locks indisponible | Vraie interface : lecture/export refusés ; tentative réelle de migration après aperçu et sauvegarde refusée faute de verrou ; stockage inchangé ; aucun verrou localStorage de substitution |
| Ressources → Prospects | Vrai composant isolé dans le contexte Prospects : sélection permise, aucune commande d’historique ou de relance disponible ; ancienne clé Prospects inchangée |
| Mode historique | Régressions unitaires des vrais gestionnaires historiques et du JSON cinq catégories réussies, indicateurs de production inchangés |

## Parcours en échec ou indisponibles, sans correctif applicatif

### D5-01 — Compte B neuf sans initialisation : blocage fonctionnel d’activation

**Reproduction :** dans un profil vierge, préparer un jeu historique fictif pour A, ne créer aucune clé de B, connecter A, effectuer la migration manuelle vérifiée, puis connecter B. La page B affiche « Migration nécessaire ». Ouvrir l’aperçu de migration sous B renvoie « Ces données historiques ont déjà une migration réservée ».

**Cause observée :** l’adaptateur exige un `migration-state` vérifié. Le migrateur réserve le jeu historique à A et refuse à raison sa réattribution à B. Aucun parcours utilisateur ne prépare une destination vide vérifiée pour B. Le test principal utilise donc une préparation B déclarée, puis un scénario distinct retire cette hypothèse et reproduit le blocage.

**Conséquence :** créer des ressources sur un B réellement neuf n’est pas validé comme disponible. Le repli protège l’isolation et aucune donnée A n’est exposée à B. Ce blocage doit être résolu par une conception explicite d’initialisation vide du compte, sans réattribuer les anciennes données et sans écrire manuellement un marqueur dans DevTools.

**Preuves :** scénario `compte B sans préparation préalable`, capture `fresh-B-blocked.png`, pièce `activation-limitation.txt`, événements et états dans les résultats Playwright. Le test est vert parce qu’il exige le refus observé, pas parce que l’initialisation est résolue.

### D5-02 — Remplacement JSON existant bloqué : politique encore non activée

**Reproduction :** après migration A et export JSON isolé, sélectionner cet export dans le vrai panneau JSON. La destination est présente ; le panneau indique « remplacement maintenu bloqué » et l’action de chargement reste désactivée.

**Cause :** le composant ne fournit pas `replacementPolicy: coordinated` ; le défaut reste bloquant. L’injection coordonnée du banc API n’est pas un changement de ce défaut et n’est pas présentée comme une validation du remplacement par la vraie interface de production.

**Conséquence :** l’import dans une destination absente déjà vérifiée est validé par l’interface ; le remplacement d’une destination existante exige encore une décision d’activation et sa recette UI propre. Aucun déblocage silencieux effectué.

### D5-03 — Libellés de migration à adapter avant une activation

Après copie, le panneau annonce que les pages continuent d’utiliser les données historiques. C’est exact avec les indicateurs de production actuels, mais ce texte devient inexact dans le bundle de recette où les pages lisent effectivement les ressources isolées. Ce décalage de libellé ne modifie aucune donnée ; une activation devra rendre ce message cohérent avec le mode effectif.

Les premiers essais du nouveau banc ont nécessité deux corrections de test uniquement : inclusion de React DOM client dans la liste du bundle et sélection explicite du type « Site » au lieu de supposer cette valeur par défaut. Ce ne sont pas des corrections du produit. La suite finale n’a aucun échec inattendu et aucune anomalie critique applicative n’a été corrigée silencieusement.

## Risques résiduels et limites de preuve

- **localStorage non transactionnel entre clés.** Une interruption peut laisser journal, marqueur et données dans des phases différentes. Le blocage et les diagnostics rendent ces situations détectables ; aucune garantie de rollback atomique ou de récupération universelle n’est démontrée. Un marqueur final déjà persisté peut être reconnu cohérent par un nouveau diagnostic même si l’appel interrompu n’avait pas annoncé de succès.
- Une panne physique, une éviction du profil ou une perte du disque peut emporter toutes les copies locales. Une relecture exacte ne prouve pas la durabilité disque. Les sauvegardes externes vérifiées restent nécessaires.
- Les copies et diagnostics complets accroissent le journal, particulièrement après plusieurs récupérations. Les tests de volume D4A et de quota D4B passent, mais aucun nettoyage n’est exécuté ni autorisé. La capacité disponible peut limiter une nouvelle intervention.
- Les journaux tronqués ou contenant une copie invalide, les marqueurs invalides et les données courantes corrompues restent refusés par le parcours conservateur de récupération. Il faut une expertise séparée, sans contournement automatique.
- Web Locks coordonne les écrivains coopératifs de même origine ; aucun verrou ne protège contre DevTools ou un script de même origine extérieur au coordinateur. L’isolation applicative n’est pas un chiffrement des données locales.
- La propriété historique est confirmée humainement, pas déduite d’une connexion ou prouvée cryptographiquement. Des données mélangées restent un motif d’arrêt.
- La recette utilise Chromium et une authentification synthétique. Elle valide React DOM et les modules de session, pas un login réseau Supabase ni les politiques d’un service distant. Les autres navigateurs, l’intégration au shell Next complet, la mise en page avec CSS de production et les profils mobiles ne sont pas couverts par ce banc autonome.
- Seules les vues Ressources sont isolées. Les autres métiers et les actions Ressources écrivant dans les Prospects historiques doivent rester bloqués. La migration peut copier d’autres catégories dans le compte mais cette recette n’autorise pas leur activation.
- Revenir à l’indicateur `false` relit les anciennes clés conservées : cela ne fusionne pas les modifications isolées ultérieures dans l’historique. Un retour arrière doit être préparé pour éviter de présenter un ancien historique comme les données les plus récentes.

## Conditions exactes d’une activation contrôlée ultérieure

1. Traiter D5-01 : définir et tester une initialisation vide explicite par propriétaire, ou limiter formellement un pilote à des comptes dont migration et catégorie Ressources sont déjà vérifiées. Ne pas présenter ce pilote comme un support des comptes neufs.
2. Décider séparément de la politique de remplacement JSON et de la récupération manuelle. Si elles doivent être disponibles en production, valider leurs vrais parcours UI avec les commutateurs correspondants, sauvegardes relues et confirmation explicite. Corriger le libellé D5-03 avant d’annoncer une activation aux utilisateurs.
3. Pour chaque compte du pilote, obtenir une confirmation certaine de propriété historique, une sauvegarde indépendante téléchargée et relue, une migration vérifiée, une comparaison exacte de la destination et un diagnostic frais cohérent. Catégorie absente et collection vide doivent rester distinctes.
4. Rejouer cette recette dans le navigateur cible et compléter le contrôle de l’intégration Next/authentification dans un environnement dédié, exclusivement avec identités et données fictives. Ne pas introduire d’authentification de test dans le bundle de production.
5. Définir une procédure d’arrêt, de support et d’expertise pour lecture impossible, journal endommagé, quota plein et interruption. Préparer le retour arrière avec export des nouvelles données isolées ; le changement d’indicateur seul n’est pas un retour arrière des données.
6. Maintenir cloud et actions vers Prospects non isolés désactivés. Aucun élargissement aux autres métiers ou tables Supabase ne fait partie de l’activation Ressources.
7. Obtenir une décision explicite sur le périmètre et les risques localStorage acceptés, puis réaliser le changement d’indicateur dans une étape distincte revue. Cette recette n’effectue et n’autorise aucun changement de production.

**Conclusion : activation générale déconseillée.** Un pilote limité à des comptes préparés devient envisageable après validation des conditions ci-dessus et décision explicite. Les 27 tests navigateur réussis établissent les comportements testés, pas la disponibilité d’une initialisation neuve ou d’une transaction atomique.

## Fichiers et preuves

Seuls les fichiers suivants sont ajoutés :

- `tests/browser/resource-chain-server.mjs` : serveur local autonome, bundle fermé et activation en mémoire uniquement.
- `tests/browser/resource-chain-harness.mjs` : stockage préfixé, identités fictives, vrais composants React et défauts synthétiques.
- `tests/browser/resource-chain.spec.mjs` : six scénarios UI, fichiers téléchargés relus, conservation et blocages documentés.
- `playwright.resource-chain.config.mjs` : six nouveaux tests et 21 régressions, sorties D5 séparées.
- Ce rapport.

Les artefacts sont dans `test-results/resource-chain-97C-2B3D5/` : `browser-results.json`, preuves par scénario, JSON téléchargés, captures et métadonnées d’exécution. Ce répertoire est ignoré par Git ; l’archiver séparément avec le rapport. Les preuves D1 à D4B restent à leurs emplacements précédents.
