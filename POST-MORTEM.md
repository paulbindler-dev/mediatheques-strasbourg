# Post-mortem : bug GetHoldings — 4 jours perdus

**Date de résolution :** 22 juin 2026  
**Durée du blocage :** ~4 jours  
**Symptôme :** "Tout vérifier" dans Mes listes laissait tous les titres en gris (disponibilité inconnue)

---

## Ce qu'on cherchait

Afficher la disponibilité réelle de chaque livre depuis le catalogue Iguana des médiathèques de Strasbourg : disponible (vert), emprunté avec date de retour (orange), ou non trouvé (gris).

L'API Iguana expose un endpoint `GetHoldings` qui retourne exactement ça. Le problème : nos appels retournaient systématiquement une erreur.

---

## L'erreur qu'on voyait

```json
{
  "errors": [{"id": "ILSClientService", "msg": "Une erreur est survenue..."}],
  "success": false
}
```

---

## Ce qu'on a cru (à tort) pendant 4 jours

### Hypothèse 1 — Problème d'authentification

L'erreur `ILSClientService` ressemble à une erreur côté serveur ILS (le système de gestion de bibliothèque). On a supposé que le serveur Iguana refusait nos requêtes parce qu'on n'était pas authentifiés correctement.

**Ce qu'on a fait en réponse :**
- Implémenté une session anonyme (cookies de la page d'accueil)
- Implémenté une session patron (login avec carte + mot de passe)
- Ajouté un "warm-up" en deux étapes (homepage → page document → GetHoldings)
- Essayé des dizaines de combinaisons de cookies
- Débogué le flow d'authentification pendant des heures

**Résultat :** Aucune amélioration. La même erreur quelle que soit l'authentification.

### Hypothèse 2 — Blocage IP / Vercel

On a suspecté que le serveur Iguana bloquait les requêtes venant de Vercel (une IP de datacenter plutôt qu'un navigateur).

**Ce qu'on a fait en réponse :**
- Ajouté des headers `User-Agent` réalistes pour imiter un vrai navigateur
- Ajouté des headers `Referer` et `X-Requested-With`
- Testé depuis différentes URLs de Vercel
- Tenté l'endpoint `CheckAvailability` en alternative

**Résultat :** Toujours la même erreur.

### Hypothèse 3 — Problème d'encodage ou de format JSON

On a suspecté que le serveur ne recevait pas correctement notre JSON.

**Ce qu'on a fait en réponse :**
- Essayé différents `Content-Type` headers
- Ajouté/retiré `charset=utf-8`
- Testé avec des corps JSON différents

**Résultat :** Une variante a produit une erreur différente (`JsonFaultBodyWriter`) — ce qui a failli nous mettre sur la bonne piste, mais on a mal interprété le signal.

---

## La vraie cause (découverte le jour 4)

**Le corps de la requête était entièrement faux depuis le début.**

Voici ce qu'on envoyait :
```json
{ "id": "_1234", "BaseName": "IGUANA_2", "lang": "fr" }
```

Voici ce que l'API Iguana attend réellement :
```json
{ "Record": { "RscId": "1234", "Docbase": "IGUANA_2" } }
```

C'est une différence totale de structure. Jamais nos requêtes n'auraient pu fonctionner, peu importe l'authentification, peu importe les cookies, peu importe les headers.

---

## Pourquoi on s'est trompés si longtemps

### 1. Le corps original venait de nulle part

Le format `{id, BaseName, lang}` a été inventé de toutes pièces (ou copié depuis une documentation générique Iguana non applicable). Il n'existe pas dans l'API réelle. Personne ne l'a vérifié à la source.

### 2. L'erreur était trompeuse

`ILSClientService` ressemble à "le serveur ILS a eu un problème" — donc on a cherché un problème côté serveur (auth, IP, réseau). En réalité ça signifiait "je ne sais pas traiter cette requête" — un problème côté client.

C'est l'équivalent d'appeler un médecin avec la mauvaise adresse et de passer 4 jours à diagnostiquer des problèmes de réseau téléphonique alors que le problème est simplement que le numéro est faux.

### 3. On a cherché le bug au mauvais endroit

Chaque tentative de fix confirmait la direction (authentification, réseau) au lieu de la remettre en question. On a ajouté de la complexité (warm-up session, fallback patron, retry logic) sur une base fondamentalement incorrecte.

### 4. On n'a pas lu le code source de référence assez tôt

La solution n'était qu'à un `grep "GetHoldings"` de distance dans le fichier JavaScript d'Ermes (`portal-front-all.js`) qui tourne sur le serveur Iguana lui-même. Ce fichier contient le code exact qui appelle `GetHoldings` depuis le navigateur. On aurait pu le lire dès le premier jour.

---

## Comment on a finalement trouvé

On a lu le fichier JavaScript source d'Ermes directement sur le serveur Iguana :

```
https://www.mediatheques.strasbourg.eu/ui/250195790006/plug-in/portal/portal-front-all.js
```

En cherchant `getHoldingsFullLegacy`, on a trouvé :

```javascript
function getHoldingsFullLegacy(rscId, docbase, pazPar2Id, searchQuery) {
  return wsCall('ILSClient.svc/GetHoldings', {
    Record: { RscId: rscId, Docbase: docbase, PazPar2Id: pazPar2Id },
    searchQuery: searchQuery
  })
}
```

Format exact, sans ambiguïté. Une fois ce corps utilisé, ça a fonctionné immédiatement.

---

## Leçons apprises

### 1. Lire le code source de référence en premier

Pour toute API non documentée publiquement, la première étape est de trouver comment elle est appelée par son propre client officiel. Dans ce cas, le JavaScript de la page du site de la médiathèque contient exactement les appels qu'on veut reproduire.

**Règle :** Avant de tenter quoi que ce soit, chercher `portal-front-all.js` (ou équivalent) et greper pour le nom de l'endpoint.

### 2. Distinguer "corps invalide" de "auth refusée"

Une erreur `ILSClientService` ne signifie pas "tu n'es pas authentifié". Elle signifie "je ne peux pas traiter cette requête". Ces deux catégories d'erreurs demandent des investigations complètement différentes.

**Règle :** Quand une API retourne une erreur, chercher d'abord si le format du corps est correct avant de toucher à l'auth.

### 3. Remettre en question les hypothèses de base

Quand rien ne fonctionne après plusieurs jours, le problème n'est probablement pas là où on cherche. C'est le moment de remettre en question les fondamentaux — y compris le corps de la requête qu'on a peut-être jamais vérifié.

**Règle :** Si après 2 essais consécutifs d'une même direction ça ne marche pas, changer de direction.

### 4. Une erreur différente = progrès

Quand `JsonFaultBodyWriter` est apparu (lors du test avec `CheckAvailability`), c'était un signal que le serveur *recevait* bien notre JSON mais ne pouvait pas le désérialiser. On était plus proches qu'avant. On aurait dû creuser cette piste immédiatement plutôt que de continuer ailleurs.

**Règle :** Documenter les erreurs vues. Une erreur qui change = une contrainte qui change = une information.

---

## État final après fix

| Ce qui fonctionne | Méthode |
|---|---|
| Disponibilité sur fiche document | `GetHoldings` avec `{Record: {RscId, Docbase}}` + session warm-up |
| "Tout vérifier" dans Mes listes | Appels parallèles GetHoldings pour chaque titre |
| Texte UTF-8 correct | `TextDecoder('utf-8')` sur `arrayBuffer()` |
| Icône M centrée | SVG `dominant-baseline="central"`, Georgia serif |
| Pas de zoom iOS au focus | `font-size: 16px` sur tous les inputs en mobile |

| Ce qui ne fonctionne pas encore | Raison |
|---|---|
| `CheckAvailability` depuis Vercel | Retourne `ILSClientService` — probablement un problème de contexte serveur différent de `GetHoldings`. Fonctionne depuis le navigateur. Non bloquant car `GetHoldings` suffit. |
