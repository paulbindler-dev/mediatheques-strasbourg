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
    setError('')
    const res = await fetch('/api/iguana/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ci: ci.trim(), st: st.trim() }),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error ?? 'Erreur inconnue'); setStatus('error'); return }
    setStatus('ok')
    setTimeout(() => router.push('/compte'), 1000)
  }

  const fields = [
    { label: 'InstanceCI (valeur après CUSB=)', val: ci, set: setCi, ph: 'u4BXc95FUnYvOd1H3vbJ…' },
    { label: 'InstanceST (valeur après CUSB=)', val: st, set: setSt, ph: '10040aFfRE9Jon65VZk…' },
  ] as const

  return (
    <div style={{ padding: '24px', maxWidth: '500px', margin: '0 auto' }}>
      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '9px', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '8px' }}>
        Configuration
      </div>
      <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--navy)', marginBottom: '8px', letterSpacing: '-0.4px' }}>
        Connecte ta médiathèque
      </h1>
      <p style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.7, marginBottom: '24px' }}>
        {"L'app a besoin de tes cookies de session pour accéder à ton compte. C'est une opération à faire une seule fois."}
      </p>

      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', padding: '20px', marginBottom: '24px', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--navy)', marginBottom: '12px' }}>Comment faire</div>
        <ol style={{ fontSize: '12.5px', color: 'var(--text)', lineHeight: 2, paddingLeft: '18px' }}>
          <li>Ouvre <strong>mediatheques.strasbourg.eu</strong> dans Chrome et connecte-toi</li>
          <li>Appuie sur <strong>F12</strong> → onglet <strong>Application</strong> → <strong>Cookies</strong></li>
          <li>Clique sur <code style={{ background: 'var(--bg)', padding: '1px 5px', borderRadius: '4px', fontFamily: 'DM Mono, monospace', fontSize: '11px' }}>www.mediatheques.strasbourg.eu</code></li>
          <li>Copie la valeur de <strong>InstanceCI</strong> (tout après <code style={{ fontFamily: 'DM Mono, monospace', fontSize: '11px' }}>CUSB=</code>)</li>
          <li>Copie la valeur de <strong>InstanceST</strong> (tout après <code style={{ fontFamily: 'DM Mono, monospace', fontSize: '11px' }}>CUSB=</code>)</li>
        </ol>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
        {fields.map(f => (
          <div key={f.label}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--navy)', marginBottom: '6px' }}>{f.label}</div>
            <input
              value={f.val} onChange={e => f.set(e.target.value as never)}
              placeholder={f.ph}
              style={{ width: '100%', padding: '11px 14px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)', fontSize: '12px', fontFamily: 'DM Mono, monospace', outline: 'none', background: 'var(--bg)' }}
            />
          </div>
        ))}
      </div>

      {status === 'error' && (
        <div style={{ fontSize: '13px', color: 'var(--red)', padding: '10px 14px', background: '#FEF2F2', borderRadius: 'var(--radius-sm)', marginBottom: '12px' }}>
          {error}
        </div>
      )}
      {status === 'ok' && (
        <div style={{ fontSize: '13px', color: 'var(--green)', padding: '10px 14px', background: '#F0FDF4', borderRadius: 'var(--radius-sm)', marginBottom: '12px' }}>
          Connexion vérifiée — redirection…
        </div>
      )}

      <button onClick={save} disabled={!ci || !st || status === 'loading' || status === 'ok'}
        style={{ width: '100%', padding: '13px', background: 'var(--navy)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '14px', fontWeight: 700, cursor: (!ci || !st) ? 'not-allowed' : 'pointer', opacity: (!ci || !st) ? 0.45 : 1, fontFamily: 'DM Sans, sans-serif' }}>
        {status === 'loading' ? 'Vérification…' : 'Enregistrer'}
      </button>
    </div>
  )
}
