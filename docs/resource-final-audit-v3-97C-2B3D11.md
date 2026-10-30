# 97C-2B3D11 — Recette finale V3 après correction D9-01

30 octobre 2026. **GO pour un pilote isolé sur données exclusivement fictives, aux conditions ci-dessous. Aucun GO de production ni activation automatique.**

## Résultats

Tests existants réutilisés, assertions inchangées, aucun retry ni test ignoré. Vrai **Chrome 156.0.8078.49** en mode headless, avec deux onglets réels de même origine pour les scénarios de concurrence et de séparation A/B. Identités synthétiques ; aucune authentification distante ni donnée réelle.

| Vérification | Résultat |
|---|---|
| `node --test tests/*.test.mjs tests/cloud-sync-suspension.cjs` | **21/21 fichiers réussis** |
| Playwright, configuration `playwright.resource-final-v3.config.mjs` | **47/47 réussis** |
| Même configuration, `CRM_RESOURCE_AUDIT_MODE=concurrency` | **27/27 réussis** : neuf scénarios répétés trois fois |
| Test existant du coordinateur et des Web Locks Node | **30/30 passages indépendants réussis**, Node v25.9.0 |
| `tsc --noEmit` | Réussi |
| ESLint ciblé sur les fichiers de recette et modules audités | Réussi sans avertissement |
| `npm run build` | Réussi, Next.js 16.4.3, 20 pages |

**Aucune anomalie nouvelle ni intermittence observée.** Les intermittences antérieurement documentées de Node et de concurrence Chrome ne sont pas reproduites ; une campagne finie ne prouve pas leur disparition.

| Scénarios demandés | Constat |
|---|---|
| Ancienne copie sans SHA-256 | Export certifié et restauration refusés ; zéro écriture, snapshot intégral identique |
| Copie corrompue, empreinte absente/incorrecte, mauvais propriétaire ou provenance étrangère | Refus sans mutation ; contrôles directs du coordinateur inclus |
| Copie moderne valide | Export, relecture et restauration réussis ; les anciennes entrées du journal restent conservées |
| Revérification sous Web Lock | Source altérée pendant le contrôle d’espace : refus immédiatement avant écriture ; zéro écriture applicative supplémentaire |
| Deux onglets concurrents, modification pendant récupération | Un succès et un conflit, sans écrasement silencieux ; répétitions également réussies |
| Changement de compte / session périmée | Opérations anciennes, export et relecture refusés ; données A/B séparées |
| Récupération interrompue | Journal et copies conservés ; nouveau diagnostic et confirmations nécessaires avant reprise |
| Quota insuffisant, inconnu ou saturé | Écriture de récupération bloquée ; export d’une copie saine puis relecture SHA-256 réussis sans écriture locale, même au quota natif Chrome saturé |
| Vingt remplacements | **20/20**, profondeur d’imbrication **0 à chaque étape** ; croissance linéaire |

Les refus avant mutation conservent exactement le stockage complet. Après une interruption tardive, un marqueur/journal partiel peut rester ; les octets des versions précédentes restent intacts dans la destination ou les copies journalisées. Aucune atomicité multi-clés n’est promise.

## Mesures et risques résiduels

- Après 20 remplacements Chrome : journal **50 172 octets UTF-16 estimés**, total clés/valeurs **55 198**, fichier préalable **1 072 octets UTF-8 réels**. Aucun réembarquement récursif.
- Au quota natif saturé : **10 485 760 octets UTF-16 estimés** dans ce profil, export vérifié et empreinte du stockage complet identique avant/après. Ce chiffre n’est pas un quota universel.
- La rétention reste linéaire mais non bornée : dans la série fictive à 64 Kio de notes par version et budget de 4 Mio, **15 remplacements réussissent, le 16e est refusé sans altération de l’état précédent**.
- Une estimation favorable ne réserve pas le quota. localStorage reste non transactionnel, partagé par l’origine et exposé à l’éviction du profil. Les fichiers externes vérifiés restent nécessaires.
- Les copies historiques sans empreinte restent conservées pour expertise, jamais converties automatiquement pour autoriser leur restauration. SHA-256 n’est pas une signature contre un script de même origine modifiant données et empreintes.
- Cette recette ne valide ni l’authentification distante, ni des comptes réels, ni Firefox/Safari ou les modes privés.

## Conditions du pilote isolé

1. Utiliser une instance/origine et un profil Chrome dédiés, sans données existantes réelles, avec uniquement les comptes et jeux fictifs convenus. Aucun accès Supabase production ; les bancs actuels interdisent le SDK et les requêtes externes.
2. Exiger Web Locks natif, les confirmations de propriétaire, la relecture exacte des fichiers et le contrôle SHA-256 existants. Aucun contournement pour une copie ancienne non vérifiable.
3. Surveiller le volume, conserver les exports hors profil et appliquer les refus d’espace insuffisant/inconnu. Ne pas forcer l’écriture ni supprimer automatiquement des journaux pour gagner de la place.
4. À tout échec : arrêter les nouvelles écritures, conserver données et journaux, refaire un diagnostic ; toute intervention manuelle exige ses sauvegardes vérifiées.
5. Toute activation éventuelle dans l’instance dédiée nécessite une décision explicite distincte. Le commutateur étant global, ne pas l’activer dans une instance partagée pour sélectionner une simple cohorte. **Production désactivée et cloud suspendu restent obligatoires.** Un pilote sur comptes réels nécessiterait une validation supplémentaire de l’authentification et du déploiement.

**Verdict motivé : GO limité à ce pilote fictif isolé.** D9-01 est refusé correctement dans les tests mémoire et Chrome, les protections demandées passent et aucune régression n’est observée. Les limites de capacité et de durabilité empêchent toute promesse de récupération universelle ou extrapolation vers la production.

## Traçabilité

Aucun code métier modifié : **75 empreintes source identiques avant/après**. Les seuls changements de recette sont la configuration V3 et un répertoire de preuves paramétrable dans les outils existants ; aucune assertion n’a été assouplie. Aucun marqueur de banc trouvé dans les **438 fichiers** du build inspectés, aucune route de test ajoutée, aucune requête externe signalée par les pièces de chaîne.

`ACCOUNT_SCOPED_RESOURCES_ENABLED = false`, remplacement/récupération désactivés par défaut, `CLOUD_SYNC_SUSPENDED = true`. Aucun changement Supabase, aucune donnée réelle ni suppression d’historique.

Preuves : `test-results/resource-final-v3/summary.json`, `full/results.json`, `concurrency/results.json`, `legacy-integrity-unit.json`, `retention.json`, `node-repetitions/summary.json`, logs unitaires/TypeScript/ESLint/build et pièces Playwright. Les preuves D9/D10 restent à leurs emplacements précédents.
