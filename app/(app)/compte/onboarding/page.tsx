'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function OnboardingPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'ok'>('idle')
  const [error, setError] = useState('')
  const router = useRouter()

  async function save() {
    setStatus('loading')
    setError('')
    const res = await fetch('/api/iguana/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error ?? 'Erreur inconnue'); setStatus('error'); return }
    setStatus('ok')
    setTimeout(() => router.push('/compte'), 1200)
  }

  return (
    <div style={{ padding: '24px', maxWidth: '480px', margin: '0 auto' }}>
      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '9px', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '8px' }}>
        Configuration
      </div>
      <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--color-heading)', marginBottom: '8px', letterSpacing: '-0.4px' }}>
        Connecte ta médiathèque
      </h1>
      <p style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.7, marginBottom: '28px' }}>
        Tes identifiants MonStrasbourg — les mêmes que sur le site de la médiathèque.
        L&apos;app se reconnectera automatiquement, tu n&apos;auras plus rien à faire.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-heading)', display: 'block', marginBottom: '6px' }}>
            Email MonStrasbourg
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="prenom.nom@exemple.fr"
            autoComplete="email"
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
        <div style={{ fontSize: '13px', color: 'var(--red)', padding: '10px 14px', background: 'var(--error-bg)', borderRadius: 'var(--radius-sm)', marginBottom: '12px' }}>
          {error}
        </div>
      )}
      {status === 'ok' && (
        <div style={{ fontSize: '13px', color: 'var(--green)', padding: '10px 14px', background: 'var(--success-bg)', borderRadius: 'var(--radius-sm)', marginBottom: '12px' }}>
          Connexion réussie — redirection…
        </div>
      )}

      <button
        onClick={save}
        disabled={!email || !password || status === 'loading' || status === 'ok'}
        style={{
          width: '100%', padding: '13px',
          background: 'var(--navy)', color: 'white',
          border: 'none', borderRadius: 'var(--radius-sm)',
          fontSize: '14px', fontWeight: 700,
          cursor: (!email || !password) ? 'not-allowed' : 'pointer',
          opacity: (!email || !password) ? 0.45 : 1,
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
