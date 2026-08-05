// Shape and defaults of everything the user can configure. Persisted verbatim
// in localStorage; unknown/missing keys fall back to DEFAULTS on load.

export type StampPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "middle-center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type FontKey = "sans" | "condensed" | "serif" | "mono";
export type CoordFormat = "dec" | "dms";
export type Resolution = "1280x720" | "1920x1080" | "2560x1440" | "3840x2160";
export type FacingMode = "environment" | "user";
/** off = dark · flash = light only around the capture · torch = stays on */
export type FlashMode = "off" | "flash" | "torch";

export interface Settings {
  // time
  pattern: string;
  showWeekday: boolean;
  showTimezone: boolean;
  // appearance
  position: StampPosition;
  margin: number; // share of min(width, height)
  fontScale: number; // share of min(width, height)
  font: FontKey;
  color: string;
  outline: boolean;
  shadow: boolean;
  box: boolean;
  boxColor: string;
  boxOpacity: number;
  // extra content
  line1: string;
  line2: string;
  geoEnabled: boolean;
  coordFormat: CoordFormat;
  showAltitude: boolean;
  showAccuracy: boolean;
  addressEnabled: boolean;
  addressConsent: boolean;
  // capture
  facingMode: FacingMode;
  flashMode: FlashMode;
  resolution: Resolution;
  jpegQuality: number;
  timer: 0 | 3 | 10;
  grid: boolean;
  mirrorFront: boolean;
  /** copy every capture into the phone gallery (Android app only) */
  saveToGallery: boolean;
}

export const DEFAULTS: Settings = {
  pattern: "DD.MM.YYYY HH:mm:ss",
  showWeekday: false,
  showTimezone: false,

  position: "bottom-right",
  margin: 0.03,
  fontScale: 0.045,
  font: "sans",
  color: "#ffd400",
  outline: true,
  shadow: true,
  box: false,
  boxColor: "#000000",
  boxOpacity: 0.45,

  line1: "",
  line2: "",
  geoEnabled: false,
  coordFormat: "dec",
  showAltitude: false,
  showAccuracy: false,
  addressEnabled: false,
  addressConsent: false,

  facingMode: "environment",
  flashMode: "off",
  resolution: "1920x1080",
  jpegQuality: 0.92,
  timer: 0,
  grid: false,
  mirrorFront: true,
  saveToGallery: true,
};

export const FONT_STACKS: Record<FontKey, string> = {
  sans: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  condensed: '"Arial Narrow", "Roboto Condensed", "Segoe UI", sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"Roboto Mono", "Consolas", "Courier New", monospace',
};

export const FONT_LABELS: Record<FontKey, string> = {
  sans: "Serifenlos",
  condensed: "Schmal",
  serif: "Serif",
  mono: "Monospace",
};

export const POSITION_LABELS: Record<StampPosition, string> = {
  "top-left": "oben links",
  "top-center": "oben mittig",
  "top-right": "oben rechts",
  "middle-left": "mittig links",
  "middle-center": "Bildmitte",
  "middle-right": "mittig rechts",
  "bottom-left": "unten links",
  "bottom-center": "unten mittig",
  "bottom-right": "unten rechts",
};

export const RESOLUTIONS: { value: Resolution; label: string }[] = [
  { value: "1280x720", label: "HD · 1280 × 720" },
  { value: "1920x1080", label: "Full HD · 1920 × 1080" },
  { value: "2560x1440", label: "QHD · 2560 × 1440" },
  { value: "3840x2160", label: "4K · 3840 × 2160" },
];

export function resolutionSize(value: Resolution): { width: number; height: number } {
  const [width, height] = value.split("x").map(Number);
  return { width, height };
}

const STORAGE_KEY = "timestamp-camera:settings";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* private mode / quota — settings just stay session-local */
  }
}
