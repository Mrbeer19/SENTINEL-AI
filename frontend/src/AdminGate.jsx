import React, { useEffect, useState } from 'react'
import App from './App.jsx'
import { request } from './api.js'

export default function AdminGate() {
  const [session, setSession] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const check = async () => { try { setSession((await request('/api/auth/session')).data) } catch { setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้'); setSession({ authenticated: false }) } }
  useEffect(() => {
    check()
    const expired = () => { setSession({ authenticated: false, configured: true }); setPassword(''); setError('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง') }
    window.addEventListener('sentinel-auth-expired', expired)
    return () => window.removeEventListener('sentinel-auth-expired', expired)
  }, [])
  const login = async e => {
    e.preventDefault(); setBusy(true); setError('')
    try { await request('/api/auth/login', { method: 'POST', body: { username, password } }); setPassword(''); await check() }
    catch (err) { setError(err.status === 429 ? 'ลองเข้าสู่ระบบบ่อยเกินไป กรุณารอ 5 นาที' : err.status === 503 ? 'ยังไม่ได้ตั้งค่ารหัสแอดมินบนเซิร์ฟเวอร์' : 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'); setPassword('') }
    finally { setBusy(false) }
  }
  if (!session) return <div className="adminLogin"><p>กำลังตรวจสอบสิทธิ์…</p></div>
  const logout = async () => {
    try {
      await request('/api/auth/logout', { method: 'POST', body: {} })
      sessionStorage.removeItem('sentinel-geoip')
      setSession({authenticated:false, configured:true}); setError('')
    } catch { setError('ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง') }
  }
  if (session.authenticated) return <>{error && <div role="alert">{error}</div>}<App adminUsername={session.username || username} onLogout={logout}/></>

  return <main className="adminLogin"><section className="adminLoginCard"><div className="loginVisual"><img src="/assets/nex.svg" alt=""/><span>SENTINEL / ADMIN ACCESS</span><h1>ศูนย์ควบคุม<br/>ความปลอดภัย</h1><p>ติดตามทุกสัญญาณ จัดการการป้องกัน<br/>สำหรับผู้ดูแลระบบเท่านั้น</p></div><form onSubmit={login}><span className="sectionIndex">SECURE WORKSPACE</span><h2>เข้าสู่ระบบแอดมิน</h2><p>ยืนยันตัวตนเพื่อเข้าสู่ SENTINEL</p><label>ชื่อผู้ใช้<input autoComplete="username" required maxLength={100} value={username} onChange={e=>setUsername(e.target.value)}/></label><label>รหัสผ่าน<input type="password" autoComplete="current-password" required maxLength={1024} value={password} onChange={e=>setPassword(e.target.value)}/></label>{error && <p role="alert" className="loginError">{error}</p>}{session.configured === false && <p className="loginError">ยังไม่ได้ตั้งค่าบัญชีแอดมินบนเซิร์ฟเวอร์</p>}<button className="btn primary" disabled={busy || session.configured === false}>{busy ? 'กำลังตรวจสอบ…' : 'เข้าสู่ศูนย์ควบคุม →'}</button><small>เฉพาะผู้ดูแลที่ได้รับอนุญาต</small></form></section></main>
}
