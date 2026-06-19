# App Médiathèques Strasbourg — Design Spec
*2026-06-19 · Direction validée : B App Native*

---

## 1. Contexte et périmètre

App personnelle (multi-utilisateur prévu dès le départ) pour suivre ses prêts et réservations aux médiathèques de Strasbourg, croiser ses envies avec le catalogue, et recevoir des notifications push.

**Ce que cette spec couvre :** V2 (Mon compte) + structure V1 (Catalogue) + shell V3 (Mes envies).  
**Ce qu'elle ne couvre pas :** logique d'authentification PSN, historique V4, liste universelle.

---

## 2. Stack technique

| Couche | Choix | Rôle |
|---|---|---|
| Frontend | Next.js (App Router) | PWA mobile-first + desktop |
| Backend | Vercel Serverless Functions | Proxy API Iguana, Web Push |
| Base de données | Supabase | Comptes utilisateurs, listes, cookies chiffrés |
| Auth | Supabase Auth | Email/password, multi-utilisateur |
| Notifications | Web Push API standard | iOS 16.4+ (app sur écran d'accueil) |
| Cron | Vercel Cron Jobs | Vérification quotidienne 8h |
| Déploiement | Vercel | heures-hebdo pattern déjà connu |

Pas de n8n, pas de service tiers pour les push.

---

## 3. APIs Iguana (reverse-engineered)

Endpoints confirmés, authentification par cookies de session :

```
GET /Portal/Services/UserAccountService.svc/ListLoans
    ?serviceCode=IGUANA_2&token={Date.now()}&userUniqueIdentifier=&timestamp={Date.now()}

GET /Portal/Services/UserAccountService.svc/ListBookings
    ?serviceCode=IGUANA_2&token={Date.now()}&userUniqueIdentifier=&timestamp={Date.now()}
```

**Authentification :** cookies `InstanceCI` et `InstanceST` transmis par le serveur Vercel.  
**Token :** `Date.now()` en millisecondes — pas un secret, juste un timestamp.

**Champs exploités :**

*ListBookings (réservations) :*
- `Title`, `Author`, `ThumbnailUrl` — identité du document
- `TypeOfDocument` — BD, Jeu vidéo, Livre…
- `IsAvailable` — prêt à récupérer ou pas
- `AvailabilityDate` — date de mise à disposition
- `AvailableUntilDate` — date limite de retrait
- `Rank` / `RankSort` — position dans la file (0 = disponible)
- `LocationLabel` — médiathèque concernée
- `CanCancel` — bouton annuler à afficher ou non
- `TitleLink` — lien fiche catalogue

*ListLoans (prêts en cours) :*
- `Title`, `ThumbnailUrl`, `TypeOfDocument`
- `WhenBack` — date de retour à rendre
- `Location` — médiathèque d'emprunt
- `State` — état (normal, en retard)

---

## 4. Architecture

```
Next.js App
├── app/
│   ├── (auth)/login        → connexion Supabase Auth
│   ├── compte/             → Mon compte (V2)
│   ├── catalogue/          → Catalogue Iguana (V1)
│   └── envies/             → Mes envies (V3 — shell)
├── api/
│   ├── iguana/loans        → proxy ListLoans (cookies serveur)
│   ├── iguana/bookings     → proxy ListBookings (cookies serveur)
│   ├── push/subscribe      → enregistrement Web Push
│   ├── push/send           → envoi notification
│   └── cron/daily          → job quotidien 8h
└── lib/
    ├── iguana.ts           → client Iguana
    ├── push.ts             → Web Push helpers
    └── supabase.ts         → client Supabase
```

**Supabase tables :**
```sql
users           — géré par Supabase Auth
iguana_sessions — user_id, instance_ci (chiffré), instance_st (chiffré), updated_at
push_subscriptions — user_id, endpoint, keys
wishlists       — user_id, type (ps5|film|bd), title, external_id
```

---

## 5. Design system — B App Native

### Palette
```
--bg:        #F6F7F9   fond général
--surface:   #FFFFFF   cartes, header, nav
--navy:      #0D1B2A   texte principal, nav active, pills active
--orange:    #F97316   accent (badges urgents, sélection)
--green:     #22C55E   statut disponible
--red:       #EF4444   statut urgent / expirant
--gray-400:  #A0A8B4   texte secondaire
--gray-200:  #E2E8F0   badge en attente (fond)
--gray-600:  #64748B   badge en attente (texte)
--border:    #F0F1F3   séparateurs
```

### Typographie
```
Font: DM Sans (Google Fonts)
- 300  →  métadonnées très secondaires
- 400  →  corps de texte
- 500  →  labels nav inactifs
- 700  →  titres documents
- 800  →  heading page, nav active
```

### Composants

**Card document**
```
┌─────────────────────────────────────┐
│  [Cover 44×63]  Titre du document   │
│                 BD · André Malraux  │
│                 [Badge statut]      │
│                 Date si pertinente  │
└─────────────────────────────────────┘
radius: 16px | shadow: 0 1px 6px rgba(0,0,0,0.06) | padding: 11px
```

**Badges statut**
- Rouge `#EF4444` + texte blanc → expire aujourd'hui / en retard
- Vert `#22C55E` + texte blanc → à récupérer
- Gris `#E2E8F0` + texte `#64748B` → en attente (rang N)

**Navigation bottom (mobile)**
```
[👤 Compte]  [🔍 Catalogue]  [⭐ Envies]
Active : label DM Sans 800, navy, opacité icône 100%
Inactif : label 500, gray-400, opacité icône 22%
```

**Navigation sidebar (desktop ≥ 768px)**
Même 3 items, disposés verticalement à gauche, 240px de large.

---

## 6. Écrans V2 — Mon compte

### 6.1 Écran principal

```
Header (white)
  Vendredi 19 juin 2026
  Bonjour, Paul                     ← DM Sans 800
  [Prêts (0)]  [Réservations (5)]   ← pills toggle

Liste de cards (triées : urgent > disponible > en attente)
  Card 1 : Le roi méduse — badge ROUGE "Expire aujourd'hui"
  Card 2 : L'ombre de l'oiseau — badge VERT + "Disponible jusqu'au 3 juil."
  Card 3 : Prison et ciel — badge GRIS "Rang 1 dans la file"
  ...

Bottom nav : Compte · Catalogue · Envies
```

**Tri des cards :**
1. Expire aujourd'hui (rouge urgent)
2. À récupérer (vert)
3. En attente, trié par rang croissant

### 6.2 Notifications push

Déclencheurs (vérification cron 8h chaque matin) :
- `IsAvailable` passe à `true` → "📗 [Titre] est prêt à André Malraux"
- `AvailableUntilDate` = demain → "⏰ Dernier jour — [Titre] à récupérer"
- `WhenBack` = dans 2 jours → "📅 [Titre] à rendre avant [date]"
- `State` = retard → "⚠️ [Titre] est en retard"

### 6.3 Onboarding (première connexion)

1. Connexion Supabase Auth (email/password)
2. Écran "Connecte ta médiathèque" : instructions pour copier `InstanceCI` + `InstanceST`
3. Stockage chiffré en Supabase
4. Activation notifications push (prompt natif iOS/Android)

---

## 7. Écran Catalogue (V1 intégrée)

Le HTML existant est réécrit en composant Next.js. Même logique de filtres Iguana, même URL building. Design adapté au système B App Native (header blanc, rayons en pills horizontales, sidebar filtres).

---

## 8. Écran Mes envies (V3 — shell uniquement)

Interface liste vide avec CTA "Ajouter un jeu PS5 / un film / une BD". Pas de logique de croisement catalogue dans cette version. Données stockées en Supabase (`wishlists`). Le croisement × catalogue Iguana arrive en V3.

---

## 9. Responsive

| Breakpoint | Layout |
|---|---|
| < 768px | Bottom nav, cards pleine largeur, header compact |
| ≥ 768px | Sidebar 240px gauche, contenu principal, cards en grille 2 colonnes |
| ≥ 1280px | Sidebar + contenu 800px max centré |

---

## 10. PWA

- `manifest.json` : nom "Médiathèques", icône, `display: standalone`
- Service Worker : cache offline basique + Web Push
- Condition iOS : app doit être ajoutée à l'écran d'accueil pour les notifications

---

## 11. Ce qu'on ne fait pas maintenant

- API PSN (wishlist) — V3
- Historique d'emprunts — V4
- Croisement liste perso × catalogue — V3
- Widget iOS Scriptable — après V2 validée
- JustWatch integration — idée future
- Liste universelle PSN+médiathèque — idée future
