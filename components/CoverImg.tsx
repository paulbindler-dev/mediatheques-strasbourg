'use client'
import { useState } from 'react'

type Props = {
  thumbnail?: string
  width: number
  height: number
  typeIcon: string
  subject?: string
  typeBg?: string
  borderRadius?: number
}

export default function CoverImg({ thumbnail, width, height, typeIcon, typeBg, borderRadius = 5 }: Props) {
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
      background: typeBg ?? 'var(--tab-inactive-bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{ fontSize: Math.round(width * 0.42), lineHeight: 1 }}>{typeIcon}</span>
    </div>
  )
}
