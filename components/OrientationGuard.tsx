'use client'
import { useEffect } from 'react'

export default function OrientationGuard() {
  useEffect(() => {
    const update = () => {
      const html = document.documentElement
      const isLandscape = window.innerWidth > window.innerHeight

      if (isLandscape) {
        // window.orientation: 90 = CCW tilt, -90 = CW tilt → counter-rotate content
        const angle = (window as Window & { orientation?: number }).orientation ?? 90
        html.style.setProperty('--landscape-rot', `${-angle}deg`)
        html.classList.add('landscape-lock')
      } else {
        html.classList.remove('landscape-lock')
        html.style.removeProperty('--landscape-rot')
      }
    }

    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
      document.documentElement.classList.remove('landscape-lock')
    }
  }, [])

  return null
}
