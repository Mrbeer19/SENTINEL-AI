import React, { useId } from 'react'
import { fmtTime } from '../ui.jsx'

export default function ActivityChart({ values, now }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const width = 320, height = 160, left = 35, right = 12, top = 15, bottom = 26
  const max = Math.max(1, ...values)
  const total = values.reduce((sum, value) => sum + value, 0)
  const x = i => left + i / Math.max(1, values.length - 1) * (width - left - right)
  const y = value => height - bottom - value / max * (height - top - bottom)
  const points = values.map((value, i) => `${x(i)},${y(value)}`).join(' ')
  const area = `M${x(0)},${height - bottom} L${points.replaceAll(' ', ' L')} L${x(values.length - 1)},${height - bottom} Z`
  return <figure className="activityChart" aria-label={`${total} stored requests over the last ${values.length} minutes`}>
    <div className="chartSummary"><strong>{total.toLocaleString()}<span>requests</span></strong><span className="chartLegend"><i className="dot mint" />Requests / minute</span></div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={total ? `Peak ${max} requests per minute` : 'No requests in this time window'}>
      <defs><linearGradient id={`area-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9661d6" stopOpacity=".22" /><stop offset="1" stopColor="#9661d6" stopOpacity=".01" /></linearGradient></defs>
      {[0, .5, 1].map(f => <g key={f}><line x1={left} y1={y(f * max)} x2={width - right} y2={y(f * max)} className="chartGrid" /><text x={left - 9} y={y(f * max) + 3} textAnchor="end" className="chartTick">{Number((f * max).toFixed(1))}</text></g>)}
      {[0, 1, 2, 3, 4, 5].map(i => <line key={i} x1={left + i * (width - left - right) / 5} y1={top} x2={left + i * (width - left - right) / 5} y2={height - bottom} className="chartGrid vertical" />)}
      <path d={area} fill={`url(#area-${id})`} />
      <polyline points={points} className="chartLine" />
      {values.map((value, i) => value > 0 && <circle key={i} cx={x(i)} cy={y(value)} r="3" className="chartPoint"><title>{value} request{value === 1 ? '' : 's'} · {fmtTime(now - (values.length - 1 - i) * 60000)}</title></circle>)}
      <text x={left} y={height - 3} className="chartTick">{fmtTime(now - (values.length - 1) * 60000).slice(0, 5)}</text>
      <text x={width - right} y={height - 3} textAnchor="end" className="chartTick">{fmtTime(now).slice(0, 5)}</text>
      {!total && <text x={(width + left) / 2} y={top + 40} textAnchor="middle" className="chartEmpty">No requests in this window</text>}
    </svg>
  </figure>
}
