# Guide de déploiement

## Étape 1 — Supabase (5 min)

1. Va sur [supabase.com](https://supabase.com) → New Project
2. Nom : `mediatheques-strasbourg`
3. Génère un mot de passe fort (note-le)
4. Région : `West EU (Ireland)` ou `EU Central (Frankfurt)`
5. Une fois le projet créé, va dans **SQL Editor** et colle tout le contenu de `docs/supabase/schema.sql`
6. Clique **Run**
7. Va dans **Settings → API** et copie :
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`

## Étape 2 — GitHub (2 min)

1. Va sur [github.com/new](https://github.com/new)
2. Nom : `mediatheques-strasbourg`
3. Visibilité : **Private**
4. Ne pas initialiser (le repo local existe déjà)
5. Clique **Create repository**
6. Copie l'URL SSH ou HTTPS du repo (ex: `https://github.com/TON_USERNAME/mediatheques-strasbourg.git`)
7. Dans le terminal, tape ces commandes (remplace l'URL) :

```bash
cd "/Volumes/SSD dock/Paulbindler.dock/Projets Claude/mediatheques-strasbourg"
git remote add origin https://github.com/TON_USERNAME/mediatheques-strasbourg.git
git push -u origin main
git push origin feat/v2-mon-compte
```

## Étape 3 — Vercel (5 min)

1. Va sur [vercel.com](https://vercel.com) → **New Project**
2. Importe depuis GitHub → `mediatheques-strasbourg`
3. Framework : **Next.js** (détecté automatiquement)
4. Dans **Environment Variables**, ajoute toutes ces variables :

| Variable | Valeur |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | (depuis Supabase Step 1) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (depuis Supabase Step 1) |
| `SUPABASE_SERVICE_ROLE_KEY` | (depuis Supabase Step 1) |
| `ENCRYPTION_KEY` | `7f5bbe320581971420e462557c9eb0f115323e47ed1de386d483cee6a01ff5e6` |
| `VAPID_PUBLIC_KEY` | `BFbthZHY4Qnfi3qcNOPb_VPpKK0ca8bswmNC6iqZJaogciumKBA1ZoY_FIBwjkKHOidQa4Ey-MF3blATi2EyF-s` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | `BFbthZHY4Qnfi3qcNOPb_VPpKK0ca8bswmNC6iqZJaogciumKBA1ZoY_FIBwjkKHOidQa4Ey-MF3blATi2EyF-s` |
| `VAPID_PRIVATE_KEY` | `TxhAbJAdboVMByp6gAUs_KVjndUWIQ8CS24CgHfsCI4` |
| `VAPID_SUBJECT` | `mailto:paul.bindler@gmail.com` |
| `CRON_SECRET` | `20789e2fdaabe187d8653dab6ccaccf2` |

5. Clique **Deploy**
6. Attends que le build passe (2-3 min)

## Étape 4 — Vérification (5 min)

1. Ouvre l'URL Vercel → tu dois voir la page Login
2. Crée un compte avec ton email
3. Tu dois être redirigé vers `/compte` → bouton "Configurer"
4. Suis l'onboarding pour coller tes cookies InstanceCI et InstanceST
5. Tes réservations doivent apparaître

**Pour tester le cron manuellement :**
```bash
curl -H "Authorization: Bearer 20789e2fdaabe187d8653dab6ccaccf2" \
  https://TON-APP.vercel.app/api/cron/daily
```
Résultat attendu : `{"processed":1,"notified":0}` (ou un chiffre > 0 si des docs sont à rendre)

## Étape 5 — iPhone (2 min)

1. Ouvre l'URL Vercel dans **Safari** (pas Chrome)
2. Icône Partager → **"Sur l'écran d'accueil"**
3. Nom : `Médiathèques` → Ajouter
4. Ouvre l'app depuis l'écran d'accueil (mode standalone sans barre Safari)
5. Va sur `/compte` → accepte la demande de notifications push

> **Note :** Les notifications push iOS nécessitent que l'app soit ouverte depuis l'écran d'accueil, pas depuis Safari directement. C'est une contrainte Apple.

## Icônes manquantes

Les icônes PWA (`/public/icon-192.png` et `/public/icon-512.png`) sont des placeholders.
Pour en créer des vraies : utilise [realfavicongenerator.net](https://realfavicongenerator.net)
et place les fichiers dans `public/`.
