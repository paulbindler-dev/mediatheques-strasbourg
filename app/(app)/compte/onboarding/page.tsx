'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function OnboardingPage() {
  const [card, setCard] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'ok'>('idle')
  const [error, setError] = useState('')
  const router = useRouter()

  async function save() {
    setStatus('loading')
    setError('')
    const trimmedCard = card.trim()
    const trimmedPwd = password.trim()

    // Step 1 — try Edge Runtime (Cloudflare IPs, bypasses Vercel/AWS rate-limiting)
    let ci = '', st = '', extra = '{}'
    let edgeOk = false
    try {
      const edgeRes = await fetch('/api/iguana/login-edge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card: trimmedCard, password: trimmedPwd }),
      })
      const edgeJson = await edgeRes.json() as { ci?: string; st?: string; extra?: string; error?: string }
      if (edgeRes.ok && edgeJson.ci && edgeJson.st) {
        ci = edgeJson.ci
        st = edgeJson.st
        extra = edgeJson.extra ?? '{}'
        edgeOk = true
      } else if (edgeJson.error?.includes('incorrect') || edgeJson.error?.includes('Incorrect')) {
        // Wrong credentials — no point trying serverless
        setError(edgeJson.error ?? 'Numéro de carte ou mot de passe incorrect')
        setStatus('error')
        return
      }
    } catch {
      // Network error on edge — fall through to serverless
    }

    if (edgeOk) {
      // Step 2 — store the session (serverless has crypto, Supabase)
      const storeRes = await fetch('/api/iguana/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'cookies', ci, st, extra, email: trimmedCard, password: trimmedPwd }),
      })
      const storeJson = await storeRes.json() as { error?: string }
      if (!storeRes.ok) {
        setError(storeJson.error ?? 'Erreur lors de l\'enregistrement')
        setStatus('error')
        return
      }
      setStatus('ok')
      setTimeout(() => router.push('/compte'), 1200)
      return
    }

    // Fallback — regular serverless login (same IPs, might be rate-limited)
    const res = await fetch('/api/iguana/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: trimmedCard, password: trimmedPwd }),
    })
    const json = await res.json() as { error?: string; rateLimited?: boolean }
    if (!res.ok) {
      setError(json.error ?? 'Erreur inconnue')
      setStatus('error')
      return
    }
    setStatus('ok')
    setTimeout(() => router.push('/compte'), 1200)
  }

  return (
    <div style={{ padding: '24px', maxWidth: '480px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--color-heading)', marginBottom: '8px', letterSpacing: '-0.4px' }}>
        Connecte ta médiathèque
      </h1>
      <p style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.7, marginBottom: '20px' }}>
        Tes identifiants de connexion à{' '}
        <a href="https://www.mediatheques.strasbourg.eu" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--navy)', fontWeight: 600 }}>
          mediatheques.strasbourg.eu
        </a>.
        L&apos;app se reconnectera automatiquement, tu n&apos;auras plus rien à faire.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-heading)', display: 'block', marginBottom: '6px' }}>
            Numéro de carte abonné
          </label>
          <input
            type="text"
            value={card}
            onChange={e => setCard(e.target.value)}
            placeholder="Exemple : 67000000215X"
            autoComplete="username"
            inputMode="text"
            style={{ width: '100%', padding: '11px 14px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', fontSize: '14px', outline: 'none', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'DM Sans, sans-serif' }}
          />
        </div>
        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-heading)', display: 'block', marginBottom: '6px' }}>
            Mot de passe
          </label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            style={{ width: '100%', padding: '11px 14px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', fontSize: '14px', outline: 'none', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'DM Sans, sans-serif' }}
          />
        </div>
      </div>

      {status === 'error' && (
        <div style={{ padding: '12px 14px', background: 'var(--error-bg)', borderRadius: 'var(--radius-sm)', marginBottom: '12px' }}>
          <div style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '6px' }}>{error}</div>
          <a href="https://www.mediatheques.strasbourg.eu" target="_blank" rel="noopener noreferrer"
            style={{ fontSize: '11px', color: 'var(--red)', fontWeight: 600, textDecoration: 'none' }}>
            → Vérifier mes identifiants sur le site de la médiathèque
          </a>
        </div>
      )}
      {status === 'ok' && (
        <div style={{ fontSize: '13px', color: 'var(--green)', padding: '10px 14px', background: 'var(--success-bg)', borderRadius: 'var(--radius-sm)', marginBottom: '12px' }}>
          Connexion réussie — redirection…
        </div>
      )}

      <button
        onClick={save}
        disabled={!card || !password || status === 'loading' || status === 'ok'}
        style={{
          width: '100%', padding: '13px',
          background: 'var(--navy)', color: 'white',
          border: 'none', borderRadius: 'var(--radius-sm)',
          fontSize: '14px', fontWeight: 700,
          cursor: (!card || !password) ? 'not-allowed' : 'pointer',
          opacity: (!card || !password) ? 0.45 : 1,
          fontFamily: 'DM Sans, sans-serif',
        }}
      >
        {status === 'loading' ? 'Connexion en cours…' : 'Se connecter'}
      </button>

      <div style={{ fontSize: '11px', color: 'var(--text-2)', textAlign: 'center', marginTop: '20px', lineHeight: 1.6 }}>
        Tes identifiants sont chiffrés (AES-256) côté serveur.
        <br />Ils ne sont jamais partagés ni revendus.
      </div>
    </div>
  )
}
