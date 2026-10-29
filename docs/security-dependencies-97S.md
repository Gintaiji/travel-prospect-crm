# 97S — Mise à jour de sécurité des dépendances

Intervention du 29 octobre 2026. **Les audits npm complet et production passent de 11 / 6 paquets vulnérables à 0 / 0.** Aucune modification de logique métier ni migration majeure de l’application.

## Versions avant / après

| Dépendance | Avant | Après | Motif |
|---|---|---|---|
| Next.js | 16.2.4 | **16.4.3** | Avis critiques et autres avis de sécurité ; branche majeure 16 conservée |
| React | 19.2.4 | **19.2.4** | Aucun avis dans l’audit installé ; compatible avec les peerDependencies de Next 16.4.3 |
| React DOM | 19.2.4 | **19.2.4** | Même version que React, aucun avis npm installé |
| eslint-config-next | 16.2.4 | **16.4.3** | Alignement avec Next et son plugin ESLint |
| @supabase/supabase-js | 2.106.1 | **2.106.1** | Inchangé |

Le registre npm et la [publication officielle Next 16.4.3](https://github.com/vercel/next.js/releases/tag/v16.4.3) ont été consultés. Il s’agit d’une version stable, sans canary. Les avis critiques les plus récents couvrent les versions 16 jusqu’à 16.4.0 ; rester en 16.2.x ne suffit donc pas à éliminer l’ensemble des constats. 16.4.3 reste dans la même version majeure et accepte React/React DOM 19.2.4. Node requis : >=20.9.0. Aucun codemod ni changement de configuration Next n’a été nécessaire.

Des versions React 19.2.x plus récentes existent, mais une mise à jour n’était pas nécessaire au traitement des avis présents dans cet arbre. Ne pas confondre les paquets React applicatifs et les implémentations RSC embarquées par Next : ces dernières sont actualisées avec Next.

## Modifications ciblées

Deux commandes, sans `npm audit fix` ni `--force` :

```text
npm install --save-exact next@16.4.3 eslint-config-next@16.4.3
npm update @babel/core baseline-browser-mapping brace-expansion browserslist js-yaml source-map-js zod
```

La première a éliminé le constat critique et actualisé les dépendances embarquées. La seconde ne cible que les sept paquets encore signalés après cette installation, en respectant les plages de leurs parents. Les changements induits dans leurs sous-arbres (Babel, données de compatibilité navigateur, binaires Next/Sharp, etc.) sont enregistrés dans le lockfile ; aucun paquet métier supplémentaire n’a été ajouté au manifeste. Sharp passe de 0.34 à 0.35 comme dépendance de Next corrigé, sans changement de son utilisation dans l’application.

`package.json` ne change que pour Next et eslint-config-next, tous deux épinglés à 16.4.3. `package-lock.json` a été mis à jour par npm, sans édition manuelle ni overrides. `npm ls --all --json` réussit sans conflit de dépendances. Le lockfile et les versions réellement installées sont conservés dans les preuves avant/après.

## Vulnérabilités corrigées

Les nombres npm sont des nombres de **paquets vulnérables**, pas des nombres d’avis. Le détail exhaustif des avis initiaux et de leurs plages figure dans le [diagnostic 97C-2B3D2](resource-diagnostic-97C-2B3D2.md) et dans le nouvel audit brut avant intervention.

| Paquet signalé | Versions avant → après | Gravité maximale initiale | Constats traités |
|---|---|---|---|
| next | 16.2.4 → 16.4.3 | Critique | RCE selon OS/fonction, contournements Proxy/Middleware, SSRF, DoS RSC/Server Actions et autres avis du rapport initial |
| sharp | 0.34.5 → 0.35.5 | Élevée | Dépendances natives libvips/libheif/librsvg ; notamment [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) |
| postcss | 8.4.31 embarqué + 8.5.14 → 8.5.23 | Élevée | Chargement sourcemap / lecture de fichiers, sortie CSS ; [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849) et autres avis initiaux |
| nanoid | 3.3.12 → 3.3.20 | Élevée | Boucles infinies sur tailles invalides ; [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8) |
| source-map-js | 1.2.1 → 1.2.2 | Élevée | Blocage sur offsets ; [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) |
| baseline-browser-mapping | 2.10.27 → 2.11.34 | Modérée | Arrêt sur entrée invalide ; [GHSA-w5vr-8v7q-w6rv](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv) |
| @babel/core | 7.29.0 → 7.29.7 | Faible | Lecture via sourceMappingURL ; [GHSA-4x5r-pxfx-6jf8](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8) |
| brace-expansion | 1.1.14 / 5.0.5 → 1.1.21 / 5.0.12 | Élevée | DoS CPU/mémoire et contournements des limites ; plusieurs avis, dont [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) |
| browserslist | 4.28.2 → 4.29.5 | Élevée | Cache illimité, statistiques hostiles ; [GHSA-73wf-gq98-2v4g](https://github.com/advisories/GHSA-73wf-gq98-2v4g) |
| js-yaml | 4.1.1 → 4.3.2 | Élevée | DoS sur clés de fusion / collections ; [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh) |
| zod | 4.4.3 → 4.6.7 | Élevée | Mémoire sur collections surdimensionnées ; [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) |

Les cinq avis critiques Next présents initialement étaient :

- [GHSA-p293-qw3h-jr36](https://github.com/advisories/GHSA-p293-qw3h-jr36), serveur Windows ;
- [GHSA-2xp9-vwfh-vxw4](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4), optimisation AVIF ;
- [GHSA-vcvr-r3jv-pc5j](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j), next/og ImageResponse ;
- [GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw), optimisation SVG selon environnement ;
- [GHSA-673q-mjm6-r5xr](https://github.com/advisories/GHSA-673q-mjm6-r5xr), fonctions `use cache` retournant plusieurs tableaux typés.

Ce sont des versions affectées réellement installées, pas une preuve d’exploitation de l’application. Aucun `next/image`, `next/og`, `use cache`, `use server` ou rewrites applicatives n’a été identifié lors du diagnostic précédent. Le serveur Next et sa chaîne de compilation restent concernés par les mises à jour, même sans ces fonctionnalités explicites. Les outils de développement peuvent aussi traiter des entrées non fiables pendant lint/build ; ils ont été corrigés dans leurs plages compatibles.

**Vulnérabilités restantes connues de ces audits : aucune.** Cela décrit l’état du registre au moment du contrôle, pas une garantie d’absence de vulnérabilités inconnues.

| Audit | Avant | Après | Code final |
|---|---|---|---|
| `npm audit --json` | 11 : 1 critique, 8 élevées, 1 modérée, 1 faible | **0** | 0 |
| `npm audit --omit=dev --json` | 6 : 1 critique, 4 élevées, 1 modérée | **0** | 0 |

## Vérifications exécutées

| Contrôle | Résultat |
|---|---|
| `node --test tests/*.test.mjs tests/cloud-sync-suspension.cjs` | 12/12 fichiers réussis |
| Tests navigateur existants via `playwright.security.config.mjs` | 16/16 réussis, sans retry ; inclut les dix scénarios initiaux et les diagnostics/concurrences D2 |
| `tsc --noEmit` | Réussi |
| `npm run build` | Réussi sous Next 16.4.3, 20 pages générées |
| ESLint des nouveaux fichiers de test/configuration | Réussi |
| `npm run lint` global | Échec : 9 erreurs et 3 avertissements préexistants dans assistant, connexion, useSpeechRecognition, prospects, sauvegarde, Street Marketing et aujourd’hui ; fichiers inchangés |
| `npm ls --all --json` | Réussi |
| Empreintes SHA-256 de tous les fichiers `app/` et `public/` | Identiques avant/après |

### PWA sur le vrai build de production local

`node tests/browser/pwa-security-97s.mjs` démarre `next start` sur 127.0.0.1 avec port éphémère, ouvre Chrome 156.0.8078.49 avec profil neuf et bloque les requêtes externes. Aucun compte connecté, aucune session existante importée et aucun accès Supabase. Résultats :

- Page Aujourd’hui et manifeste servis en HTTP 200, URL de démarrage `/aujourdhui`, mode standalone et icône disponibles.
- Vrai service worker enregistré, activé et contrôlant la page.
- Après mise en cache en ligne, rechargement hors ligne servi par le service worker en HTTP 200.
- Interface mobile d’installation déclenchée par un événement de test explicite ; appel de `prompt()` et persistance du refus dans le profil fictif vérifiés.
- Aucune erreur JavaScript non interceptée, aucune requête externe émise lors du passage.

Cela vérifie le fonctionnement du worker, du cache et du gestionnaire d’installation après mise à jour. L’installation native sur Android/iOS, les critères de promotion propres à Chrome et les anciens caches d’utilisateurs réels ne sont pas validés par ce test. Aucun cache réel ni donnée CRM n’a été modifié.

## Contraintes respectées et limites

`ACCOUNT_SCOPED_RESOURCES_ENABLED` reste `false`, `CLOUD_SYNC_SUSPENDED` reste `true`. Migration des comptes, sessions, données locales/cloud et Supabase inchangés. Aucun déploiement effectué. Le fichier non suivi `tatus`, présent au début de l’intervention, est laissé intact.

L’anomalie de concurrence 97C-2B3D2 reste reproductible dans ses tests et n’est pas corrigée par cette intervention. L’absence d’avis npm ne constitue pas une autorisation d’activer le stockage isolé ou de réactiver le cloud.

## Fichiers et preuves

- `package.json`, `package-lock.json` : versions et résolution npm.
- `tests/diagnostics/security-dependencies-97s.mjs` : audits avant/après, arbre installé, métadonnées du registre et contrôle d’intégrité des fichiers applicatifs/PWA ; refuse d’écraser des preuves existantes.
- `playwright.security.config.mjs` : réutilise la recette existante avec sorties propres à 97S, sans réécrire les traces antérieures.
- `tests/browser/pwa-security-97s.mjs` : test PWA local sur build de production.
- Ce rapport.

Les artefacts locaux dans `test-results/security-97s/` comprennent les audits complets et production avant/après, les manifestes/lockfiles copiés, l’arbre `npm ls`, les empreintes SHA-256, les résultats navigateur et le résultat/capture/trace PWA. Ce répertoire est ignoré par Git ; l’archiver séparément si nécessaire.
