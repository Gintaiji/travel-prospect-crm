# 97C-2B2 — Suivi central des sessions

## Périmètre

Le fournisseur React `UserSessionProvider` est monté dans le layout. Il partage
`userSessionStore` entre les consommateurs et utilise exclusivement le client
Supabase existant. La fabrique `createBrowserSupabaseClient` conserve désormais
une seule instance dans le navigateur et n'en crée aucune côté serveur.
Les méthodes et le code de la page Connexion ne sont pas modifiés.

Le nouveau suivi ne modifie ni l'authentification configurée, ni les tables, ni les
prospects, ni les sauvegardes. Il ne migre rien et ne réactive pas le cloud.
Les pages métier continuent de lire et écrire via leurs fonctions historiques.

## Confirmation et invalidation

`useUserSession()` expose `status` (`loading`, `connected`, `disconnected`, `error`),
`userId`, les seules données d'affichage utilisateur, `generation`, `expiresAt`,
`error`, `refresh()` et `beginOperation()`. Aucun jeton d'authentification n'est
exposé par l'état React.

La présence d'une session locale ou d'un événement `SIGNED_IN` ne suffit pas :
`getUser()` doit confirmer le même UUID, avec une échéance de session valide.
En chargement, erreur ou déconnexion, `userId` est immédiatement nul. Les jetons
de stockage de la génération précédente sont invalidés synchroniquement.

Chaque événement de session, y compris un renouvellement de jeton ou une
reconnexion au même UUID, provoque une nouvelle génération. Une réponse
asynchrone ne peut modifier l'état que si sa génération et son cycle de montage
sont encore courants. Une erreur ancienne sous A ne déconnecte jamais B.

La validation réseau est programmée hors du rappel `onAuthStateChange`, afin de
ne pas attendre une méthode d'authentification pendant que le SDK détient son
verrou. L'abonnement est installé avant la lecture initiale ; un événement plus
récent empêche une ancienne lecture `getSession()` de rétablir son utilisateur.

Un minuteur retire les sessions expirées. Chaque accès au stockage et chaque
application de résultat vérifie aussi l'échéance, même si les minuteurs d'un onglet
en arrière-plan ont été retardés. Une erreur réseau ou une identité non confirmée
refuse les nouveaux accès ; `refresh()` permet une nouvelle vérification sans
déconnexion forcée ni effacement local. Une session distante révoquée ne peut être
connue qu'à travers les événements, une validation réseau ou l'échéance locale.

## Abonnements et nettoyage

Plusieurs consommateurs/fournisseurs partagent un seul abonnement Supabase,
avec comptage des montages. Le dernier démontage désabonne, annule les minuteurs
et invalide les accès en attente. Le serveur dispose uniquement d'un instantané
initial de chargement et ne démarre aucune authentification pendant le rendu.

`LocalDataMigration` n'a plus son propre abonnement Supabase ni sa propre révision
de session : il écoute le magasin central et réinitialise aperçu et confirmations
à chaque génération. Les opérations manuelles de migration restent explicites.
`CloudAutoSync` écoute également ce magasin pour annuler ses minuteurs ; ses
gardes de suspension restent inchangées. L'ancien mécanisme de chargement cloud
reste présent mais inactif tant que la suspension est activée.

## Utilisation future par les composants isolés

```tsx
const session = useUserSession();
// Cette fonction ferme sur la génération de ce rendu, jamais sur le prochain compte.
const operation = await session.beginOperation();
const result = await calculateSomething();
operation.commit(() => setResult(result)); // rappel strictement synchrone
operation.business.saveProspects(updatedProspects);
```

`beginOperation()` valide un propriétaire via `accountScopedStorage`, conserve
le même jeton confirmé pour les consommateurs parallèles de cette génération,
et fournit `accountBusinessStorage.forOwner(owner)`. Les gardes de migration
vérifiée restent applicables : aucun accès par défaut aux anciennes clés.
Conserver l'opération initiale jusqu'à son résultat ; ne pas acquérir une nouvelle
opération pour appliquer des données calculées sous un ancien compte.
`commit()` est réservé à un rappel synchrone : terminer les traitements asynchrones
avant de l'appeler. Chaque écriture métier garde aussi ses propres vérifications.

Pour les futurs sous-arbres isolés, `AccountSessionBoundary` affiche un repli
hors connexion confirmée, et utilise une clé `userId:generation` pour remonter
le contenu à chaque changement. Cela réinitialise sa mémoire React, sans effacer
aucune clé localStorage. Aucune page métier n'est placée derrière cette frontière
dans cette étape : son activation doit accompagner le branchement au nouveau
stockage, page par page.

## Tests et vérifications

- `node tests/user-session-store.test.mjs` : A, déconnexion, B, opérations et
  réponses périmées, reconnexion au même compte, renouvellement, expiration,
  réseau indisponible, reprise, abonnements partagés et nettoyage. Tout est simulé.
- `node tests/user-session-provider.test.mjs` : rendu serveur sans identité ni
  contenu privé, clé de réinitialisation, états de repli et génération capturée
  par le hook. Les tests de branches du hook utilisent des hooks déterministes.
- Les suites de stockage, métier, migration et suspension cloud restent exécutables.

Le lint ciblé doit passer. Le lint global présente au moment de cette étape
9 erreurs et 3 avertissements dans des fichiers non modifiés : `assistant`,
`connexion`, `useSpeechRecognition`, `prospects`, `sauvegarde`, `street-marketing`
et un avertissement dans `aujourdhui`. Ils ne sont pas masqués ni modifiés ici.
