# Médiathèques Strasbourg — V2 Mon Compte Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deployed Next.js PWA that shows a user's Strasbourg library loans and reservations, sends push notifications for due dates, and is secured behind Supabase Auth.

**Architecture:** Next.js 14 App Router with Supabase Auth for multi-user accounts. A server-side proxy decrypts stored Iguana session cookies and calls the library's internal JSON API. Vercel Cron triggers a daily check that sends Web Push notifications.

**Tech Stack:** Next.js 14, TypeScript, Supabase (Auth + Postgres), Vercel (hosting + cron), web-push, DM Sans (Google Fonts)

## Global Constraints

- Node 20+, Next.js 14.2+, TypeScript strict mode
- Font: DM Sans only (weights 300/400/500/700/800) — no Inter, no Roboto
- Colors: `--navy: #0D1B2A` `--orange: #F97316` `--green: #22C55E` `--red: #EF4444` `--bg: #F6F7F9` `--surface: #FFFFFF` `--border: #F0F1F3`
- Nav order (mobile bottom + desktop sidebar): Compte → Catalogue → Envies
- Iguana API base: `https://www.mediatheques.strasbourg.eu`
- Cookie format in requests: `InstanceCI=CUSB=${ci}; InstanceST=CUSB=${st}`
- Iguana token param = `Date.now()` in ms (not a secret, just a timestamp)
- All Supabase tables have RLS enabled, users own their own rows
- No dark backgrounds, no purple, no Inter font
- `.superpowers/` in `.gitignore`

---

## File Map

```
mediatheques-strasbourg/
├── app/
│   ├── layout.tsx                   root layout, DM Sans font, providers
│   ├── globals.css                  CSS variables, resets
│   ├── (auth)/
│   │   └── login/page.tsx           login + signup form
│   ├── (app)/
│   │   ├── layout.tsx               app shell: NavBottom + NavSidebar
│   │   ├── compte/
│   │   │   ├── page.tsx             Mon Compte — loans + bookings
│   │   │   └── onboarding/page.tsx  cookie setup wizard
│   │   ├── catalogue/page.tsx       placeholder (Plan B)
│   │   └── envies/page.tsx          placeholder (Plan B)
├── components/
│   ├── NavBottom.tsx                mobile bottom nav (3 tabs)
│   ├── NavSidebar.tsx               desktop sidebar nav
│   ├── BookingCard.tsx              reservation card
│   ├── LoanCard.tsx                 loan card
│   └── StatusBadge.tsx              colored status pill
├── lib/
│   ├── iguana.ts                    Iguana client, types, date parser, sort
│   ├── crypto.ts                    AES-256-GCM encrypt/decrypt
│   ├── supabase-browser.ts          browser Supabase client (singleton)
│   └── supabase-server.ts           server Supabase client (cookies)
├── api/ (inside app/api/)
│   ├── iguana/loans/route.ts        GET → proxy ListLoans
│   ├── iguana/bookings/route.ts     GET → proxy ListBookings
│   ├── iguana/session/route.ts      POST → save encrypted cookies
│   ├── push/subscribe/route.ts      POST → save push subscription
│   └── cron/daily/route.ts          GET → daily notification check
├── public/
│   ├── manifest.json                PWA manifest
│   └── sw.js                        service worker (push + cache)
├── middleware.ts                    redirect unauthenticated users
├── vercel.json                      cron schedule
└── .env.local                       env var template (not committed)
```

---

