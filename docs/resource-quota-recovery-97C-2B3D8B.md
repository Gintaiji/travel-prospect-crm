# 97C-2B3D8B — Récupération Ressources lorsque localStorage manque d’espace

30 octobre 2026. **GO pour la prochaine recette contrôlée sur données fictives, avec copies v2 à empreintes persistées.** Aucune activation de production. Une récupération par écriture reste conditionnelle à l’espace effectivement accordé par le navigateur ; elle n’est jamais garantie par une estimation.

## Comportement corrigé

La récupération dispose désormais d’une sortie sans écriture localStorage : sélectionner une copie saine, exporter son JSON, enregistrer le fichier hors du profil du navigateur, puis le relire. Les journaux, marqueurs et ressources restent inchangés pendant ce parcours.

L’export utilise le diagnostic et les copies proposés par le système existant. Sous le même Web Lock de compte que les autres opérations, il revalide la session, les octets exacts des ressources/journal/état/migration, le propriétaire, la structure des copies et leurs empreintes persistées. La copie choisie doit provenir d’une entrée `archiveVersion: 2` et son SHA-256 doit correspondre à `fingerprints[beforeRaw|candidateRaw]`.

Le document exporté est une enveloppe Ressources v5 avec `purpose: resource-recovery-copy`, `copyVersion: 1`, propriétaire, provenance, octets bruts, données lisibles et empreinte. Il n’embarque aucun journal ni ancienne sauvegarde. Son propre aller-retour de parsing et d’intégrité est vérifié avant publication. Le parseur existant sait le relire et refuse ses versions inconnues ou empreintes incohérentes.

**Télécharger ne valide aucune sauvegarde externe.** L’état de vérification est uniquement en mémoire et commence à `false`. La relecture doit correspondre exactement au fichier généré pour cette sélection et cet aperçu ; le propriétaire et le SHA-256 sont revérifiés sous verrou. Un mauvais fichier, une session changée, un état modifié ou un aperçu consommé entraîne un refus. Réexporter une copie invalide sa précédente confirmation de fichier. Il n’y a aucun marqueur de sauvegarde valide écrit dans localStorage.

Les anciens journaux restent lisibles et ne sont ni supprimés ni convertis. Une ancienne copie dépourvue d’empreinte persistée n’est pas présentée comme un export certifié SHA-256 : cet export est refusé avec une explication et orientation vers l’export forensique existant pour expertise. Calculer une empreinte aujourd’hui ne prouverait pas son intégrité historique. Ce cas reste une limite explicite pour une future recette avec archives anciennes.

## Contrôle d’espace et erreurs de quota

`resourceRecoverySpace.ts` distingue les trois situations : estimation favorable, estimation insuffisante et disponibilité inconnue. Le contrôle de préparation et le contrôle juste avant mutation utilisent **le même coordinateur et la même sérialisation prévue**. L’inspection revient avant le premier `scoped.write` ; elle ne crée aucun journal ni marqueur.

Le calcul prend le maximum de croissance nette à chacune des quatre phases : ajout au journal, marqueur `pending`, remplacement des ressources, marqueur `verified`. Il compte les chaînes sérialisées et les noms de nouvelles clés, puis demande une réserve de **65 536 octets**. La sélection d’une autre copie refait le contrôle, et une action permet de réévaluer l’espace sans écrire. Le bouton de récupération est bloqué si l’espace est insuffisant ou inconnu. Le coordinateur applique le même refus même si l’interface affichait auparavant une estimation favorable.

En production préparée mais désactivée, l’estimateur lit seulement les totaux de l’origine, sans publier les clés ni les valeurs des autres comptes. Il compte les unités de chaîne UTF-16 et applique un **budget applicatif prudent de 4 Mio**. Ce budget n’est pas le quota réel du navigateur. Il n’utilise aucune écriture de sondage et ne considère pas l’estimation globale du stockage d’origine comme une preuve de capacité localStorage. Une lecture impossible donne une disponibilité inconnue et bloque l’écriture. Les tests injectent également des budgets fictifs mesurés au lieu d’inférer une capacité réelle.

`QuotaExceededError`, son ancien nom Firefox et les codes historiques 22/1014 sont reconnus sans dépendre d’un `instanceof` entre contextes. Dans le coordinateur, une erreur réelle de quota garde un signal explicite `name: QuotaExceededError` et un message « espace localStorage insuffisant ». Elle n’est plus masquée par l’erreur générique d’interruption du journal. Aucune reprise ni suppression automatique n’est tentée.

