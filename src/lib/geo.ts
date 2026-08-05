import { useEffect, useRef, useState } from "react";
import type { CoordFormat } from "./settings";
import { reverseGeocode, shouldRequestAddress } from "./geocode";

export interface GeoInfo {
  lat: number;
  lon: number;
  accuracy: number;
  altitude: number | null;
  address: string | null;
}

export type GeoStatus = "off" | "pending" | "ready" | "denied" | "error" | "unsupported";

function toDms(value: number, positive: string, negative: string): string {
  const hemisphere = value >= 0 ? positive : negative;
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = ((minFloat - min) * 60).toFixed(1);
  return `${deg}°${String(min).padStart(2, "0")}'${sec.padStart(4, "0")}"${hemisphere}`;
}

export function formatCoords(lat: number, lon: number, format: CoordFormat): string {
  if (format === "dms") {
    return `${toDms(lat, "N", "S")} ${toDms(lon, "E", "W")}`;
  }
  return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
}

/**
 * Watches the device position while `enabled`. Address lookup is a separate
 * opt-in and never blocks: the coordinates are published immediately and the
 * address is filled in later if it resolves.
 */
export function useGeolocation(enabled: boolean, wantAddress: boolean) {
  const [geo, setGeo] = useState<GeoInfo | null>(null);
  const [status, setStatus] = useState<GeoStatus>("off");
  const wantAddressRef = useRef(wantAddress);
  wantAddressRef.current = wantAddress;

  useEffect(() => {
    if (!enabled) {
      setStatus("off");
      setGeo(null);
      return;
    }
    if (!("geolocation" in navigator)) {
      setStatus("unsupported");
      return;
    }

    setStatus("pending");
    let cancelled = false;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (cancelled) return;
        const { latitude, longitude, accuracy, altitude } = pos.coords;
        setGeo((prev) => ({
          lat: latitude,
          lon: longitude,
          accuracy,
          altitude,
          // keep the previous address until a newer one arrives
          address: prev?.address ?? null,
        }));
        setStatus("ready");

        if (wantAddressRef.current && shouldRequestAddress(latitude, longitude)) {
          void reverseGeocode(latitude, longitude).then((address) => {
            if (cancelled || !address) return;
            setGeo((prev) => (prev ? { ...prev, address } : prev));
          });
        }
      },
      (err) => {
        if (cancelled) return;
        setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "error");
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 }
    );

    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(watchId);
    };
  }, [enabled]);

  // Turning the address on later should not require waiting for the next fix.
  useEffect(() => {
    if (!enabled || !wantAddress || !geo || geo.address) return;
    if (!shouldRequestAddress(geo.lat, geo.lon)) return;
    let cancelled = false;
    void reverseGeocode(geo.lat, geo.lon).then((address) => {
      if (cancelled || !address) return;
      setGeo((prev) => (prev ? { ...prev, address } : prev));
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, wantAddress, geo]);

  return { geo, status };
}

export const GEO_STATUS_LABEL: Record<GeoStatus, string> = {
  off: "aus",
  pending: "suche Signal …",
  ready: "aktiv",
  denied: "Freigabe verweigert",
  error: "kein Signal",
  unsupported: "nicht verfügbar",
};