## Task 1: Project Init + Environment

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.env.local`, `.gitignore`, `vercel.json`

- [ ] **Step 1: Scaffold Next.js project**

```bash
cd "/Volumes/SSD dock/Paulbindler.dock/Projets Claude/mediatheques-strasbourg"
npx create-next-app@14 . --typescript --tailwind --eslint --app --src-dir=no --import-alias="@/*"
```

When prompted: Yes TypeScript, Yes ESLint, Yes Tailwind, Yes App Router, No src dir, `@/*` alias.

- [ ] **Step 2: Install dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr web-push
npm install -D @types/web-push
```

- [ ] **Step 3: Create `.env.local`**

```bash
cat > .env.local << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
ENCRYPTION_KEY=generate_with_openssl_rand_hex_32
VAPID_PUBLIC_KEY=generate_with_web-push_generate-vapid-keys
VAPID_PRIVATE_KEY=generate_with_web-push_generate-vapid-keys
VAPID_SUBJECT=mailto:paul.bindler@gmail.com
CRON_SECRET=generate_a_random_string
EOF
```

Generate the values:
```bash
# ENCRYPTION_KEY (32 bytes = 64 hex chars)
openssl rand -hex 32

# VAPID keys
npx web-push generate-vapid-keys
```

- [ ] **Step 4: Configure `vercel.json`**

```json
{
  "crons": [
    {
      "path": "/api/cron/daily",
      "schedule": "0 7 * * *"
    }
  ]
}
```

(7h UTC = 8h Paris en heure d'hiver, 9h en été — ajuster selon saison)

- [ ] **Step 5: Update `.gitignore`**

Add to `.gitignore`:
```
.env.local
.superpowers/
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js project with dependencies"
```

---

## Task 2: Design System + Global Layout

**Files:**
- Create/Modify: `app/globals.css`, `app/layout.tsx`

- [ ] **Step 1: Write `app/globals.css`**

```css
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,700;0,800;1,400&family=DM+Mono:wght@400;500&display=swap');

:root {
  --navy:    #0D1B2A;
  --orange:  #F97316;
  --green:   #22C55E;
  --red:     #EF4444;
  --bg:      #F6F7F9;
  --surface: #FFFFFF;
  --border:  #F0F1F3;
  --text:    #0D1B2A;
  --text-2:  #A0A8B4;
  --radius:  16px;
  --radius-sm: 8px;
  --nav-h:   64px;
  --sidebar-w: 240px;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
html { font-family: 'DM Sans', sans-serif; }
body { background: var(--bg); color: var(--text); }
```

- [ ] **Step 2: Write `app/layout.tsx`**

```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Médiathèques Strasbourg',
  description: 'Mes prêts et réservations',
  manifest: '/manifest.json',
  themeColor: '#0D1B2A',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "feat: design system tokens and root layout"
```

---

## Task 3: Supabase Schema + Auth

**Files:**
- Create: `lib/supabase-browser.ts`, `lib/supabase-server.ts`, `middleware.ts`
- Create: `app/(auth)/login/page.tsx`

- [ ] **Step 1: Create Supabase tables**

Run in Supabase SQL editor (Dashboard → SQL Editor):

```sql
-- Iguana session cookies (encrypted)
create table iguana_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  instance_ci_enc text not null,
  instance_st_enc text not null,
  updated_at timestamptz default now()
);
alter table iguana_sessions enable row level security;
create policy "own_session" on iguana_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Web Push subscriptions
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz default now()
);
alter table push_subscriptions enable row level security;
create policy "own_push" on push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Wishlist (V3, created now for schema completeness)
create table wishlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null check (type in ('ps5', 'film', 'bd')),
  title text not null,
  external_id text,
  thumbnail_url text,
  created_at timestamptz default now()
);
alter table wishlists enable row level security;
create policy "own_wishlist" on wishlists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 2: Write `lib/supabase-browser.ts`**

```typescript
import { createBrowserClient } from '@supabase/ssr'

let client: ReturnType<typeof createBrowserClient> | null = null

export function getSupabaseBrowser() {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
  }
  return client
}
```

- [ ] **Step 3: Write `lib/supabase-server.ts`**

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function getSupabaseServer() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        ),
      },
    }
  )
}

export function getSupabaseAdmin() {
  const { createClient } = require('@supabase/supabase-js')
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
```

- [ ] **Step 4: Write `middleware.ts`**

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        ),
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const isAuthRoute = request.nextUrl.pathname.startsWith('/login')
  const isApiRoute = request.nextUrl.pathname.startsWith('/api')

  if (!user && !isAuthRoute && !isApiRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (user && isAuthRoute) {
    return NextResponse.redirect(new URL('/compte', request.url))
  }
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js).*)'],
}
```

- [ ] **Step 5: Write `app/(auth)/login/page.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const sb = getSupabaseBrowser()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const fn = mode === 'login'
      ? sb.auth.signInWithPassword({ email, password })
      : sb.auth.signUp({ email, password })

    const { error } = await fn
    if (error) { setError(error.message); setLoading(false); return }
    router.push('/compte')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'var(--bg)' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '32px', width: '100%', maxWidth: '380px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '10px', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}>
          Médiathèques · Strasbourg
        </div>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--navy)', marginBottom: '24px', letterSpacing: '-0.4px' }}>
          {mode === 'login' ? 'Connexion' : 'Créer un compte'}
        </h1>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="Email" required
            style={{ padding: '12px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '14px', fontFamily: 'DM Sans, sans-serif', outline: 'none' }}
          />
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Mot de passe" required
            style={{ padding: '12px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '14px', fontFamily: 'DM Sans, sans-serif', outline: 'none' }}
          />
          {error && <div style={{ fontSize: '13px', color: 'var(--red)' }}>{error}</div>}
          <button type="submit" disabled={loading}
            style={{ padding: '13px', background: 'var(--navy)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '14px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, fontFamily: 'DM Sans, sans-serif' }}>
            {loading ? '…' : mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
          </button>
        </form>

        <button onClick={() => setMode(m => m === 'login' ? 'signup' : 'login')}
          style={{ marginTop: '16px', background: 'none', border: 'none', color: 'var(--text-2)', fontSize: '13px', cursor: 'pointer', width: '100%', fontFamily: 'DM Sans, sans-serif' }}>
          {mode === 'login' ? "Pas encore de compte ? Créer un compte" : 'Déjà un compte ? Se connecter'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Verify auth flow**

```bash
npm run dev
```

Open http://localhost:3000 — should redirect to /login. Create an account in Supabase dashboard or via the form. Verify redirect to /compte after login.

- [ ] **Step 7: Commit**

```bash
git add lib/supabase-browser.ts lib/supabase-server.ts middleware.ts app/\(auth\)/
git commit -m "feat: Supabase schema, auth middleware, login page"
```

---

## Task 4: App Shell + Navigation

**Files:**
- Create: `components/NavBottom.tsx`, `components/NavSidebar.tsx`
- Create: `app/(app)/layout.tsx`, `app/(app)/catalogue/page.tsx`, `app/(app)/envies/page.tsx`

- [ ] **Step 1: Write `components/NavBottom.tsx`**

```tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/compte',   icon: '👤', label: 'Compte' },
  { href: '/catalogue', icon: '🔍', label: 'Catalogue' },
  { href: '/envies',   icon: '⭐', label: 'Envies' },
]

export default function NavBottom() {
  const path = usePathname()
  return (
    <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: 'var(--nav-h)', background: 'var(--surface)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-around', alignItems: 'center', zIndex: 100 }}>
      {TABS.map(tab => {
        const active = path.startsWith(tab.href)
        return (
          <Link key={tab.href} href={tab.href} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', textDecoration: 'none', flex: 1 }}>
            <span style={{ fontSize: '20px', opacity: active ? 1 : 0.22 }}>{tab.icon}</span>
            <span style={{ fontSize: '9px', fontWeight: active ? 800 : 500, color: active ? 'var(--navy)' : 'var(--text-2)', fontFamily: 'DM Sans, sans-serif' }}>{tab.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 2: Write `components/NavSidebar.tsx`**

```tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/compte',    icon: '👤', label: 'Mon compte' },
  { href: '/catalogue', icon: '🔍', label: 'Catalogue' },
  { href: '/envies',    icon: '⭐', label: 'Mes envies' },
]

export default function NavSidebar() {
  const path = usePathname()
  return (
    <nav style={{ width: 'var(--sidebar-w)', minHeight: '100vh', background: 'var(--surface)', borderRight: '1px solid var(--border)', padding: '32px 16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '10px', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '24px', paddingLeft: '12px' }}>
        Médiathèques
      </div>
      {TABS.map(tab => {
        const active = path.startsWith(tab.href)
        return (
          <Link key={tab.href} href={tab.href}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: active ? 'var(--bg)' : 'transparent', textDecoration: 'none', transition: 'background 0.15s' }}>
            <span style={{ fontSize: '16px', opacity: active ? 1 : 0.4 }}>{tab.icon}</span>
            <span style={{ fontSize: '13px', fontWeight: active ? 700 : 400, color: active ? 'var(--navy)' : 'var(--text-2)' }}>{tab.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 3: Write `app/(app)/layout.tsx`**

```tsx
import NavBottom from '@/components/NavBottom'
import NavSidebar from '@/components/NavSidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <div style={{ display: 'none' }} className="sidebar-wrapper">
        <NavSidebar />
      </div>
      <main style={{ flex: 1, paddingBottom: 'var(--nav-h)', minWidth: 0 }}>
        {children}
      </main>
      <div className="bottom-nav-wrapper">
        <NavBottom />
      </div>
      <style>{`
        @media (min-width: 768px) {
          .sidebar-wrapper { display: block !important; }
          .bottom-nav-wrapper { display: none; }
          main { padding-bottom: 0 !important; }
        }
      `}</style>
    </div>
  )
}
```

- [ ] **Step 4: Write placeholder pages**

`app/(app)/catalogue/page.tsx`:
```tsx
export default function CataloguePage() {
  return (
    <div style={{ padding: '24px', color: 'var(--text-2)', fontFamily: 'DM Mono, monospace', fontSize: '12px' }}>
      Catalogue — disponible bientôt
    </div>
  )
}
```

`app/(app)/envies/page.tsx`:
```tsx
export default function EnviesPage() {
  return (
    <div style={{ padding: '24px', color: 'var(--text-2)', fontFamily: 'DM Mono, monospace', fontSize: '12px' }}>
      Mes envies — disponible bientôt
    </div>
  )
}
```

- [ ] **Step 5: Verify navigation**

```bash
npm run dev
```

Log in → verify 3 tabs appear at bottom on mobile viewport, sidebar on desktop (resize to ≥768px).

- [ ] **Step 6: Commit**

```bash
git add components/ app/\(app\)/
git commit -m "feat: app shell with responsive bottom nav and desktop sidebar"
```

---

## Task 5: Crypto + Iguana Library

**Files:**
- Create: `lib/crypto.ts`, `lib/iguana.ts`

- [ ] **Step 1: Write `lib/crypto.ts`**

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex')
const ALG = 'aes-256-gcm'

export function encrypt(text: string): string {
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALG, KEY, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decrypt(text: string): string {
  const [ivHex, tagHex, encHex] = text.split(':')
  const decipher = createDecipheriv(ALG, KEY, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([
    decipher.update(Buffer.from(encHex, 'hex')),
    decipher.final(),
  ]).toString('utf8')
}
```

- [ ] **Step 2: Write `lib/iguana.ts`**

```typescript
export type IguanaBooking = {
  Id: string
  Title: string
  Author: string | null
  ThumbnailUrl: string
  DefaultThumbnailUrl: string
  TypeOfDocument: string
  IsAvailable: boolean
  AvailabilityDate: string | null
  AvailableUntilDate: string | null
  BookingDate: string
  Rank: string
  RankSort: number
  LocationLabel: string
  CanCancel: boolean
  TitleLink: string
  Cote: string
}

export type IguanaLoan = {
  Title: string
  Author: string | null
  ThumbnailUrl: string
  DefaultThumbnailUrl: string
  TypeOfDocument: string
  Location: string
  WhenBack: string | null
  State: string
  HoldingId: string
}

export type IguanaCookies = { ci: string; st: string }

// Iguana dates look like "/Date(1781733600000+0200)/"
export function parseIguanaDate(raw: string | null): Date | null {
  if (!raw) return null
  const m = raw.match(/\/Date\((\d+)/)
  return m ? new Date(parseInt(m[1])) : null
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export function getDaysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000)
}

const BASE = 'https://www.mediatheques.strasbourg.eu'

async function iguanaGet(path: string, cookies: IguanaCookies) {
  const t = Date.now()
  const url = `${BASE}/Portal/Services/UserAccountService.svc/${path}?serviceCode=IGUANA_2&token=${t}&userUniqueIdentifier=&timestamp=${t}`
  const res = await fetch(url, {
    headers: {
      Cookie: `InstanceCI=CUSB=${cookies.ci}; InstanceST=CUSB=${cookies.st}`,
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json, text/javascript, */*; q=0.01',
    },
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`Iguana HTTP ${res.status}`)
  const json = await res.json()
  if (!json.success) throw new Error('Iguana returned success:false')
  return json.d
}