Les contrôles d’identité, les confirmations explicites, la sauvegarde diagnostique relue avant récupération, les conflits d’aperçu et les permis d’écriture révocables restent obligatoires. L’ordre de persistance journal → pending → ressources → verified est conservé.

## Diagnostic et procédure manuelle

Le diagnostic indique la taille du journal et des marqueurs, le nombre de références à des copies, leur taille brute cumulée, la taille des contenus uniques et la taille des chaînes de snapshots encodées. Les copies font déjà partie du journal : elles ne sont pas additionnées une deuxième fois à sa consommation. L’interface présente ces chiffres, le besoin supplémentaire maximal, la réserve et la disponibilité estimée.

La procédure manuelle n’est affichée qu’après relecture du diagnostic et de **toutes les copies proposées**. Elle impose de conserver les fichiers hors du profil, d’en vérifier le contenu et le propriétaire, puis de faire identifier des données non indispensables de cette origine et leurs sauvegardes avant toute intervention manuelle. Elle interdit de vider les données du site ou de supprimer ressources, journaux et marqueurs de récupération. Après intervention : nouveau diagnostic et nouveau contrôle d’espace. Sans données supprimables clairement identifiées, conserver les exports et demander une expertise ; ne pas forcer une écriture.

Aucune action de suppression n’est ajoutée. La procédure ne promet pas qu’il existe toujours des données non indispensables à libérer. Les fichiers exportés sont la sortie sûre quand l’écriture reste impossible.

## Résultats des tests

| Vérification | Résultat final |
|---|---|
| `node --test tests/*.test.mjs tests/cloud-sync-suspension.cjs` | **20/20 fichiers réussis** |
| `npm run test:browser -- --config=playwright.resource-quota-recovery.config.mjs` | **46/46 tests réussis**, sans retry |
| `node node_modules/typescript/bin/tsc --noEmit` | Réussi |
| ESLint ciblé sur les modules, le composant, les tests/bancs modifiés et la nouvelle configuration | Réussi, sans avertissement |
| `npm run build` | Réussi, Next.js 16.4.3, 20 pages |

La recette navigateur inclut les 40 scénarios antérieurs, dont les 20 remplacements sans imbrication, et six scénarios de quota supplémentaires. Chrome **156.0.8078.49**, deux onglets sur profils jetables, sessions et propriétaires fictifs, réseau externe interdit, SDK Supabase interdit dans les bancs. Les injections d’activation et d’estimation appartiennent uniquement aux bundles de recette en mémoire.

| Scénario | Observation |
|---|---|
| Budget fictif saturé : 8 752 octets occupés, budget 8 752 | Trois copies exportées et relues ; aucun `write` applicatif ; snapshot intégral inchangé ; récupération bloquée |
| Presque plein : 8 752 octets occupés, budget 9 264 | Même conservation et mêmes exports ; 512 octets ne couvrent pas la récupération et sa réserve |
| Quota natif Chrome réellement saturé | 21 refus natifs `QuotaExceededError` pendant remplissage d’une clé fictive dédiée, jusqu’au refus d’un caractère supplémentaire ; export puis relecture SHA-256 réussis |
| Saturation native : consommation mesurée | 10 485 760 octets estimés UTF-16 pour clés + valeurs ; contenu fictif de remplissage de 5 238 431 caractères ; ce chiffre n’est pas un quota universel |
| Conservation sous quota natif | SHA-256 du snapshot complet avant/après identique : `d7f0112acb63eea0584c4deb760414f413603cf0ee4b5905539f1cd700ec8539` |
| JSON valide mais copie altérée, propriétaire incorrect | Refus d’éligibilité/export, aucune mutation supplémentaire |
| Mauvais fichier relu ou fichier différent d’un seul espace | Refus de validation de la sauvegarde ; procédure manuelle inaccessible tant que toutes les copies et le diagnostic ne sont pas relus |
| Export/relecture/inspection en attente puis changement de compte | Trois résultats anciens refusés ; ressources et journaux des deux comptes conservés |
| Deux onglets au quota saturé | Exports possibles dans les deux onglets sans mutation ; après rétablissement du budget fictif, une récupération réussit et l’autre reçoit un conflit |
| Espace favorable à l’aperçu puis épuisé avant application | Nouveau contrôle sous verrou : refus avant toute écriture, snapshot exact inchangé |
| Estimation favorable mais vraie erreur de quota aux quatre écritures | Erreur claire conservant l’identité quota ; copies précédentes intactes et toujours exportables ; aucun rollback ni nettoyage destructif |
| Espace inconnu ou lecture d’estimation impossible | Récupération bloquée sans écriture |
| Espace suffisant | Retour exact à la version précédente, marqueur vérifié, anciennes entrées conservées |

