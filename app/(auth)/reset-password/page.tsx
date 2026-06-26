'use client'
import { useState, useEffect } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const router = useRouter()
  const sb = getSupabaseBrowser()

  useEffect(() => {
    sb.auth.onAuthStateChange((event: string) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })
  }, [sb])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('Les mots de passe ne correspondent pas.'); return }
    if (password.length < 6) { setError('Minimum 6 caractères.'); return }
    setLoading(true)
    setError(null)
    const { error } = await sb.auth.updateUser({ password })
    setLoading(false)
    if (error) { setError(error.message); return }
    router.push('/compte')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'var(--bg)' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '32px', width: '100%', maxWidth: '380px', boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
        <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-2)', marginBottom: '8px' }}>
          Médiathèques · Strasbourg
        </div>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--color-heading)', marginBottom: '24px', letterSpacing: '-0.4px' }}>
          Nouveau mot de passe
        </h1>

        {!ready ? (
          <p style={{ fontSize: '14px', color: 'var(--text-2)', lineHeight: 1.5 }}>
            Lien invalide ou expiré. Retourne sur la page de connexion et refais une demande.
          </p>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Nouveau mot de passe" required autoComplete="new-password"
              style={{ padding: '12px 14px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', fontSize: '14px', fontFamily: 'DM Sans, sans-serif', outline: 'none', background: 'var(--bg)' }}
            />
            <input
              type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder="Confirmer le mot de passe" required autoComplete="new-password"
              style={{ padding: '12px 14px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', fontSize: '14px', fontFamily: 'DM Sans, sans-serif', outline: 'none', background: 'var(--bg)' }}
            />
            {error && (
              <div style={{ fontSize: '13px', color: 'var(--red)', padding: '8px 12px', background: 'var(--error-bg)', borderRadius: 'var(--radius-sm)' }}>
                {error}
              </div>
            )}
            <button type="submit" disabled={loading}
              style={{ padding: '13px', background: 'var(--navy)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '14px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, fontFamily: 'DM Sans, sans-serif', marginTop: '4px' }}>
              {loading ? '…' : 'Enregistrer'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