export async function fetchLoans(cookies: IguanaCookies): Promise<IguanaLoan[]> {
  const d = await iguanaGet('ListLoans', cookies)
  return d.Loans as IguanaLoan[]
}

export async function fetchBookings(cookies: IguanaCookies): Promise<IguanaBooking[]> {
  const d = await iguanaGet('ListBookings', cookies)
  return d.Bookings as IguanaBooking[]
}

export function sortBookings(bookings: IguanaBooking[]): IguanaBooking[] {
  return [...bookings].sort((a, b) => {
    const aUrgent = a.IsAvailable && isExpiring(a, 1)
    const bUrgent = b.IsAvailable && isExpiring(b, 1)
    if (aUrgent && !bUrgent) return -1
    if (bUrgent && !aUrgent) return 1
    if (a.IsAvailable && !b.IsAvailable) return -1
    if (b.IsAvailable && !a.IsAvailable) return 1
    return a.RankSort - b.RankSort
  })
}

function isExpiring(b: IguanaBooking, days: number): boolean {
  const d = parseIguanaDate(b.AvailableUntilDate)
  return d ? getDaysUntil(d) <= days : false
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/crypto.ts lib/iguana.ts
git commit -m "feat: AES-256-GCM crypto helper and Iguana API client"
```

---

## Task 6: Iguana API Routes + Cookie Onboarding

**Files:**
- Create: `app/api/iguana/loans/route.ts`, `app/api/iguana/bookings/route.ts`
- Create: `app/api/iguana/session/route.ts`
- Create: `app/(app)/compte/onboarding/page.tsx`

- [ ] **Step 1: Write `app/api/iguana/session/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'
import { encrypt } from '@/lib/crypto'
import { fetchBookings } from '@/lib/iguana'

export async function POST(req: NextRequest) {
  const sb = getSupabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ci, st } = await req.json() as { ci: string; st: string }
  if (!ci || !st) return NextResponse.json({ error: 'Missing ci or st' }, { status: 400 })

  // Verify the cookies actually work before saving
  try {
    await fetchBookings({ ci, st })
  } catch {
    return NextResponse.json({ error: 'Cookies invalides — vérifie les valeurs copiées' }, { status: 400 })
  }

  const { error } = await sb.from('iguana_sessions').upsert({
    user_id: user.id,
    instance_ci_enc: encrypt(ci),
    instance_st_enc: encrypt(st),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Write shared cookie getter `lib/get-iguana-cookies.ts`**

```typescript
import { getSupabaseServer } from '@/lib/supabase-server'
import { decrypt } from '@/lib/crypto'
import type { IguanaCookies } from '@/lib/iguana'

export async function getIguanaCookies(): Promise<IguanaCookies | null> {
  const sb = getSupabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null

  const { data } = await sb
    .from('iguana_sessions')
    .select('instance_ci_enc, instance_st_enc')
    .eq('user_id', user.id)
    .single()

  if (!data) return null
  return {
    ci: decrypt(data.instance_ci_enc),
    st: decrypt(data.instance_st_enc),
  }
}
```

- [ ] **Step 3: Write `app/api/iguana/loans/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { fetchLoans } from '@/lib/iguana'
import { getIguanaCookies } from '@/lib/get-iguana-cookies'

export async function GET() {
  const cookies = await getIguanaCookies()
  if (!cookies) return NextResponse.json({ error: 'No session' }, { status: 401 })
  try {
    const loans = await fetchLoans(cookies)
    return NextResponse.json(loans)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 })
  }
}
```

- [ ] **Step 4: Write `app/api/iguana/bookings/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { fetchBookings } from '@/lib/iguana'
import { getIguanaCookies } from '@/lib/get-iguana-cookies'

export async function GET() {
  const cookies = await getIguanaCookies()
  if (!cookies) return NextResponse.json({ error: 'No session' }, { status: 401 })
  try {
    const bookings = await fetchBookings(cookies)
    return NextResponse.json(bookings)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 })
  }
}
```

- [ ] **Step 5: Write `app/(app)/compte/onboarding/page.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function OnboardingPage() {
  const [ci, setCi] = useState('')
  const [st, setSt] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'ok'>('idle')
  const [error, setError] = useState('')
  const router = useRouter()

  async function save() {
    setStatus('loading')
    const res = await fetch('/api/iguana/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ci, st }),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error); setStatus('error'); return }
    setStatus('ok')
    setTimeout(() => router.push('/compte'), 1200)
  }

  return (
    <div style={{ padding: '24px', maxWidth: '480px', margin: '0 auto' }}>
      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '9px', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '8px' }}>
        Configuration
      </div>
      <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--navy)', marginBottom: '8px', letterSpacing: '-0.4px' }}>
        Connecte ta médiathèque
      </h1>
      <p style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.6, marginBottom: '24px' }}>
        L'app a besoin de tes cookies de session pour accéder à ton compte médiathèque. Suis ces étapes une seule fois.
      </p>

      <ol style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 2, paddingLeft: '20px', marginBottom: '24px' }}>
        <li>Ouvre <strong>mediatheques.strasbourg.eu</strong> dans Chrome et connecte-toi</li>
        <li>Appuie sur <strong>F12</strong> → onglet <strong>Application</strong> → <strong>Cookies</strong></li>
        <li>Clique sur <code style={{ background: 'var(--bg)', padding: '1px 6px', borderRadius: '4px', fontFamily: 'DM Mono, monospace' }}>www.mediatheques.strasbourg.eu</code></li>
        <li>Copie la valeur de <strong>InstanceCI</strong> (tout après <code style={{ fontFamily: 'DM Mono, monospace' }}>CUSB=</code>)</li>
        <li>Copie la valeur de <strong>InstanceST</strong> (tout après <code style={{ fontFamily: 'DM Mono, monospace' }}>CUSB=</code>)</li>
      </ol>

      {[
        { label: 'InstanceCI (après CUSB=)', val: ci, set: setCi, ph: 'u4BXc95FUnYvOd1H3vbJ…' },
        { label: 'InstanceST (après CUSB=)', val: st, set: setSt, ph: '10040aFfRE9Jon65VZk…' },
      ].map(f => (
        <div key={f.label} style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--navy)', marginBottom: '6px' }}>{f.label}</div>
          <input
            value={f.val} onChange={e => f.set(e.target.value)}
            placeholder={f.ph}
            style={{ width: '100%', padding: '11px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '12px', fontFamily: 'DM Mono, monospace', outline: 'none' }}
          />
        </div>
      ))}

      {status === 'error' && <div style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '12px' }}>{error}</div>}
      {status === 'ok' && <div style={{ fontSize: '13px', color: 'var(--green)', marginBottom: '12px' }}>✓ Connexion vérifiée</div>}

      <button
        onClick={save}
        disabled={!ci || !st || status === 'loading'}
        style={{ width: '100%', padding: '13px', background: 'var(--navy)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', opacity: (!ci || !st) ? 0.5 : 1 }}>
        {status === 'loading' ? 'Vérification…' : 'Enregistrer'}
      </button>
    </div>
  )
}
```

- [ ] **Step 6: Test API routes manually**

```bash
npm run dev
# After logging in, in browser console:
fetch('/api/iguana/bookings').then(r => r.json()).then(console.log)
# Expected: { error: 'No session' } — until onboarding is completed
```

- [ ] **Step 7: Commit**

```bash
git add app/api/iguana/ lib/get-iguana-cookies.ts app/\(app\)/compte/onboarding/
git commit -m "feat: Iguana API proxy routes and cookie onboarding wizard"
```

---

## Task 7: Mon Compte Screen + Components

**Files:**
- Create: `components/StatusBadge.tsx`, `components/BookingCard.tsx`, `components/LoanCard.tsx`
- Create: `app/(app)/compte/page.tsx`

- [ ] **Step 1: Write `components/StatusBadge.tsx`**

```tsx
type Variant = 'red' | 'green' | 'gray'

const STYLES: Record<Variant, { bg: string; color: string }> = {
  red:   { bg: '#EF4444', color: 'white' },
  green: { bg: '#22C55E', color: 'white' },
  gray:  { bg: '#E2E8F0', color: '#64748B' },
}

export default function StatusBadge({ variant, label }: { variant: Variant; label: string }) {
  const s = STYLES[variant]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: '9px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: s.bg, color: s.color, letterSpacing: '0.01em', fontFamily: 'DM Sans, sans-serif' }}>
      {label}
    </span>
  )
}
```

- [ ] **Step 2: Write `components/BookingCard.tsx`**

```tsx
import StatusBadge from './StatusBadge'
import { parseIguanaDate, formatDate, getDaysUntil, type IguanaBooking } from '@/lib/iguana'

export default function BookingCard({ b }: { b: IguanaBooking }) {
  const until = parseIguanaDate(b.AvailableUntilDate)
  const daysLeft = until ? getDaysUntil(until) : null

  let variant: 'red' | 'green' | 'gray' = 'gray'
  let badgeLabel = `Rang ${b.Rank} dans la file`

  if (b.IsAvailable) {
    variant = daysLeft !== null && daysLeft <= 1 ? 'red' : 'green'
    badgeLabel = daysLeft !== null && daysLeft <= 0 ? 'Expire aujourd\'hui' : 'À récupérer'
  } else if (b.Rank === 'Disponible') {
    variant = 'green'
    badgeLabel = 'À récupérer'
  }

  const showDate = b.IsAvailable && until && daysLeft !== null && daysLeft > 0

  return (
    <a href={b.TitleLink} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: 'var(--radius)', background: 'var(--surface)', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', textDecoration: 'none' }}>
      <img
        src={b.ThumbnailUrl}
        onError={(e) => { (e.target as HTMLImageElement).src = b.DefaultThumbnailUrl }}
        style={{ width: '44px', height: '63px', borderRadius: '6px', objectFit: 'cover', background: 'var(--bg)', flexShrink: 0 }}
        alt=""
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.2px' }}>
          {b.Title}
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-2)', marginTop: '2px' }}>
          {b.TypeOfDocument} · {b.LocationLabel}
        </div>
        <div style={{ marginTop: '7px' }}>
          <StatusBadge variant={variant} label={badgeLabel} />
        </div>
        {showDate && (
          <div style={{ fontSize: '9.5px', color: '#16A34A', fontWeight: 500, marginTop: '3px' }}>
            Disponible jusqu'au {formatDate(until!)}
          </div>
        )}
      </div>
    </a>
  )
}
```

- [ ] **Step 3: Write `components/LoanCard.tsx`**

```tsx
import StatusBadge from './StatusBadge'
import { parseIguanaDate, formatDate, getDaysUntil, type IguanaLoan } from '@/lib/iguana'

export default function LoanCard({ l }: { l: IguanaLoan }) {
  const dueDate = parseIguanaDate(l.WhenBack)
  const daysLeft = dueDate ? getDaysUntil(dueDate) : null

  let variant: 'red' | 'green' | 'gray' = 'green'
  let label = dueDate ? `À rendre le ${formatDate(dueDate)}` : 'En cours'
  if (daysLeft !== null && daysLeft <= 2) { variant = 'red'; label = daysLeft <= 0 ? 'En retard' : `À rendre dans ${daysLeft}j` }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: 'var(--radius)', background: 'var(--surface)', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
      <img
        src={l.ThumbnailUrl}
        onError={(e) => { (e.target as HTMLImageElement).src = l.DefaultThumbnailUrl }}
        style={{ width: '44px', height: '63px', borderRadius: '6px', objectFit: 'cover', background: 'var(--bg)', flexShrink: 0 }}
        alt=""
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.2px' }}>
          {l.Title}
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-2)', marginTop: '2px' }}>
          {l.TypeOfDocument} · {l.Location}
        </div>
        <div style={{ marginTop: '7px' }}>
          <StatusBadge variant={variant} label={label} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Write `app/(app)/compte/page.tsx`**

```tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import BookingCard from '@/components/BookingCard'
import LoanCard from '@/components/LoanCard'
import { sortBookings, type IguanaBooking, type IguanaLoan } from '@/lib/iguana'

type Tab = 'reservations' | 'prets'

export default function ComptePage() {
  const [tab, setTab] = useState<Tab>('reservations')
  const [bookings, setBookings] = useState<IguanaBooking[]>([])
  const [loans, setLoans] = useState<IguanaLoan[]>([])
  const [loading, setLoading] = useState(true)
  const [noSession, setNoSession] = useState(false)
  const router = useRouter()

  useEffect(() => {
    Promise.all([
      fetch('/api/iguana/bookings').then(r => r.json()),
      fetch('/api/iguana/loans').then(r => r.json()),
    ]).then(([b, l]) => {
      if (b.error === 'No session') { setNoSession(true); setLoading(false); return }
      setBookings(Array.isArray(b) ? sortBookings(b) : [])
      setLoans(Array.isArray(l) ? l : [])
      setLoading(false)
    })
  }, [])

  const now = new Date()
  const dateStr = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const dateLabel = dateStr.charAt(0).toUpperCase() + dateStr.slice(1)

  if (noSession) {
    return (
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '16px', textAlign: 'center' }}>
        <div style={{ fontSize: '32px' }}>📚</div>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--navy)' }}>Connecte ta médiathèque</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-2)', maxWidth: '280px', lineHeight: 1.6 }}>
          Configure ta session une seule fois pour voir tes prêts et réservations.
        </p>
        <button onClick={() => router.push('/compte/onboarding')}
          style={{ padding: '12px 24px', background: 'var(--navy)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
          Configurer
        </button>
      </div>
    )
  }

  const items = tab === 'reservations' ? bookings : loans

  return (
    <div>
      <div style={{ background: 'var(--surface)', padding: '20px 18px 0', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: '10px', fontWeight: 500, color: 'var(--text-2)' }}>{dateLabel}</div>
        <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--navy)', marginTop: '2px', letterSpacing: '-0.5px' }}>Bonjour, Paul</div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
          {([['reservations', `Réservations (${bookings.length})`], ['prets', `Prêts (${loans.length})`]] as const).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              style={{ fontSize: '10.5px', fontWeight: 600, padding: '5px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', background: tab === t ? 'var(--navy)' : '#F0F1F3', color: tab === t ? 'white' : '#8A93A2', transition: 'all 0.15s' }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '9px' }}>
        {loading && <div style={{ color: 'var(--text-2)', fontSize: '13px', textAlign: 'center', paddingTop: '40px' }}>Chargement…</div>}
        {!loading && items.length === 0 && (
          <div style={{ color: 'var(--text-2)', fontSize: '13px', textAlign: 'center', paddingTop: '40px' }}>
            Aucun {tab === 'reservations' ? 'réservation' : 'prêt'} en cours
          </div>
        )}
        {!loading && tab === 'reservations' && bookings.map(b => <BookingCard key={b.Id} b={b} />)}
        {!loading && tab === 'prets' && loans.map((l, i) => <LoanCard key={i} l={l} />)}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Verify full Mon Compte flow**

```bash
npm run dev
```

1. Login → redirect to /compte
2. Click "Configurer" → /compte/onboarding
3. Paste InstanceCI and InstanceST values (from Chrome DevTools → Application → Cookies)
4. Click "Enregistrer" → verify "Connexion vérifiée" → redirect to /compte
5. Verify bookings appear with covers, badges, and dates

- [ ] **Step 6: Commit**

```bash
git add components/StatusBadge.tsx components/BookingCard.tsx components/LoanCard.tsx app/\(app\)/compte/page.tsx
git commit -m "feat: Mon Compte screen with loan and booking cards"
```

---

## Task 8: PWA + Web Push Notifications

**Files:**
- Create: `public/manifest.json`, `public/sw.js`
- Create: `app/api/push/subscribe/route.ts`, `app/api/push/send/route.ts`
- Create: `app/api/cron/daily/route.ts`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Write `public/manifest.json`**

```json
{
  "name": "Médiathèques Strasbourg",
  "short_name": "Médiathèques",
  "description": "Mes prêts et réservations",
  "start_url": "/compte",
  "display": "standalone",
  "background_color": "#F6F7F9",
  "theme_color": "#0D1B2A",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Create placeholder icons (192×192 and 512×512 PNG) — any image works for now, replace with real icons before shipping.

- [ ] **Step 2: Write `public/sw.js`**

```javascript
const CACHE = 'mediatheques-v1'

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/compte', '/login'])))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ))
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('/compte')))
  }
})

