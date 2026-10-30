import React, { useEffect, useRef } from 'react'
import land from '../assets/land-110m.json'

const RAD = Math.PI / 180
const bounds = land.map(ring => ({ ring, minX: Math.min(...ring.map(p => p[0])), maxX: Math.max(...ring.map(p => p[0])), minY: Math.min(...ring.map(p => p[1])), maxY: Math.max(...ring.map(p => p[1])) }))
function isLand(lon, lat) {
  return bounds.some(({ ring, minX, maxX, minY, maxY }) => {
    if (lon < minX || lon > maxX || lat < minY || lat > maxY) return false
    let inside = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x, y] = ring[i], [px, py] = ring[j]
      if ((y > lat) !== (py > lat) && lon < (px - x) * (lat - y) / (py - y) + x) inside = !inside
    }
    return inside
  })
}
const vector = (lat, lon) => [Math.cos(lat) * Math.sin(lon), -Math.sin(lat), Math.cos(lat) * Math.cos(lon)]
const coastlines = land.map(ring => ring.map(([lon, lat]) => vector(lat * RAD, lon * RAD)))
const dots = []
for (let lat = -80; lat <= 82; lat += .85) {
  const spacing = .85 / Math.max(.22, Math.cos(lat * RAD))
  for (let lon = -180; lon < 180; lon += spacing) if (isLand(lon, lat)) dots.push({ point: vector(lat * RAD, lon * RAD), light: ((Math.sin(lon * 127.1 + lat * 311.7) * 43758.5453) % 1 + 1) % 1 })
}

