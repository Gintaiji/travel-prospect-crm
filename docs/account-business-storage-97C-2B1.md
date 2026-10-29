# 97C-2B1 — Adaptateur métier isolé, non activé

Évolution 97C-2B3C : les écritures **Ressources** sont maintenant asynchrones et
coordonnées ; elles exigent une lecture préalable ou un snapshot explicite.
Les quatre autres catégories gardent leurs écritures synchrones. Voir la
[coordination et la récupération](resource-writes-97C-2B3C.md).

`app/lib/accountBusinessStorage.ts` réutilise une instance de
`createAccountScopedStorage`. Il n'importe que des types et n'appelle ni les
anciens magasins, ni Supabase, ni la migration, ni le suivi de synchronisation.
Aucune page ne l'importe. Son import et sa création n'accèdent pas au stockage.

## Utilisation prévue

Après validation explicite de l'identité par l'adaptateur d'authentification :

```ts
const owner = await scoped.validateOwner(supabaseUser.id);
const data = createAccountBusinessStorage(scoped).forOwner(owner);
const result = data.loadProspects();
// Traiter séparément migration-required, absent, available.
```

Le jeton propriétaire doit rester celui du début de l'opération. Il ne faut pas
réacquérir le compte courant pour appliquer le résultat d'une opération ancienne.
Les erreurs d'identité, de session et de stockage remontent à l'appelant ; elles ne
sont jamais transformées en collections vides.

Les méthodes `load/saveProspects`, `load/saveResources`, `load/saveSettings`,
`load/saveCustomMessageTemplates`, `load/saveStreetMarketingSurvey` fournissent
les mêmes types métier que le code existant, dans des résultats explicites pour
les lectures. `read/write` constituent leur interface générique typée, limitée
aux cinq catégories métier.

## États

| Situation | Résultat |
| --- | --- |
| Identité inconnue, faux jeton ou session périmée | Erreur, aucun accès aux données |
| État de migration absent | `migration-required`, « Migration nécessaire », raison `missing` |
| Copie partielle/non vérifiée | `migration-required`, raison `unverified` |
| État invalide ou lié à un autre propriétaire | `migration-required`, raison `invalid` |
| État `verified` cohérent avec le compte, dates et empreinte valides | `available`, « Données disponibles » |
| Catégorie absente après migration vérifiée | `absent`, aucune création automatique |
| Liste explicitement stockée comme `[]` | `available`, avec `data: []` |
| JSON illisible, structure invalide ou stockage inaccessible | Erreur, aucun remplacement par défaut |

La lecture des données est refusée tant que la migration n'est pas vérifiée ; seule
sa métadonnée est inspectée. L'écriture dans cette situation lève une erreur.
Un compte dont la migration manque ne peut pas être initialisé en écrivant `[]`.

Le format de migration reconnu est celui produit par 97C-2A : propriétaire,
`createdAt`, `verifiedAt`, `sourceFingerprint` SHA-256, `status: verified`,
`active: false`. La disponibilité dans cet adaptateur ne signifie pas une
activation des pages et ne modifie jamais ce marqueur.

## Conservation des formats et limites

Les lectures parsèrent le JSON sans normaliser, filtrer, fusionner avec des valeurs
par défaut ou sauvegarder de nouveau. Les écritures sérialisent les structures
fournies en une seule opération `setItem`, sans suppression préalable. Les champs
supplémentaires et valeurs historiques sont conservés selon le format JSON.

Les validations métier contrôlent les conteneurs, les identifiants des entrées,
les messages textuels et la structure des sondages. Elles ne constituent pas une
validation complète de tous les champs métier. Une ancienne forme de sondage qui
n'a pas la structure actuelle est signalée comme invalide, jamais convertie ou
effacée automatiquement. Les types TypeScript décrivent les structures attendues.

La session est vérifiée par le magasin isolé avant chaque accès. Une écriture
revérifie également la migration après sérialisation, puis la couche isolée vérifie
encore le propriétaire juste avant `setItem`. Une erreur de quota native conserve
la valeur précédente. Il n'y a pas de suppression, de mécanisme destructif de
réparation ou de transaction multi-catégories dans cet adaptateur.

L'adaptateur ne lit jamais les clés historiques, même pour comparer les empreintes.
La vérification de modifications ultérieures de ces sources reste une opération
distincte via `legacyDataMigration.inspectState`, à prévoir avant une activation.
Le marqueur prouve l'état enregistré de la copie, pas une protection contre une
modification malveillante du stockage par un script de même origine.

## Étapes nécessaires avant activation

1. Garder les écritures cloud suspendues et préserver les exports JSON ainsi que
   les anciennes clés.
2. Centraliser l'adaptateur d'authentification et la révision de session, y compris
   les changements inter-onglets. Réutiliser une instance partagée du magasin isolé.
3. Effectuer manuellement la migration du bon propriétaire et vérifier son résultat,
   les éventuelles modifications historiques ultérieures et les catégories absentes.
4. Définir le parcours pour « Migration nécessaire », données absentes et erreurs,
   sans transformer ces états en listes vides ; prévoir séparément l'initialisation
   explicite des nouveaux comptes sans historique.
5. Brancher progressivement une page à la fois sur les nouvelles lectures et
   écritures. Invalider ses données en mémoire et ses opérations au changement de
   compte ; ne pas envoyer un ancien résultat sous un nouveau jeton.
6. Tester deux comptes, déconnexion/reconnexion, plusieurs onglets, stockage refusé
   et retour arrière avant de déployer. La reprise cloud reste une étape distincte.

## Tests

`node tests/account-business-storage.test.mjs`

Deux comptes fictifs, marqueurs de migration simulés et stockage en mémoire :
aucune migration réelle, lecture du navigateur ou requête Supabase.