self.addEventListener('push', e => {
  const data = e.data?.json() ?? {}
  e.waitUntil(self.registration.showNotification(data.title ?? 'Médiathèques', {
    body: data.body ?? '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url ?? '/compte' },
  }))
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(clients.openWindow(e.notification.data.url))
})
```

- [ ] **Step 3: Register service worker in `app/layout.tsx`**

Add before `</body>`:
```tsx
<script dangerouslySetInnerHTML={{ __html: `
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'))
  }
` }} />
```

- [ ] **Step 4: Write `app/api/push/subscribe/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const sb = getSupabaseServer()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sub = await req.json() as PushSubscriptionJSON
  if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  }

  await sb.from('push_subscriptions').upsert({
    user_id: user.id,
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth_key: sub.keys.auth,
  }, { onConflict: 'endpoint' })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Write `app/api/push/send/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
)

export type PushPayload = { title: string; body: string; url?: string }

export async function sendPush(endpoint: string, p256dh: string, auth: string, payload: PushPayload) {
  return webpush.sendNotification(
    { endpoint, keys: { p256dh, auth } },
    JSON.stringify(payload),
  )
}

export async function POST(req: NextRequest) {
  // Internal route — not called by client directly, called by cron
  return NextResponse.json({ error: 'Use cron route' }, { status: 405 })
}
```

