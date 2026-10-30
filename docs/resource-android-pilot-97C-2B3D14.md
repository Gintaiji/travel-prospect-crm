# 97C-2B3D14 — Recette sur Android physique

**Statut : préparée, non exécutée sur téléphone. Clôture du pilote en attente.** Aucun GO physique n'est déduit des tests simulés. Utiliser uniquement le pilote fictif ; aucun compte Google/CRM ni identifiant Supabase n'est demandé.

## 1. Préparer la liaison privée

Utiliser un téléphone de recette vierge, ou un utilisateur/Invité Android dédié dont Chrome et les téléchargements ne contiennent aucune donnée réelle. Si le constructeur interdit le débogage dans cet utilisateur, utiliser un téléphone de recette dédié, sans modifier le profil habituel. Ne pas effacer les données de votre profil habituel. Préférer Chrome normal dans ce profil dédié, sans synchronisation ; le mode privé peut modifier le comportement du stockage et des téléchargements. Noter modèle, version Android, version Chrome et clavier utilisé.

Le PC et le téléphone Android **11 ou supérieur** doivent être sur le même Wi-Fi privé. Installer les [Android SDK Platform-Tools officiels](https://developer.android.com/tools/releases/platform-tools), puis activer Options développeur → Débogage sans fil sur Android. Choisir « Associer l'appareil avec un code d'association ».

Dans PowerShell, si `adb` n'est pas déjà dans le PATH :

```powershell
$pilotAdbDir = Read-Host 'Chemin du dossier platform-tools décompressé'
$env:Path = "$pilotAdbDir;$env:Path"
adb version
```

Appairer puis connecter ; les deux ports Android sont généralement **différents** :

```powershell
$pilotPairEndpoint = Read-Host 'IP:port affichés dans Associer avec un code'
adb pair $pilotPairEndpoint
# Saisir le code sur le PC quand adb le demande.
$pilotConnectEndpoint = Read-Host 'IP:port de la page principale Débogage sans fil'
adb connect $pilotConnectEndpoint
adb devices -l
$pilotDevice = Read-Host 'SERIAL exact de votre téléphone dans adb devices (état device)'
```

Ne pas continuer si l'appareil est `offline`, `unauthorized` ou s'il n'est pas identifiable. La [documentation Android](https://developer.android.com/tools/adb) décrit l'appairage Wi-Fi ; le [manuel ADB](https://android.googlesource.com/platform/packages/modules/adb/+/HEAD/docs/user/adb.1.md) documente `reverse`.

Si Android est antérieur à 11 ou si le réseau bloque l'appairage, utiliser un câble USB et le débogage USB, autoriser ce PC puis reprendre à `adb devices -l`. Ne pas employer `adb tcpip 5555`, un tunnel Internet ou un assouplissement des paramètres de sécurité Chrome.

## 2. Lancer exactement le pilote existant

Dans un premier PowerShell :

```powershell
Set-Location D:\travel-prospect-crm
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build en échec' }
node tests/pilot/verify-production-build.mjs
if ($LASTEXITCODE -ne 0) { throw 'Frontière production invalide' }
node tests/pilot/start-resource-android.mjs
```

Laisser cette fenêtre ouverte. Le lanceur affiche une URL aléatoire et son port. Dans le second PowerShell utilisé pour ADB :

```powershell
$pilotUrl = Read-Host 'Coller URL complète affichée par le lanceur'
$pilotUri = [uri]$pilotUrl
if ($pilotUri.Scheme -ne 'http' -or $pilotUri.Host -ne '127.0.0.1') { throw 'URL de pilote incorrecte' }
$pilotPort = $pilotUri.Port
adb -s $pilotDevice reverse --no-rebind "tcp:$pilotPort" "tcp:$pilotPort"
if ($LASTEXITCODE -ne 0) { throw 'Tunnel non établi : ne pas continuer' }
adb -s $pilotDevice reverse --list
```

**Sur le téléphone**, saisir dans Chrome l'URL complète, avec `127.0.0.1`, le même port, le chemin aléatoire et `?namespace=...`. Ne pas remplacer l'adresse par l'IP Wi-Fi du PC et ne pas modifier le namespace. Au besoin transmettre ce texte par un moyen local, sans service de partage public.

Le serveur reste lié à `127.0.0.1`, avec contrôle strict de l'en-tête Host ; aucune règle pare-feu entrante, ouverture de box ou écoute `0.0.0.0` n'est nécessaire. Le tunnel ADB transporte l'accès sur le réseau local appairé. L'adresse de boucle locale préserve le contexte de confiance requis par les API du navigateur ; une adresse HTTP de LAN ordinaire ne serait pas équivalente ([Secure Contexts](https://www.w3.org/TR/secure-contexts/)).

La page doit afficher « Pilote local Ressources — données fictives ». Le banc remplace le client Supabase par un refus explicite, n'importe ni SDK réel ni fichier d'environnement, et sert une CSP `connect-src 'none'; worker-src 'none'`. Ces protections s'appliquent aussi au téléphone, qui ne bénéficie pas de l'interception réseau Playwright. Le build de production reste isolé de ce banc. Ne jamais démarrer `npm run dev -- --hostname 0.0.0.0` pour cette recette.

Contrôle recommandé avant de saisir des données : sur Chrome PC, ouvrir `chrome://inspect/#devices`, sélectionner uniquement l'URL fictive du téléphone et Inspecter. Dans la console, lire sans rien modifier :

```javascript
({ secure: isSecureContext, locks: typeof navigator.locks?.request,
   sha256: typeof crypto.subtle?.digest, flags: window.chainRecipe?.flags })
```

Attendu : `secure: true`, `locks: "function"`, `sha256: "function"`, flags `isolated/recovery/jsonReplacement/cloudSuspended: true`. Ces trois activations sont propres au bundle fictif ; les sources de production restent `false`. Dans Réseau, aucune requête de l'application vers un domaine externe/Supabase ne doit apparaître. En cas d'échec : arrêter, ne pas activer de drapeau Chrome ni modifier les protections.

## 3. Recette tactile — trois scénarios

Identifiants **fictifs**, à recopier exactement :

- A : `11111111-1111-4111-8111-111111111111`
- B : `22222222-2222-4222-8222-222222222222`

**Scénario 1 — parcours complet et récupération**

1. Toucher « Connexion fictive A », puis « Ouvrir la migration manuelle ». Afficher l'aperçu, télécharger la sauvegarde préalable, vérifier qu'elle est présente dans Téléchargements, lire le JSON fictif, remplir le propriétaire et les confirmations, puis copier. Revenir aux Ressources et toucher « Recharger les ressources ».
2. Créer `Android-A` avec `https://example.invalid/android-a`, modifier son titre, créer puis supprimer une autre ressource fictive. Vérifier les cartes. Exporter les ressources isolées : conserver ce fichier comme **A1** (noter son nom réel).
3. Déconnecter A, connecter B, confirmer l'initialisation d'un espace vide avec l'identifiant B. Vérifier zéro ressource, ajouter `Android-B`. Dans Sauvegarde et récupération, sélectionner A1 pour prévisualisation : refus « autre compte », aucune ressource A ajoutée à B. Revenir à A : B ne doit pas apparaître et A doit être intact.
4. Ajouter à A une ressource `Android-A-suite`, exporter le JSON comme **A2**. Prévisualiser A1 pour un remplacement volontaire : télécharger puis **relire le fichier préalable exact**, vérifier l'aperçu, recopier A et cocher toutes les confirmations. Toucher Charger et accepter la confirmation native. Recharger les ressources : `Android-A-suite` doit être absent.
5. Prévisualiser maintenant A2, remplir à nouveau toutes les étapes du remplacement. Dans les simulations fictives, toucher « Interrompre la validation du prochain import », puis Charger et confirmer. Attendre « Récupération nécessaire ». Désactiver l'interruption simulée, recharger la page avec la **même URL**. Ne pas répéter l'import.
6. Exporter le diagnostic, préparer l'aperçu de récupération, choisir la copie **avant opération** du dernier import. Vérifier son UUID, son contenu et l'absence de `Android-A-suite`. Télécharger la sauvegarde préalable complète et la relire dans le champ prévu.
7. Dans « Recopier le propriétaire », ouvrir réellement le clavier et saisir A. Avec le clavier ouvert, faire défiler jusqu'aux deux confirmations puis au bouton final ; vérifier lisibilité et accès tactile sans défilement horizontal ni zoom imposé. Tester portrait puis paysage, fermer/rouvrir le clavier et vérifier que son focus ne masque pas le champ. L'aperçu JSON doit défiler verticalement ; toucher une case ou son libellé doit fonctionner normalement. Si un clavier externe est disponible, contrôler également Tab/Espace et le focus vert, sans en faire un substitut au tactile.
8. Cocher les confirmations. Toucher Récupérer, **annuler** la confirmation native : aucun succès ni changement de données ne doit être annoncé. Recommencer, accepter et attendre le succès vérifié. Recharger les ressources : retrouver exactement la version A1. Vérifier B intact, puis revenir à A. Garder tous les fichiers et diagnostics ; aucun journal ne doit être effacé.
9. Dans les simulations, expirer la session : les opérations doivent être refusées et aucune carte nouvelle ne doit être créée.

**Scénario 2 — quota saturé et intégrité du téléchargement**

1. Reconnecter A fictivement. Refaire un import A2 interrompu comme ci-dessus, désactiver l'interruption, puis utiliser uniquement « Saturer le quota natif du profil fictif » et confirmer. Ce test remplit uniquement le stockage de cette origine fictive ; ne pas le lancer dans un profil quotidien.
2. Préparer la récupération : vérifier « Récupération par écriture bloquée ». Toucher « Exporter la copie sélectionnée sans écriture localStorage ». Confirmer la présence du JSON dans Téléchargements, puis sélectionner **ce fichier exact** dans « Relire la copie JSON exportée pour vérifier propriétaire et SHA-256 ».
3. Attendre explicitement « propriétaire et SHA-256 vérifiés ». Un simple téléchargement ou une ouverture dans un éditeur **ne valide pas** la sauvegarde. Le contrôle existant recalcule l'empreinte persistée, vérifie le propriétaire et compare le fichier à la copie sélectionnée. Ne pas réenregistrer le JSON dans un éditeur ni générer une nouvelle empreinte.
4. Télécharger/relire aussi le diagnostic préalable complet, saisir A et cocher les deux confirmations par toucher normal. Même avec ces confirmations, Récupérer doit rester désactivé si l'espace manque. Les données et anciens journaux doivent rester présents. Ne rien supprimer pour forcer l'écriture.

**Scénario 3 — profil vierge et relecture finale**

1. Sans effacer le profil, rouvrir exactement la même URL : les données fictives et le diagnostic doivent survivre ; aucune reprise automatique de l'opération interrompue.
2. Si le stockage reste saturé, conserver les exports et clore cette session. Un nouveau lancement utilise une nouvelle origine aléatoire ; ne pas modifier manuellement les clés de stockage.
3. Le troisième scénario automatisé D12 (« refus d'un profil contenant un stockage étranger ») ne doit pas être reproduit en important des données CRM. Il reste couvert par Chrome automatisé ; la recette physique vérifie ici la persistance/relecture du profil fictif. Ne pas annoncer une équivalence exacte avec les trois tests automatisés.

## 4. Résultats à transmettre et clôture

Renvoyer cette fiche remplie, avec captures **fictives uniquement** :

```text
Modèle / Android / Chrome / clavier :
Profil dédié et liaison (Wi-Fi ADB ou USB) :
Précontrôles contexte sécurisé / Web Locks / SHA-256 / réseau : OK ou détail
S1 : migration, CRUD, A/B, mauvais propriétaire, remplacement : OK ou détail
S1 : clavier ouvert portrait/paysage, défilement, focus, confirmations : OK ou détail
S1 : annulation sans changement puis récupération A1, B intact : OK ou détail
S1 : session expirée refusée : OK ou détail
S2 : téléchargement puis relecture propriétaire/SHA-256 : OK ou détail
S2 : récupération bloquée sous quota, données/journaux conservés : OK ou détail
S3 : rechargement même origine, interruption persistante sans reprise : OK ou détail
Captures / messages exacts / incident éventuel :
```

**GO pour clôturer le pilote fictif** seulement après observation de tous ces résultats positifs sur le téléphone, fichiers relus et empreinte validée, sans contournement. Tout mélange de comptes, écriture avec session périmée, récupération sans intégrité, accès externe ou contrôle tactile inaccessible entraîne **NO-GO**. Un résultat manquant laisse la clôture en attente. Un GO fictif n'autorise aucune activation réelle ; les réserves D12 sur le rafraîchissement et le texte de migration demeurent.

Après conservation des preuves, arrêter le serveur par Ctrl+C, puis dans le second PowerShell :

```powershell
adb -s $pilotDevice reverse --remove "tcp:$pilotPort"
# Seulement pour la liaison Wi-Fi :
adb disconnect $pilotConnectEndpoint
```

Désactiver le débogage sans fil/USB et révoquer l'appairage de recette sur le téléphone. Aucune suppression de données n'est incluse.

## Comptage des tests et vérifications de préparation

Les commits D12 `8183daa` et D13 `1581872` contiennent les mêmes **21 fichiers `*.test.mjs`**, plus `tests/cloud-sync-suspension.cjs`. Aucun fichier unitaire supprimé : seul le scénario navigateur a changé dans `tests/`. D13 a sélectionné seulement `*.test.mjs`, omettant le contrôle cloud CJS que D12 incluait. Il s'agit d'une différence de sélection, pas de la disparition d'une suite. Node affiche ici des fichiers de test (`suites: 0`), pas 22 blocs `describe`.

Commande complète exécutée en D14 : **22/22 fichiers réussis**, zéro échec ni test ignoré :

```powershell
$tests = @((Get-ChildItem tests -Filter '*.test.mjs').FullName) + @((Resolve-Path tests/cloud-sync-suspension.cjs).Path)
node --test $tests
```

Lanceur ajouté uniquement dans `tests/pilot/start-resource-android.mjs`, aucun changement `app/`. Vérifications locales réussies : démarrage/arrêt du lanceur, réponse HTTP du pilote, refus Host étranger (403), CSP sans connexions/workers, client SDK remplacé et absence de domaine Supabase dans le bundle. ESLint du lanceur réussi. Vérification du build existant rejouée : isolation de production `false`, branche historique compilée, 439 fichiers inspectés sans marqueur de pilote. Les 59 tests Chrome D13 sont le dernier passage navigateur complet ; ils ne constituent pas une observation Android physique. ADB n'est pas installé dans le PATH de l'environnement de préparation et aucun téléphone n'y est connecté/testé. Le transport Wi-Fi/USB reste donc à exécuter avec la procédure ci-dessus.
