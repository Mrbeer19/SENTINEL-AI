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
for (let lat = -80; lat <= 82; lat += 1.8) {
  const spacing = 1.8 / Math.max(.22, Math.cos(lat * RAD))
  for (let lon = -180; lon < 180; lon += spacing) if (isLand(lon, lat)) dots.push(vector(lat * RAD, lon * RAD))
}

// Land and orbital lines are visual context. Location pins require explicit coordinates.
export default function GlobeCanvas({ markers = [], focusLongitude = null }) {
  const canvasRef = useRef(null)
  const markerRef = useRef(markers)
  markerRef.current = markers
  const focusRef = useRef(focusLongitude)
  focusRef.current = focusLongitude
  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas.getContext('2d')
    if (!ctx) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    let width = 800, height = 410, frame, last = -100, visible = true, start = performance.now()
    const resize = () => {
      const box = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = box.width; height = box.height
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      draw(0)
    }
    const project = (point, spin, tilt = -.16) => {
      const [x, y, z] = point, sx = x * Math.cos(spin) + z * Math.sin(spin), sz = z * Math.cos(spin) - x * Math.sin(spin)
      return [sx, y * Math.cos(tilt) - sz * Math.sin(tilt), sz * Math.cos(tilt) + y * Math.sin(tilt)]
    }
    const draw = elapsed => {
      const cx = width * .5, cy = height * .49, radius = Math.min(width * .305, height * .455)
      const spin = focusRef.current === null ? -.75 + elapsed * .000045 : -focusRef.current * RAD + Math.sin(elapsed * .00015) * .07
      ctx.clearRect(0, 0, width, height)
      const atmosphere = ctx.createRadialGradient(cx, cy, radius * .72, cx, cy, radius * 1.32)
      atmosphere.addColorStop(0, 'rgba(134,78,219,0)'); atmosphere.addColorStop(.48, 'rgba(134,78,219,.15)'); atmosphere.addColorStop(1, 'rgba(134,78,219,0)')
      ctx.fillStyle = atmosphere; ctx.fillRect(cx - radius * 1.4, cy - radius * 1.4, radius * 2.8, radius * 2.8)
      const surface = ctx.createRadialGradient(cx - radius * .3, cy - radius * .4, 0, cx, cy, radius)
      surface.addColorStop(0, '#efebf5'); surface.addColorStop(.5, '#e4deef'); surface.addColorStop(1, '#c8bfd9')
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fillStyle = surface; ctx.fill()
      const line = (points, alpha = .1) => {
        ctx.beginPath(); let drawing = false
        for (const point of points) {
          const [x, y, z] = project(point, spin)
          if (z < 0) { drawing = false; continue }
          if (drawing) ctx.lineTo(cx + x * radius, cy + y * radius)
          else { ctx.moveTo(cx + x * radius, cy + y * radius); drawing = true }
        }
        ctx.strokeStyle = `rgba(100,74,140,${alpha})`; ctx.lineWidth = .65; ctx.stroke()
      }
      for (let lat = -60; lat <= 60; lat += 20) line(Array.from({ length: 121 }, (_, n) => vector(lat * RAD, n * Math.PI / 60)), .16)
      for (let lon = 0; lon < 180; lon += 20) line(Array.from({ length: 121 }, (_, n) => vector(n * Math.PI / 60, lon * RAD)), .13)
      for (const coast of coastlines) line(coast, .34)
      for (const point of dots) {
        const [x, y, z] = project(point, spin)
        if (z < -.03) continue
        ctx.fillStyle = `rgba(60,35,92,${.23 + Math.max(0, z) * .63})`
        const size = .65 + Math.max(0, z) * .55
        ctx.fillRect(cx + x * radius, cy + y * radius, size, size)
      }
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(109,72,160,.5)'; ctx.lineWidth = 1; ctx.shadowColor = '#8950d8'; ctx.shadowBlur = 13; ctx.stroke(); ctx.shadowBlur = 0
      for (let ring = 0; ring < 3; ring++) {
        const tilt = -.8 + ring * .35, phase = ring * .7 + elapsed * .00009
        const r = radius * (1.12 + ring * .07)
        ctx.beginPath()
        for (let n = 0; n <= 120; n++) {
          const a = n * Math.PI / 60, px = Math.cos(a) * r, py = Math.sin(a) * r * .42
          const x = px * Math.cos(tilt) - py * Math.sin(tilt), y = px * Math.sin(tilt) + py * Math.cos(tilt)
          if (!n) ctx.moveTo(cx + x, cy + y); else ctx.lineTo(cx + x, cy + y)
        }
        ctx.strokeStyle = `rgba(${ring % 2 ? '45,35,62' : '136,79,214'},${.12 + (ring === 2 ? .1 : 0)})`; ctx.lineWidth = .8; ctx.stroke()
        const px = Math.cos(phase) * r, py = Math.sin(phase) * r * .42
        ctx.beginPath(); ctx.arc(cx + px * Math.cos(tilt) - py * Math.sin(tilt), cy + px * Math.sin(tilt) + py * Math.cos(tilt), 2, 0, Math.PI * 2)
        ctx.fillStyle = '#bdff41'; ctx.shadowColor = '#8950d8'; ctx.shadowBlur = 11; ctx.fill(); ctx.shadowBlur = 0
      }
      for (const marker of markerRef.current) {
        const { latitude, longitude } = marker
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue
        const [x, y, z] = project(vector(latitude * RAD, longitude * RAD), spin)
        if (z <= 0) continue
        const px = cx + x * radius, py = cy + y * radius
        const color = marker.threat || marker.blocked ? '#ff667c' : '#5a9700'
        ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 12; ctx.fill(); ctx.shadowBlur = 0
        ctx.beginPath(); ctx.arc(px, py, 8 + (Math.sin(elapsed * .003) + 1) * 3, 0, Math.PI * 2); ctx.strokeStyle = color; ctx.globalAlpha = .45; ctx.stroke(); ctx.globalAlpha = 1
        if (marker.label) { ctx.font = '14px system-ui'; ctx.fillStyle = '#19131f'; ctx.fillText(String(marker.label).slice(0, 45), px + 10, py - 8) }
      }
    }
    const tick = now => {
      if (visible && !document.hidden && now - last > 32) { draw(reduced.matches ? 0 : now - start); last = now }
      frame = requestAnimationFrame(tick)
    }
    const observer = new ResizeObserver(resize); observer.observe(canvas)
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting }); intersection.observe(canvas)
    resize(); frame = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(frame); observer.disconnect(); intersection.disconnect() }
  }, [])
  return <canvas className="globeCanvas" ref={canvasRef} aria-hidden="true" />
}
