import test from "node:test";
import assert from "node:assert/strict";
import {
  createGeoResolver,
  geoPoint,
  geoPins,
  projectWorld,
  clampMapPan,
} from "../src/geoModel.js";

test("invalid, missing, mismatched or out-of-bounds coordinates never become pins", () => {
  const ip = "1.1.1.1",
    valid = {
      ip,
      success: true,
      latitude: 13.75,
      longitude: 100.5,
      country: "Thailand",
    };
  assert.equal(geoPoint(ip, valid).latitude, 13.75);
  for (const bad of [
    null,
    { ...valid, success: false },
    { ...valid, latitude: null },
    { ...valid, latitude: "13" },
    { ...valid, latitude: 91 },
    { ...valid, longitude: -181 },
    { ...valid, ip: "8.8.8.8" },
  ])
    assert.equal(geoPoint(ip, bad), null);
});

test("GeoIP resolver deduplicates, caps concurrency, caches results and skips private/documentation IPs", async () => {
  let active = 0,
    peak = 0,
    calls = 0,
    clock = 1000;
  const resolve = createGeoResolver(
    async (ip) => {
      calls++;
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setImmediate(r));
      active--;
      return {
        ip,
        success: true,
        latitude: 0,
        longitude: 0,
        country: "Example",
      };
    },
    () => clock,
  );
  const first = resolve("1.1.1.1");
  assert.equal(resolve("1.1.1.1"), first);
  await Promise.all([
    first,
    resolve("8.8.8.8"),
    resolve("9.9.9.9"),
    resolve("64.6.64.6"),
  ]);
  assert.equal(peak, 2);
  assert.equal(calls, 4);
  for (const ip of ["192.0.2.1", "198.51.100.4", "2001:db8::1", "10.0.0.1"])
    assert.ok((await resolve(ip)).note);
  assert.equal(calls, 4);
  await resolve("1.1.1.1");
  assert.equal(calls, 4);
  clock += 86400001;
  await resolve("1.1.1.1");
  assert.equal(calls, 5);
});

test("lookup failures return an honest unavailable state and expire for retry", async () => {
  let calls = 0,
    clock = 0;
  const resolve = createGeoResolver(
    async () => {
      calls++;
      throw new Error("offline");
    },
    () => clock,
  );
  assert.ok((await resolve("1.1.1.1")).note);
  await resolve("1.1.1.1");
  assert.equal(calls, 1);
  clock = 60001;
  await resolve("1.1.1.1");
  assert.equal(calls, 2);
});

test("flat world coordinates cover both hemispheres and retain edge locations", () => {
  assert.deepEqual(projectWorld(0, 0), { x: 500, y: 250 });
  assert.deepEqual(projectWorld(90, -180), { x: 20, y: 10 });
  assert.deepEqual(projectWorld(-90, 180), { x: 980, y: 490 });
  assert.ok(projectWorld(40.7, -74).x < 500);
  assert.ok(projectWorld(35.6, 139.7).x > 500);
});
test("world map pan stays within bounds at every supported zoom", () => {
  assert.deepEqual(clampMapPan(-100, 200, 1), { x: 0, y: 0 });
  assert.deepEqual(clampMapPan(-9999, 9999, 2), { x: -1000, y: 0 });
  assert.deepEqual(clampMapPan(100, -9999, 4), { x: 0, y: -1500 });
});

test("coincident GeoIP locations retain every IP in a single drillable pin", () => {
  const geo = { latitude: 13.75, longitude: 100.5, country: "Thailand" };
  const rows = [
    { ip: "1.1.1.1", geo },
    { ip: "8.8.8.8", geo },
    { ip: "192.0.2.1", geo: { note: "No location" } },
  ];
  const pins = geoPins(rows);
  assert.equal(pins.length, 1);
  assert.deepEqual(
    pins[0].sources.map((s) => s.ip),
    ["1.1.1.1", "8.8.8.8"],
  );
});