// Land and orbital lines are visual context. Location pins require explicit coordinates.
export default function GlobeCanvas({ markers = [], focusLongitude = null, focusLatitude = 0, focusVersion = 0, controlRef, theme = 'dark' }) {
  const canvasRef = useRef(null)
  const markerRef = useRef(markers)
  markerRef.current = markers
  const focusRef = useRef(focusLongitude)
  focusRef.current = focusLongitude
  const versionRef = useRef(focusVersion)
  versionRef.current = focusVersion
  const latitudeRef = useRef(focusLatitude)
  latitudeRef.current = focusLatitude
  const themeRef = useRef(theme)
  themeRef.current = theme
  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas.getContext('2d')
    if (!ctx) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    let width = 800, height = 410, frame, last = -100, visible = true, start = performance.now()
    let rotation = -.75, tiltAngle = -.16, zoom = 1, dragging = false, manual = false, pointerX = 0, pointerY = 0, focused = null, lastVersion = -1
    const down = e => { dragging = true; manual = true; pointerX = e.clientX; pointerY = e.clientY; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing' }
    const move = e => { if (!dragging) return; rotation += (e.clientX - pointerX) * .008; tiltAngle = Math.max(-1.4, Math.min(1.4, tiltAngle + (e.clientY - pointerY) * .008)); pointerX = e.clientX; pointerY = e.clientY }
    const up = () => { dragging = false; canvas.style.cursor = 'grab' }
    const wheel = e => { e.preventDefault(); zoom = Math.max(.7, Math.min(2, zoom - e.deltaY * .001)) }
    const key = e => {
      if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','Home'].includes(e.key)) return
      e.preventDefault(); manual = true
      if (e.key === 'ArrowLeft') rotation -= .15
      if (e.key === 'ArrowRight') rotation += .15
      if (e.key === 'ArrowUp') tiltAngle = Math.max(-1.4, tiltAngle - .12)
      if (e.key === 'ArrowDown') tiltAngle = Math.min(1.4, tiltAngle + .12)
      if (e.key === '+') zoom = Math.min(2, zoom + .1)
      if (e.key === '-') zoom = Math.max(.7, zoom - .1)
      if (e.key === 'Home') { manual = false; focused = null; zoom = 1 }
    }
    if (controlRef) controlRef.current = { zoomIn: () => { zoom = Math.min(2, zoom + .15) }, zoomOut: () => { zoom = Math.max(.7, zoom - .15) }, reset: () => { manual = false; focused = null; zoom = 1 } }
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('wheel', wheel, { passive: false }); canvas.addEventListener('keydown', key)
    const resize = () => {
      const box = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = box.width; height = box.height
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      draw(0)
    }
    const project = (point, spin, tilt = tiltAngle) => {
      const [x, y, z] = point, sx = x * Math.cos(spin) + z * Math.sin(spin), sz = z * Math.cos(spin) - x * Math.sin(spin)
      return [sx, y * Math.cos(tilt) - sz * Math.sin(tilt), sz * Math.cos(tilt) + y * Math.sin(tilt)]
    }
    const draw = elapsed => {
      const cx = width * .5, cy = height * .49, radius = Math.min(width * .305, height * .455) * zoom
      if (Number.isFinite(focusRef.current) && (focused !== focusRef.current || lastVersion !== versionRef.current)) { rotation = -focusRef.current * RAD; tiltAngle = -latitudeRef.current * RAD; focused = focusRef.current; lastVersion = versionRef.current; manual = true }
      if (!manual && !reduced.matches) rotation += .0012
      const spin = rotation
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = themeRef.current === 'light' ? '#f5f9fc' : '#111e29'; ctx.fillRect(0, 0, width, height)
      for (let i = 0; i < 100; i++) {
        const x = ((Math.sin(i * 127.1) * 43758.5) % 1 + 1) % 1 * width
        const y = ((Math.sin(i * 269.5) * 18341.3) % 1 + 1) % 1 * height
        ctx.fillStyle = `rgba(95,183,255,${.12 + (i % 4) * .08})`; ctx.fillRect(x, y, i % 9 === 0 ? 1.7 : .8, i % 9 === 0 ? 1.7 : .8)
      }
      const atmosphere = ctx.createRadialGradient(cx, cy, radius * .9, cx, cy, radius * 1.22)
      atmosphere.addColorStop(0, 'rgba(30,145,255,0)'); atmosphere.addColorStop(.48, 'rgba(0,154,255,.18)'); atmosphere.addColorStop(1, 'rgba(30,145,255,0)')
      ctx.fillStyle = atmosphere; ctx.fillRect(cx - radius * 1.4, cy - radius * 1.4, radius * 2.8, radius * 2.8)
      const surface = ctx.createRadialGradient(cx - radius * .3, cy - radius * .4, 0, cx, cy, radius)
      surface.addColorStop(0, '#124d7c'); surface.addColorStop(.35, '#082843'); surface.addColorStop(.8, '#031222'); surface.addColorStop(1, '#0867a1')
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fillStyle = surface; ctx.fill()
      const line = (points, alpha = .1, color = '45,164,255') => {
        ctx.beginPath(); let drawing = false
        for (const point of points) {
          const [x, y, z] = project(point, spin)
          if (z < 0) { drawing = false; continue }
          if (drawing) ctx.lineTo(cx + x * radius, cy + y * radius)
          else { ctx.moveTo(cx + x * radius, cy + y * radius); drawing = true }
        }
        ctx.strokeStyle = `rgba(${color},${alpha})`; ctx.lineWidth = .65; ctx.stroke()
      }
      for (let lat = -60; lat <= 60; lat += 20) line(Array.from({ length: 121 }, (_, n) => vector(lat * RAD, n * Math.PI / 60)), .055)
      for (let lon = 0; lon < 180; lon += 20) line(Array.from({ length: 121 }, (_, n) => vector(n * Math.PI / 60, lon * RAD)), .05)
      for (const coast of coastlines) line(coast, .6, '80,210,230')
      // Decorative surface lights follow land geometry; only GeoIP pins represent logins.
      for (const { point, light } of dots) {
        const [x, y, z] = project(point, spin)
        if (z <= 0) continue
        const px = cx + x * radius, py = cy + y * radius
        ctx.fillStyle = `rgba(40,119,171,${.12 + z * .22})`
        ctx.fillRect(px, py, 1.1, 1.1)
        if (light < .57) continue
        const brightness = (light - .57) / .43
        ctx.fillStyle = `rgba(95,${Math.round(180 + brightness * 60)},240,${(.3 + brightness * .7) * Math.min(1,z * 3)})`
        const size = (.45 + brightness * 1.1) * Math.max(.5, radius / 250)
        ctx.fillRect(px, py, size, size)
        if (light > .987) {
          const glow = ctx.createRadialGradient(px, py, 0, px, py, 5)
          glow.addColorStop(0,'rgba(105,224,255,.25)'); glow.addColorStop(1,'rgba(85,210,255,0)')
          ctx.fillStyle = glow; ctx.fillRect(px - 5,py - 5,10,10)
        }
      }
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(100,215,255,.9)'; ctx.lineWidth = 1.8; ctx.shadowColor = '#169dff'; ctx.shadowBlur = 7; ctx.stroke(); ctx.shadowBlur = 0
      for (let ring = 0; ring < 3; ring++) {
        const tilt = -.8 + ring * .35, phase = ring * .7 + elapsed * .00009
        const r = radius * (1.12 + ring * .07)
        ctx.beginPath()
        for (let n = 0; n <= 120; n++) {
          const a = n * Math.PI / 60, px = Math.cos(a) * r, py = Math.sin(a) * r * .42
          const x = px * Math.cos(tilt) - py * Math.sin(tilt), y = px * Math.sin(tilt) + py * Math.cos(tilt)
          if (!n) ctx.moveTo(cx + x, cy + y); else ctx.lineTo(cx + x, cy + y)
        }
        ctx.strokeStyle = `rgba(${ring % 2 ? '35,100,170' : '40,170,255'},${.12 + (ring === 2 ? .1 : 0)})`; ctx.lineWidth = .8; ctx.stroke()
        const px = Math.cos(phase) * r, py = Math.sin(phase) * r * .42
        ctx.beginPath(); ctx.arc(cx + px * Math.cos(tilt) - py * Math.sin(tilt), cy + px * Math.sin(tilt) + py * Math.cos(tilt), 2, 0, Math.PI * 2)
        ctx.fillStyle = '#5ce6ff'; ctx.shadowColor = '#169dff'; ctx.shadowBlur = 11; ctx.fill(); ctx.shadowBlur = 0
      }
      // Abstract communication arcs are decoration, independent of source IP locations.
      for (let i = 0; i < 12; i++) {
        const a = vector((Math.sin(i * 2.4) * 58) * RAD, (i * 137.5 % 360 - 180) * RAD)
        const b = vector((Math.cos(i * 1.7) * 55) * RAD, ((i * 137.5 + 85) % 360 - 180) * RAD)
        const points = []
        for (let j = 0; j <= 60; j++) {
          const t = j / 60, v = a.map((value,k) => value * (1-t) + b[k] * t)
          const norm = Math.hypot(...v), lift = 1 + Math.sin(t * Math.PI) * .11
          points.push(v.map(value => value / norm * lift))
        }
        line(points, .26)
        const [x,y,z] = project(a, spin)
        if (z > 0) {
          const px = cx + x * radius, py = cy + y * radius
          ctx.save(); ctx.shadowColor = '#16c7ff'; ctx.shadowBlur = 12
          ctx.fillStyle = '#c6f4ff'; ctx.beginPath(); ctx.arc(px,py,1.7,0,Math.PI*2); ctx.fill()
          ctx.strokeStyle = '#5cdcff'; ctx.lineWidth = .7; ctx.beginPath(); ctx.moveTo(px-5,py);ctx.lineTo(px+5,py);ctx.moveTo(px,py-5);ctx.lineTo(px,py+5);ctx.stroke();ctx.restore()
        }
      }
      const labelRows = []
      let visiblePins = 0
      for (const marker of markerRef.current) {
        const { latitude, longitude } = marker
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue
        const [x, y, z] = project(vector(latitude * RAD, longitude * RAD), spin)
        if (z <= 0) continue
        visiblePins++
        const px = cx + x * radius, py = cy + y * radius
        const color = marker.threat || marker.blocked ? '#ff667c' : '#44ffcf'
        ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 12; ctx.fill(); ctx.shadowBlur = 0
        ctx.beginPath(); ctx.arc(px, py, 8 + (Math.sin(elapsed * .003) + 1) * 3, 0, Math.PI * 2); ctx.strokeStyle = color; ctx.globalAlpha = .45; ctx.stroke(); ctx.globalAlpha = 1
        if (marker.label) {
          ctx.font = 'bold 12px system-ui'
          const text = String(marker.label).slice(0, 60), textWidth = ctx.measureText(text).width
          const lx = Math.max(8, Math.min(width - textWidth - 8, px + 14))
          let ly = Math.max(16, py - 12)
          while (labelRows.some(row => Math.abs(row.y - ly) < 18 && lx < row.x + row.width && lx + textWidth > row.x)) ly += 18
          labelRows.push({ x: lx, y: ly, width: textWidth })
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(lx, ly - 4); ctx.strokeStyle = 'rgba(100,220,255,.5)'; ctx.lineWidth = .7; ctx.stroke()
          ctx.fillStyle = 'rgba(2,12,25,.88)'; ctx.fillRect(lx - 3, ly - 12, textWidth + 6, 16)
          ctx.fillStyle = '#e1f2ff'; ctx.fillText(text, lx, ly)
        }
      }
      ctx.font = '11px system-ui'; ctx.fillStyle = themeRef.current === 'light' ? '#496578' : '#a9d4ef'
      ctx.fillText(`GeoIP ${markerRef.current.length} IP · มองเห็น ${visiblePins} · Home กลับไปยังหมุด`, 12, height - 12)
    }
    const tick = now => {
      if (visible && !document.hidden && now - last > 32) { draw(reduced.matches ? 0 : now - start); last = now }
      frame = requestAnimationFrame(tick)
    }
    const observer = new ResizeObserver(resize); observer.observe(canvas)
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting }); intersection.observe(canvas)
    resize(); frame = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(frame); observer.disconnect(); intersection.disconnect(); canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('wheel', wheel); canvas.removeEventListener('keydown', key) }
  }, [])
  return <canvas className="globeCanvas" ref={canvasRef} tabIndex={0} role="img" aria-label="ลูกโลก GeoIP: ลากเพื่อหมุน เลื่อนเพื่อซูม หรือใช้ปุ่มลูกศร บวก ลบ และ Home เพื่อคืนมุมมอง" />
}
