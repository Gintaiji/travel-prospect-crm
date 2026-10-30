# 97C-2B3D13 — Ergonomie mobile de la récupération Ressources

Recette du 30 octobre 2026, exclusivement sur comptes et données fictifs. Le serveur local dédié du pilote D12, les vrais composants React et les styles du nouveau build sont réutilisés. Chrome installé **156.0.8078.49**, profils vierges, origines locales distinctes, réseau externe bloqué. Aucun accès à Supabase ni import de données réelles.

## Cause et correction

Le défaut D12-UI01 est reproduit avant correction : à **390 px**, le document atteint **572 px**. Dans `ResourceJsonBackupPanel`, une grille de 324 px calcule une colonne de 539 px. Le panneau `ResourceManualRecoveryPanel` hérite de cette largeur ; son sélecteur natif, avec UUID et libellé de copie, impose 513 px. Les pistes implicites `auto` et les minimums intrinsèques des éléments de grille propagent cette contrainte. Le déplacement du viewport mobile compromet ensuite le ciblage normal des confirmations. Les mesures montrent des éléments statiques, avec `z-index: auto` : aucune superposition modale personnalisée n'est responsable de ce débordement.

Corrections de présentation uniquement :

- `app/components/ResourceJsonBackupPanel.tsx` : classe de portée pour les styles du panneau.
- `app/components/ResourceManualRecoveryPanel.tsx` : classe de portée, identité complète de la copie affichée sous le sélecteur avec retour à la ligne ; aperçu JSON nommé et accessible au clavier.
- `app/globals.css` : colonnes `minmax(0, 1fr)`, minimums à zéro, largeur des champs bornée, coupure des contenus longs. Boutons multilignes, cibles de confirmation d'au moins 44 px, cases de 20 px, champs à 16 px, contraste sombre et focus vert visible. Aperçus défilants limités à `min(16rem, 40dvh)`, marge de défilement et prise en compte de la zone de sécurité basse. Le document conserve son défilement vertical naturel ; aucun masquage du débordement de la page ni panneau fixe ne cache des contrôles.

Aucun gestionnaire métier, prédicat de confirmation, contrôle SHA-256, Web Lock ou contrôle de session/quota modifié. La confirmation native reste obligatoire. Son annulation puis son acceptation sont testées ; l'annulation conserve exactement le stockage précédent.

## Résultats

Un passage complet : **59/59**, aucun échec, aucun test ignoré, aucune relance ni intermittence détectée (`flaky: 0`, retries désactivés).

| Environnement | Parcours A/B, remplacement, récupération, expiration | Export vérifié sous quota saturé | Refus d'un profil étranger | Largeur du document aux captures |
|---|---|---|---|---|
| PC 1440 × 1000 | Réussi | Réussi | Réussi | 1440 px |
| Mobile 320 × 640 | Réussi | Réussi | Réussi | 320 px |
| Mobile 375 × 812 | Réussi | Réussi | Réussi | 375 px |
| Mobile 390 × 844 | Réussi | Réussi | Réussi | 390 px |

Les trois scénarios D12 sont conservés, avec assertions renforcées sur la largeur réelle du document **et** du viewport. Aux trois largeurs mobiles, les confirmations et la récupération fonctionnent aussi à **420 px de hauteur** : propriétaire saisi, navigation Tab, activation/désactivation par Espace, vérification du maintien du blocage tant qu'une confirmation manque, puis clics normaux sur les confirmations et le bouton final. Aucun `force: true`, clic JavaScript, modification de case par script ou appel direct de restauration ne remplace le parcours utilisateur. Les captures à 320 px ont été examinées visuellement.

Les **47/47 tests Chrome existants** de sécurité/récupération passent : deux vrais onglets, conflits sous Web Locks, changements de compte/session, interruptions, anciens journaux, refus des copies sans SHA-256/corrompues/d'un autre propriétaire, quota proche ou saturé, export sans écriture, conservation des octets après refus, vingt remplacements sans croissance récursive.

| Contrôle complémentaire | Résultat |
|---|---|
| Tests unitaires `node --test` sur tous les fichiers racine `tests/*.test.mjs` | **21/21 fichiers réussis**, aucun échec ni test ignoré |
| TypeScript `npx tsc --noEmit` | Réussi |
| ESLint ciblé : deux composants, scénario pilote et nouvelle configuration | Réussi |
| `npm run build` | Réussi |
| Vérification du build de production | Isolation littéralement `false`, branche historique compilée, **439 fichiers inspectés, zéro marqueur de pilote** |

Le comptage unitaire ci-dessus est celui des 21 fichiers présents et du résultat Node de ce passage ; aucune suppression de test n'a été effectuée. Les avertissements Playwright `NO_COLOR`/`FORCE_COLOR` sont sans échec associé.

## Reproduction et preuves

Configuration ajoutée : `playwright.resource-mobile-recovery.config.mjs`. Le scénario existant `tests/browser/resource-functional-pilot.spec.mjs` contient les mesures, contrôles clavier/hauteur réduite et l'annulation native supplémentaires.

```powershell
$tests = (Get-ChildItem tests -Filter '*.test.mjs').FullName
node --test $tests
npx tsc --noEmit
npx eslint app/components/ResourceManualRecoveryPanel.tsx app/components/ResourceJsonBackupPanel.tsx tests/browser/resource-functional-pilot.spec.mjs playwright.resource-mobile-recovery.config.mjs
npm run build
node tests/pilot/verify-production-build.mjs
npm run test:browser -- --config=playwright.resource-mobile-recovery.config.mjs
```

Preuves dans `test-results/resource-mobile-recovery/` : `before/results.json` (échec reproduit avant correction), `after/results.json` (passage complet), `summary.json`, `unit.log`, `production-build.json`, captures, diagnostics de dimensionnement et fichiers JSON téléchargés. Le passage ciblé intermédiaire à 390 px avait également réussi ; le bilan 59/59 concerne le passage complet ultérieur.

## Limites restantes

- Les mobiles sont émulés dans le vrai binaire Chrome, sans téléphone physique. La réduction à 420 px teste l'accès aux contrôles lorsque la hauteur manque ; elle ne simule pas intégralement un clavier Android/iOS, ses événements `visualViewport`, les sélecteurs système ou Safari. Une vérification tactile sur appareil réel avec clavier ouvert reste nécessaire.
- Les sélecteurs et confirmations natifs restent gérés par le navigateur ; leur présentation système n'est pas contrôlable par le CSS. L'identité complète de la copie reste lisible sous le sélecteur même lorsque celui-ci tronque son option.
- Les observations D12-UI02 (rafraîchissement explicite après récupération) et D12-UI03 (texte de migration ambigu) restent hors de cette correction. Aucune règle métier ni autre module n'a été modifié pour les masquer.
- Les journaux continuent de croître linéairement ; la saturation à long terme et l'absence de transaction multi-clés demeurent. Une estimation d'espace ne garantit jamais une écriture. Les anciennes copies non vérifiables restent conservées et refusées, et les exports externes vérifiés restent nécessaires.

**D12-UI01 est corrigée et validée sur la matrice demandée.** Ce résultat n'autorise aucune activation réelle automatique : `ACCOUNT_SCOPED_RESOURCES_ENABLED = false`, récupération/remplacement désactivés par défaut, cloud suspendu. Supabase et les actions Ressources vers Prospects restent inchangés. Les autres conditions de sécurité et de validation sur appareil réel du rapport D12 demeurent applicables.
