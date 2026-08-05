// Reverse geocoding via OpenStreetMap Nominatim.
//
// This is the only part of the app that talks to a third-party server: it sends
// the current coordinates to nominatim.openstreetmap.org. It is opt-in in the
// settings and gated behind an explicit one-time confirmation. Nominatim's usage
// policy caps this at one request per second, so requests are throttled and only
// fired after real movement; results are cached locally.

const ENDPOINT = "https://nominatim.openstreetmap.org/reverse";
const MIN_INTERVAL_MS = 1_100;
const MIN_DISTANCE_M = 50;
const TIMEOUT_MS = 5_000;
const CACHE_KEY = "timestamp-camera:geocache";
const CACHE_LIMIT = 100;

let lastRequestAt = 0;
let lastLat: number | null = null;
let lastLon: number | null = null;

function distanceMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Rate limit gate. Call this before `reverseGeocode`; it records the attempt, so
 * a caller in a position-watch loop cannot hammer the endpoint.
 */
export function shouldRequestAddress(lat: number, lon: number): boolean {
  const now = Date.now();
  if (now - lastRequestAt < MIN_INTERVAL_MS) return false;
  if (
    lastLat !== null &&
    lastLon !== null &&
    distanceMeters(lastLat, lastLon, lat, lon) < MIN_DISTANCE_M
  ) {
    return false;
  }
  lastRequestAt = now;
  lastLat = lat;
  lastLon = lon;
  return true;
}

// ~11 m grid — fine enough for a street address, coarse enough to hit the cache.
const cacheKeyFor = (lat: number, lon: number) => `${lat.toFixed(4)},${lon.toFixed(4)}`;

function readCache(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, string>): void {
  try {
    const entries = Object.entries(cache);
    const trimmed = entries.length > CACHE_LIMIT ? entries.slice(-CACHE_LIMIT) : entries;
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(trimmed)));
  } catch {
    /* quota — caching is best effort */
  }
}

interface NominatimAddress {
  road?: string;
  pedestrian?: string;
  footway?: string;
  house_number?: string;
  postcode?: string;
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  suburb?: string;
  county?: string;
  country?: string;
}

function buildAddress(a: NominatimAddress): string {
  const street = a.road ?? a.pedestrian ?? a.footway ?? "";
  const line1 = [street, a.house_number].filter(Boolean).join(" ");
  const place = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.suburb ?? a.county ?? "";
  const line2 = [a.postcode, place].filter(Boolean).join(" ");
  return [line1, line2].filter(Boolean).join(", ") || (a.country ?? "");
}

/** Resolves to a human-readable address, or null on any failure. Never throws. */
export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  const key = cacheKeyFor(lat, lon);
  const cache = readCache();
  if (cache[key]) return cache[key];

  const url = `${ENDPOINT}?format=jsonv2&zoom=18&addressdetails=1&accept-language=de&lat=${lat}&lon=${lon}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = (await res.json()) as { address?: NominatimAddress; display_name?: string };
    const address = data.address ? buildAddress(data.address) : (data.display_name ?? "");
    if (!address) return null;
    cache[key] = address;
    writeCache(cache);
    return address;
  } catch {
    return null; // offline, aborted or blocked — the stamp falls back to coordinates
  } finally {
    clearTimeout(timer);
  }
}