- [ ] **Step 6: Write `app/api/cron/daily/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { decrypt } from '@/lib/crypto'
import { fetchBookings, fetchLoans, parseIguanaDate, getDaysUntil } from '@/lib/iguana'
import { sendPush } from '../push/send/route'

export async function GET(req: NextRequest) {
  // Verify cron secret
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()

  // Get all users with Iguana sessions
  const { data: sessions } = await sb
    .from('iguana_sessions')
    .select('user_id, instance_ci_enc, instance_st_enc')

  if (!sessions?.length) return NextResponse.json({ processed: 0 })

  let notified = 0

  for (const session of sessions) {
    try {
      const cookies = {
        ci: decrypt(session.instance_ci_enc),
        st: decrypt(session.instance_st_enc),
      }

      const [bookings, loans] = await Promise.all([
        fetchBookings(cookies),
        fetchLoans(cookies),
      ])

      const messages: Array<{ title: string; body: string; url?: string }> = []

      // Check bookings
      for (const b of bookings) {
        if (!b.IsAvailable) continue
        const until = parseIguanaDate(b.AvailableUntilDate)
        if (!until) continue
        const days = getDaysUntil(until)
        if (days < 0) continue
        if (days === 0) messages.push({ title: '⚠️ Dernier jour !', body: `${b.Title} — à récupérer aujourd'hui à ${b.LocationLabel}`, url: '/compte' })
        else if (days === 1) messages.push({ title: '📗 À récupérer demain', body: `${b.Title} — ${b.LocationLabel}`, url: '/compte' })
        else if (!b.IsAvailable) {} // newly available check omitted (needs state tracking)
      }

      // Check loans due soon
      for (const l of loans) {
        const due = parseIguanaDate(l.WhenBack)
        if (!due) continue
        const days = getDaysUntil(due)
        if (days === 2) messages.push({ title: '📅 À rendre bientôt', body: `${l.Title} — dans 2 jours`, url: '/compte' })
        if (days < 0) messages.push({ title: '⚠️ En retard', body: `${l.Title} — à rendre dès que possible`, url: '/compte' })
      }

      if (!messages.length) continue

      // Get user's push subscriptions
      const { data: subs } = await sb
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth_key')
        .eq('user_id', session.user_id)

      if (!subs?.length) continue

      for (const msg of messages) {
        for (const sub of subs) {
          try {
            await sendPush(sub.endpoint, sub.p256dh, sub.auth_key, msg)
            notified++
          } catch (e) {
            // Subscription expired — clean up
            if ((e as any).statusCode === 410) {
              await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
            }
          }
        }
      }
    } catch (e) {
      console.error(`Failed for user ${session.user_id}:`, e)
    }
  }

  return NextResponse.json({ processed: sessions.length, notified })
}
```

- [ ] **Step 7: Add push subscription prompt to Mon Compte**

Add to `app/(app)/compte/page.tsx`, inside the `useEffect` after data loads:

```typescript
// Request push permission after data loads
if ('Notification' in window && Notification.permission === 'default' && 'serviceWorker' in navigator) {
  Notification.requestPermission().then(async perm => {
    if (perm !== 'granted') return
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    })
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub.toJSON()),
    })
  })
}
```

Add `NEXT_PUBLIC_VAPID_PUBLIC_KEY` to `.env.local` (same value as `VAPID_PUBLIC_KEY`).

- [ ] **Step 8: Commit**

```bash
git add public/ app/api/push/ app/api/cron/ app/layout.tsx
git commit -m "feat: PWA manifest, service worker, Web Push, daily cron"
```

---

## Task 9: Deploy to Vercel

- [ ] **Step 1: Push to GitHub**

```bash
gh repo create mediatheques-strasbourg --private --source=. --push
```

(Install GitHub CLI if needed: `brew install gh`)

- [ ] **Step 2: Import on Vercel**

1. Go to vercel.com → New Project → Import from GitHub → `mediatheques-strasbourg`
2. Framework: Next.js (auto-detected)
3. Add all env vars from `.env.local`
4. Deploy

- [ ] **Step 3: Verify deployment**

- Open production URL → login → configure cookies → verify bookings appear
- On iPhone: Safari → production URL → Share → "Sur l'écran d'accueil"
- Open from home screen → verify PWA mode (no browser chrome)
- Navigate to /compte → verify push permission prompt appears

- [ ] **Step 4: Test cron manually**

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-app.vercel.app/api/cron/daily
# Expected: {"processed":1,"notified":0} (or >0 if docs are due)
```

