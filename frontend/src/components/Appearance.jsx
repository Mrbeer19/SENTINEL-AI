import React, { useEffect, useLayoutEffect, useState } from 'react'

export function useAppearance() {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('sentinel-appearance') === 'dark' ? 'dark' : 'light' } catch { return 'light' }
  })
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#000000' : '#f4f6fa')
    try { localStorage.setItem('sentinel-appearance', theme) } catch { /* Private browsing can disable storage. */ }
  }, [theme])
  useEffect(() => {
    const sync = event => {
      if (event.key === 'sentinel-appearance') setTheme(event.newValue === 'dark' ? 'dark' : 'light')
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  return [theme, () => setTheme(current => current === 'dark' ? 'light' : 'dark')]
}

export function ThemeToggle({ theme, onToggle }) {
  const label = theme === 'dark' ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'
  return <button type="button" className="themeToggle" aria-label={label} title={label} aria-pressed={theme === 'dark'} onClick={onToggle}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{theme === 'dark' ? <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/></> : <path d="M21 13a9 9 0 0 1-10-10 9 9 0 1 0 10 10Z"/>}</svg><span>{theme === 'dark' ? 'Light' : 'Dark'}</span></button>
}
