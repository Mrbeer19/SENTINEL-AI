import { isPublic } from "./lib.js";

export function geoPoint(ip, result) {
  if (
    !result?.success ||
    !Number.isFinite(result.latitude) ||
    !Number.isFinite(result.longitude) ||
    Math.abs(result.latitude) > 90 ||
    Math.abs(result.longitude) > 180 ||
    (result.ip && result.ip.toLowerCase() !== ip.toLowerCase())
  )
    return null;
  return {
    ip,
    latitude: result.latitude,
    longitude: result.longitude,
    country: result.country || "ไม่ทราบประเทศ",
    city: result.city || "",
    region: result.region || "",
    sample: result.fixture === true,
  };
}

// Two lookups at a time, deduplicated across the globe and source inspector.
export function createGeoResolver(fetchPoint, now = Date.now) {
  const cache = new Map(),
    queue = [];
  let active = 0;
  function pump() {
    while (active < 2 && queue.length) {
      const job = queue.shift();
      active++;
      Promise.resolve()
        .then(job.run)
        .finally(() => {
          active--;
          pump();
        });
    }
  }
  return (ip) => {
    if (!isPublic(ip))
      return Promise.resolve({
        note: "IP ภายในหรือ IP สำหรับทดสอบ ไม่มีตำแหน่งสาธารณะ",
      });
    const key = ip.toLowerCase(),
      old = cache.get(key);
    if (old && old.expires > now()) return old.promise;
    const entry = { expires: Infinity, promise: null };
    entry.promise = new Promise((resolve) => {
      queue.push({
        run: async () => {
          let value;
          try {
            value = geoPoint(ip, await fetchPoint(ip)) || {
              note: "ยังระบุตำแหน่งไม่ได้",
            };
          } catch {
            value = { note: "โหลดตำแหน่งไม่ได้ ลองใหม่ภายหลัง" };
          }
          entry.expires =
            now() + (value.latitude !== undefined ? 86400000 : 60000);
          resolve(value);
          // Bound the browser cache without discarding in-flight requests.
          if (cache.size > 2048)
            for (const [k, v] of cache) {
              if (v.expires !== Infinity && k !== key) {
                cache.delete(k);
                break;
              }
            }
        },
      });
      pump();
    });
    cache.set(key, entry);
    return entry.promise;
  };
}

// Equirectangular coordinates keep every longitude visible in the fitted view.
export function projectWorld(latitude, longitude) {
  return {
    x: 20 + ((longitude + 180) / 360) * 960,
    y: 10 + ((90 - latitude) / 180) * 480,
  };
}
export function clampMapPan(x, y, zoom) {
  return {
    x: Math.max(1000 - 1000 * zoom, Math.min(0, x)),
    y: Math.max(500 - 500 * zoom, Math.min(0, y)),
  };
}

export function geoPins(rows) {
  const pins = new Map();
  for (const row of rows)
    if (row.geo?.latitude !== undefined) {
      const { latitude, longitude } = row.geo,
        key = `${latitude.toFixed(3)}:${longitude.toFixed(3)}`;
      if (!pins.has(key))
        pins.set(key, {
          key,
          latitude,
          longitude,
          country: row.geo.country,
          sources: [],
        });
      pins.get(key).sources.push(row);
    }
  return [...pins.values()];
}
