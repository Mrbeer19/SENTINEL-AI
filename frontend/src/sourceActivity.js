import { isReplayIp } from './ui.jsx'

const isLocalIp = ip => ip === '127.0.0.1' || ip === '::1' || /^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip || '') || /^(fc|fd|fe80:)/i.test(ip || '')

export const isRealPublicIp = ip => !!ip && !isReplayIp(ip) && !isLocalIp(ip)

export function sourceActivity(data) {
  const latest = new Map()
  const records = [
    ...data.events.map(e => ({ ip: e.source_ip, at: e.timestamp, id: e.id || 0 })),
    ...data.traffic.map(t => ({ ip: t.source_ip, at: t.created_at, id: t.id || 0 })),
  ]
  for (const record of records) {
    if (!record.ip) continue
    const time = Date.parse(record.at || '') || 0
    const previous = latest.get(record.ip)
    if (!previous || time > previous.time || (time === previous.time && record.id > previous.id)) {
      latest.set(record.ip, { ...record, time })
    }
  }
  for (const incident of data.incidents) {
    if (incident.source_ip && !latest.has(incident.source_ip)) {
      latest.set(incident.source_ip, { ip: incident.source_ip, at: incident.created_at, id: incident.id || 0, time: Date.parse(incident.created_at || '') || 0 })
    }
  }
  return [...latest.values()].sort((a, b) => b.time - a.time || b.id - a.id || a.ip.localeCompare(b.ip))
}

export function latestRealLoginIp(data) {
  return data.events
    .filter(e => e.event_type === 'HTTP_AUTH' && isRealPublicIp(e.source_ip))
    .sort((a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0) || (b.id || 0) - (a.id || 0))[0]?.source_ip
}
