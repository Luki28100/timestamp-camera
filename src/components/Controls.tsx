import type { CameraCapabilities } from "../lib/camera";
import { formatDuration } from "../lib/format";
import { GEO_STATUS_LABEL, type GeoStatus } from "../lib/geo";
import type { FlashMode } from "../lib/settings";

export type CaptureMode = "photo" | "video";

export const FLASH_LABELS: Record<FlashMode, string> = {
  off: "Blitz aus",
  flash: "Blitz bei Aufnahme",
  torch: "Dauerlicht",
};

/* ---------- icons ---------- */

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-5 w-5",
};

const GearIcon = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const FlashIcon = () => (
  <svg {...iconProps}>
    <path d="M13 2 3 14h9l-1 8 10-12h-9z" />
  </svg>
);

const FlashOffIcon = () => (
  <svg {...iconProps}>
    <path d="M13 2 3 14h9l-1 8 10-12h-9z" />
    <path d="M3 3l18 18" />
  </svg>
);

const TorchIcon = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="13" r="3.5" />
    <path d="M12 3v2M5.2 6.2l1.4 1.4M18.8 6.2l-1.4 1.4M3 13h2M19 13h2M6.6 18.4l1.4-1.4M17.4 18.4l-1.4-1.4M12 21v-2" />
  </svg>
);

const TimerIcon = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2 2M9 2h6" />
  </svg>
);

const GridIcon = () => (
  <svg {...iconProps}>
    <path d="M3 3h18v18H3z M9 3v18 M15 3v18 M3 9h18 M3 15h18" />
  </svg>
);

const PinIcon = () => (
  <svg {...iconProps}>
    <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);

const MirrorIcon = () => (
  <svg {...iconProps}>
    <path d="M12 3v18" strokeDasharray="3 2.5" />
    <path d="M9 7 4 12l5 5z" />
    <path d="M15 7l5 5-5 5z" />
  </svg>
);

const HouseIcon = () => (
  <svg {...iconProps}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5.5 9.5V20h13V9.5" />
    <path d="M10 20v-5h4v5" />
  </svg>
);

const SwitchIcon = () => (
  <svg {...iconProps}>
    <path d="M4 8a8 8 0 0 1 13.7-5.6L20 5" />
    <path d="M20 16A8 8 0 0 1 6.3 21.6L4 19" />
    <path d="M20 2v4h-4M4 22v-4h4" />
  </svg>
);

/* ---------- top bar ---------- */

interface TopBarProps {
  demo: boolean;
  flashMode: FlashMode;
  onCycleFlash: () => void;
  timer: 0 | 3 | 10;
  onCycleTimer: () => void;
  grid: boolean;
  onToggleGrid: () => void;
  geoEnabled: boolean;
  geoStatus: GeoStatus;
  onToggleGeo: () => void;
  addressEnabled: boolean;
  onToggleAddress: () => void;
  /** only meaningful while the front camera is running */
  showMirror: boolean;
  mirror: boolean;
  onToggleMirror: () => void;
  onOpenSettings: () => void;
}

export function TopBar({
  demo,
  flashMode,
  onCycleFlash,
  timer,
  onCycleTimer,
  grid,
  onToggleGrid,
  geoEnabled,
  geoStatus,
  onToggleGeo,
  addressEnabled,
  onToggleAddress,
  showMirror,
  mirror,
  onToggleMirror,
  onOpenSettings,
}: TopBarProps) {
  const toggleClass = (active: boolean) =>
    `icon-btn ${active ? "bg-stamp/25 text-stamp" : ""}`;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-3">
      <div className="pointer-events-auto flex flex-wrap items-center gap-2">
        {/* Not gated on capabilities.torch: engines often report it late or not
            at all. Switching itself asks the camera and reports failure. */}
        <button
          type="button"
          className={toggleClass(flashMode !== "off")}
          onClick={onCycleFlash}
          disabled={demo}
          title={FLASH_LABELS[flashMode]}
          aria-label={`Blitz: ${FLASH_LABELS[flashMode]}`}
        >
          {flashMode === "off" ? <FlashOffIcon /> : flashMode === "flash" ? <FlashIcon /> : <TorchIcon />}
        </button>

        <button
          type="button"
          className={`relative ${toggleClass(timer > 0)}`}
          onClick={onCycleTimer}
          title="Selbstauslöser"
          aria-label={`Selbstauslöser ${timer} Sekunden`}
        >
          <TimerIcon />
          {timer > 0 && (
            <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-stamp px-1 text-[10px] font-bold text-black">
              {timer}
            </span>
          )}
        </button>

        <button
          type="button"
          className={toggleClass(grid)}
          onClick={onToggleGrid}
          title="Gitternetz"
          aria-label="Gitternetz"
        >
          <GridIcon />
        </button>

        <button
          type="button"
          className={toggleClass(geoEnabled)}
          onClick={onToggleGeo}
          title="Standort im Stempel"
          aria-label="Standort"
        >
          <PinIcon />
        </button>

        <button
          type="button"
          className={toggleClass(addressEnabled)}
          onClick={onToggleAddress}
          title="Adresse auflösen (sendet Koordinaten an OpenStreetMap)"
          aria-label="Adresse auflösen"
        >
          <HouseIcon />
        </button>

        {showMirror && (
          <button
            type="button"
            className={toggleClass(mirror)}
            onClick={onToggleMirror}
            title="Selfie spiegeln"
            aria-label="Bild spiegeln"
          >
            <MirrorIcon />
          </button>
        )}
      </div>

      <div className="pointer-events-auto flex items-center gap-2">
        {demo && (
          <span className="rounded-full bg-amber-500/90 px-2.5 py-1 text-[11px] font-semibold text-black">
            Demobild
          </span>
        )}
        {geoEnabled && (
          <span className="rounded-full bg-black/50 px-2.5 py-1 text-[11px] text-slate-200 backdrop-blur">
            GPS: {GEO_STATUS_LABEL[geoStatus]}
          </span>
        )}
        <button type="button" className="icon-btn" onClick={onOpenSettings} aria-label="Einstellungen">
          <GearIcon />
        </button>
      </div>
    </div>
  );
}

