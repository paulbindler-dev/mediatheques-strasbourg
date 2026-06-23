'use client'
import { useState } from 'react'

type Props = {
  thumbnail?: string        // Syracuse cover URL (from search API)
  width: number
  height: number
  typeIcon: string          // emoji fallback
  subject?: string
  borderRadius?: number
}

export default function CoverImg({ thumbnail, width, height, typeIcon, subject, borderRadius = 5 }: Props) {
  const [failed, setFailed] = useState(false)

  if (thumbnail && !failed) {
    return (
      <img
        src={thumbnail}
        onError={() => setFailed(true)}
        style={{
          width, height, flexShrink: 0, borderRadius,
          objectFit: 'contain', objectPosition: 'center',
          background: 'var(--tab-inactive-bg)',
          display: 'block',
        }}
        alt=""
      />
    )
  }

  return (
    <div style={{
      width, height, flexShrink: 0, borderRadius,
      background: 'var(--tab-inactive-bg)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 3,
    }}>
      <span style={{ fontSize: Math.round(width * 0.42), lineHeight: 1 }}>{typeIcon}</span>
      {subject && (
        <span style={{
          fontSize: Math.max(6, Math.round(width * 0.18)), fontWeight: 700,
          color: 'var(--text-2)', textAlign: 'center',
          padding: '0 3px', lineHeight: 1.2, maxWidth: width - 4, wordBreak: 'break-word',
        }}>
          {subject}
        </span>
      )}
    </div>
  )
}