Pour un refus au contrôle préalable ou à la première écriture, le stockage complet reste identique. Si un quota survient après une écriture effectivement réussie, un journal ou marqueur partiel peut rester : les octets des versions métier antérieures persistent dans la destination ou les copies journalisées. La suite vérifie cette distinction ; elle ne prétend pas annuler une écriture déjà persistée.

Preuves générées : `test-results/resource-quota-recovery/browser-results.json`, `quota-summary.json` et pièces jointes `native-quota-saturation.json`, `quota-read-only-export.json`, traces de chaîne et fichiers JSON réellement téléchargés. Les exports utilisent les véritables fonctions applicatives, pas un exporteur de remplacement dans le test.

Échecs pendant l’itération : une assertion ancienne était sensible à la casse du mot quota et a été adaptée à la nouvelle erreur explicite. Le test existant de Web Locks **natifs Node entre threads** a observé une fois deux entrées concurrentes au lieu d’une ; il ne passe pas par le coordinateur applicatif. Sans modifier son assertion, il a ensuite réussi seul et dans deux passages complets à 20/20. Les scénarios Web Locks natifs de Chrome ont réussi. Cette intermittence Node est à surveiller.

## Fichiers concernés

- `app/lib/resourceRecoverySpace.ts` : estimation prudente, calcul du pic d’écriture, refus avant mutation, détection des erreurs de quota.
- `app/lib/resourceWriteCoordinator.ts` : inspection sans écriture, nouveau contrôle sous Web Lock et erreur de quota explicite.
- `app/lib/resourceBackupJson.ts` : export de copie, relecture vérifiée, session/conflits/propriétaire/SHA-256, inspection d’espace et lecture du format exporté.
- `app/lib/resourceRecoveryAssessment.ts` : occupation des copies, contenus uniques et coût encodé inclus dans le journal.
- `app/components/ResourceManualRecoveryPanel.tsx` : diagnostic d’espace, export/relecture, blocage d’écriture et procédure manuelle conditionnelle.
- `tests/resource-quota-recovery.test.mjs` et `tests/browser/resource-quota-recovery.spec.mjs` : nouveaux scénarios.
- Tests existants de remplacement, récupération manuelle, interface et croissance : injection explicite de disponibilité fictive ou adaptation à la nouvelle erreur/blocage.
- Bancs `resource-chain-harness.mjs`, `resource-chain-server.mjs`, `resource-harness-server.mjs` : module autorisé, budget fictif et saturation native dans le seul profil de test.
- `playwright.resource-quota-recovery.config.mjs` : suite et sorties dédiées.

## Risques restants et décision

1. Une estimation n’est ni une réservation ni une mesure du quota disponible universelle. L’usage de l’origine peut changer depuis un autre compte, un onglet ou un script ne partageant pas le verrou. Le navigateur peut refuser une écriture même après un contrôle favorable ; cette exception est traitée et testée.
2. localStorage reste non transactionnel entre clés. Une interruption tardive peut nécessiter un nouveau diagnostic. Le dispositif ne garantit ni une restauration par écriture sous saturation, ni la survie à une perte physique/éviction du profil.
3. Une empreinte SHA-256 détecte une altération par rapport à une empreinte persistée ; elle n’authentifie pas les données contre un script de même origine capable de modifier données et empreinte. Les fichiers externes et leur conservation restent nécessaires.
4. Les anciennes copies sans SHA-256 ne sont pas converties automatiquement et leur export certifié est refusé. Leur diagnostic reste exportable ; une procédure d’expertise distincte est requise avant d’élargir la recette à ces archives.
5. Aucun gain d’espace automatique et aucune garantie qu’une libération manuelle soit possible. Une reprise après rafraîchissement demande une nouvelle relecture des fichiers ; les confirmations restent en mémoire.
6. Validation sur Chrome avec comptes fictifs ; les autres navigateurs, modes privés et l’authentification distante restent à valider dans un environnement dédié.

**Avis : GO pour une prochaine recette contrôlée, sur données fictives v2 et avec vérification des fichiers externes.** Toute activation de production reste hors périmètre. `ACCOUNT_SCOPED_RESOURCES_ENABLED = false`, récupération/remplacement désactivés par défaut, `CLOUD_SYNC_SUSPENDED = true`. Aucun changement Supabase, aucun accès à des données réelles, aucune suppression ou conversion automatique des journaux historiques.