- [ ] **Step 5: Verify cron in Vercel dashboard**

Vercel Dashboard → Project → Settings → Cron Jobs → verify `0 7 * * *` appears.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: production deploy configuration"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Multi-user (Supabase Auth)
- ✅ Iguana ListBookings + ListLoans proxied
- ✅ Cookies chiffrés AES-256-GCM en Supabase
- ✅ Design B App Native (DM Sans, navy/orange/green/red, nav order)
- ✅ Responsive (bottom nav mobile, sidebar desktop)
- ✅ Onboarding cookie wizard
- ✅ Statut sorted: urgent > disponible > en attente par rang
- ✅ Dates affichées ("Disponible jusqu'au 3 juil.")
- ✅ PWA manifest + service worker
- ✅ Web Push (iOS 16.4+)
- ✅ Cron daily 8h
- ✅ 4 types de notifications
- ✅ Wishlist table créée (shell pour V3)
- ✅ Catalogue + Envies placeholders
- ❌ Icônes PNG manquantes — à créer manuellement (192×192 + 512×512)
- ❌ "Bonjour, Paul" hardcodé — devrait utiliser `user.email.split('@')[0]` ou un champ `display_name` Supabase

**Fix hardcoded name** — dans `compte/page.tsx`, remplacer `'Bonjour, Paul'` par l'email de l'utilisateur connecté (récupéré via `getSupabaseBrowser().auth.getUser()`).

---

**Plan complete.**