/* ---------- bottom bar ---------- */

interface ShutterBarProps {
  mode: CaptureMode;
  onModeChange: (mode: CaptureMode) => void;
  onShutter: () => void;
  busy: boolean;
  recording: boolean;
  elapsedMs: number;
  countdown: number | null;
  lastThumb: string | null;
  onOpenGallery: () => void;
  onSwitchCamera: () => void;
  capabilities: CameraCapabilities;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  videoSupported: boolean;
  canSwitchCamera: boolean;
}

export function ShutterBar({
  mode,
  onModeChange,
  onShutter,
  busy,
  recording,
  elapsedMs,
  countdown,
  lastThumb,
  onOpenGallery,
  onSwitchCamera,
  capabilities,
  zoom,
  onZoomChange,
  videoSupported,
  canSwitchCamera,
}: ShutterBarProps) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/85 to-transparent pb-[max(1rem,env(safe-area-inset-bottom))] pt-6">
      {capabilities.zoom && (
        <div className="mx-auto mb-4 flex w-56 items-center gap-2 text-xs text-slate-300">
          <span>1×</span>
          <input
            type="range"
            min={capabilities.zoom.min}
            max={capabilities.zoom.max}
            step={capabilities.zoom.step}
            value={zoom || capabilities.zoom.min}
            onChange={(e) => onZoomChange(Number(e.target.value))}
            aria-label="Zoom"
          />
          <span>{capabilities.zoom.max}×</span>
        </div>
      )}

      <div className="mb-4 flex justify-center gap-2">
        <button
          type="button"
          className={`chip ${mode === "photo" ? "chip-active" : ""}`}
          onClick={() => onModeChange("photo")}
          disabled={recording}
        >
          Foto
        </button>
        <button
          type="button"
          className={`chip ${mode === "video" ? "chip-active" : ""}`}
          onClick={() => onModeChange("video")}
          disabled={recording || !videoSupported}
          title={videoSupported ? undefined : "Dieser Browser kann kein Video aufnehmen"}
        >
          Video
        </button>
      </div>

      {recording && (
        <div className="mb-3 flex items-center justify-center gap-2 text-sm font-medium text-red-400">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
          {formatDuration(elapsedMs)}
        </div>
      )}

      <div className="flex items-center justify-around px-6">
        <button
          type="button"
          onClick={onOpenGallery}
          className="h-12 w-12 overflow-hidden rounded-xl border border-white/30 bg-white/10"
          aria-label="Galerie"
        >
          {lastThumb ? (
            <img src={lastThumb} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-[10px] text-slate-300">leer</span>
          )}
        </button>

        <button
          type="button"
          onClick={onShutter}
          disabled={busy || countdown !== null}
          className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white/90 disabled:opacity-60"
          aria-label={recording ? "Aufnahme beenden" : mode === "video" ? "Aufnahme starten" : "Auslösen"}
        >
          <span
            className={
              recording
                ? "h-7 w-7 rounded-md bg-red-500"
                : mode === "video"
                  ? "h-14 w-14 rounded-full bg-red-500"
                  : "h-14 w-14 rounded-full bg-white"
            }
          />
        </button>

        <button
          type="button"
          onClick={onSwitchCamera}
          className="icon-btn disabled:opacity-40"
          disabled={!canSwitchCamera || recording}
          title={canSwitchCamera ? "Kamera wechseln" : "Nur eine Kamera verfügbar"}
          aria-label="Kamera wechseln"
        >
          <SwitchIcon />
        </button>
      </div>
    </div>
  );
}
