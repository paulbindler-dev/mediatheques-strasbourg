'use client'
import { useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

type Mode = 'login' | 'signup' | 'forgot'

function translateError(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('invalid login credentials') || m.includes('invalid email or password')) return 'Identifiants incorrects. Vérifie ton email et ton mot de passe.'
  if (m.includes('email not confirmed')) return 'Email non confirmé. Vérifie ta boîte mail.'
  if (m.includes('user already registered') || m.includes('already been registered')) return 'Un compte existe déjà avec cet email.'
  if (m.includes('password should be at least')) return 'Le mot de passe doit contenir au moins 6 caractères.'
  if (m.includes('unable to validate email') || m.includes('invalid format')) return 'Adresse email invalide.'
  if (m.includes('rate limit') || m.includes('too many requests')) return 'Trop de tentatives, réessaie dans quelques minutes.'
  if (m.includes('for security purposes')) return 'Pour des raisons de sécurité, attends quelques secondes avant de réessayer.'
  if (m.includes('network') || m.includes('fetch')) return 'Erreur réseau. Vérifie ta connexion.'
  return msg
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<Mode>('login')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const sb = getSupabaseBrowser()

  const [resetSent, setResetSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (mode === 'forgot') {
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset-password',
      })
      setLoading(false)
      if (error) { setError(error.message); return }
      setResetSent(true)
      return
    }

    const { error } = mode === 'login'
      ? await sb.auth.signInWithPassword({ email, password })
      : await sb.auth.signUp({ email, password })

    if (error) { setError(translateError(error.message)); setLoading(false); return }
    router.push('/compte')
    router.refresh()
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'var(--bg)' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '32px', width: '100%', maxWidth: '380px', boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
        <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-2)', marginBottom: '8px', letterSpacing: '-0.1px' }}>
          Médiathèques · Strasbourg
        </div>
        <h1 style={{ fontSize: '28px', fontWeight: 900, color: 'var(--color-heading)', marginBottom: '24px', letterSpacing: '-1.5px', lineHeight: 1, fontFamily: 'DM Sans, sans-serif' }}>
          {mode === 'login' ? 'Connexion' : mode === 'signup' ? 'Créer un compte' : 'Mot de passe oublié'}
        </h1>

        {resetSent ? (
          <div style={{ fontSize: '14px', color: 'var(--text)', lineHeight: 1.5, padding: '12px', background: 'var(--success-bg)', borderRadius: 'var(--radius-sm)' }}>
            Un email de réinitialisation a été envoyé à <strong>{email}</strong>. Vérifie ta boîte mail.
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="Email" required autoComplete="email"
              style={{ padding: '12px 14px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', fontSize: '14px', fontFamily: 'DM Sans, sans-serif', outline: 'none', background: 'var(--bg)' }}
            />
            {mode !== 'forgot' && (
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Mot de passe" required autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                style={{ padding: '12px 14px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', fontSize: '14px', fontFamily: 'DM Sans, sans-serif', outline: 'none', background: 'var(--bg)' }}
              />
            )}
            {error && (
              <div style={{ fontSize: '13px', color: 'var(--red)', padding: '8px 12px', background: 'var(--error-bg)', borderRadius: 'var(--radius-sm)' }}>
                {error}
              </div>
            )}
            <button type="submit" disabled={loading}
              style={{ padding: '13px', background: 'var(--navy)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '14px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, fontFamily: 'DM Sans, sans-serif', marginTop: '4px' }}>
              {loading ? '…' : mode === 'login' ? 'Se connecter' : mode === 'signup' ? 'Créer mon compte' : 'Envoyer le lien'}
            </button>
          </form>
        )}

        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {mode === 'login' && (
            <button onClick={() => { setMode('forgot'); setError(null); setResetSent(false) }}
              style={{ background: 'none', border: 'none', color: 'var(--text-2)', fontSize: '13px', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', textAlign: 'center' }}>
              Mot de passe oublié ?
            </button>
          )}
          <button onClick={() => { setMode(m => m === 'signup' ? 'login' : m === 'forgot' ? 'login' : 'signup'); setError(null); setResetSent(false) }}
            style={{ background: 'none', border: 'none', color: 'var(--text-2)', fontSize: '13px', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', textAlign: 'center' }}>
            {mode === 'login' ? 'Pas encore de compte ? Créer un compte' : 'Déjà un compte ? Se connecter'}
          </button>
        </div>
      </div>
    </div>
  )
}
