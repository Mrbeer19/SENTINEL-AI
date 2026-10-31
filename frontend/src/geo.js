import { getJson } from "./api.js";
import { createGeoResolver } from "./geoModel.js";
export const resolveGeo = createGeoResolver((ip) =>
  getJson(`/api/geoip/${encodeURIComponent(ip)}`),
);
