import { useEffect, useRef, useState, type ReactNode } from "react";
import { FORMAT_PRESETS } from "../lib/format";
import { canSaveToGallery } from "../lib/gallery";
import type { GeoInfo } from "../lib/geo";
import {
  FONT_LABELS,
  POSITION_LABELS,
  RESOLUTIONS,
  type FontKey,
  type StampPosition,
} from "../lib/settings";
import { buildStampLines, drawStamp } from "../lib/stamp";
import { useSettings } from "../state/settings";

const POSITION_GRID: StampPosition[] = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "middle-center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-slate-700/70 px-5 py-5 first:border-t-0">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-stamp">{title}</h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-center justify-between gap-4 ${disabled ? "opacity-50" : ""}`}>
      <span>
        <span className="block text-sm text-slate-200">{label}</span>
        {hint && <span className="block text-xs text-slate-400">{hint}</span>}
      </span>
      <input
        type="checkbox"
        className="h-5 w-5 shrink-0 accent-[#ffd400]"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="field-label mb-0">{label}</span>
        <span className="text-xs text-slate-400">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

/** Live sample of the stamp on a neutral background. */
function StampPreview({ geo }: { geo: GeoInfo | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { settings } = useSettings();

  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, "#334155");
      gradient.addColorStop(1, "#0f172a");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      drawStamp(ctx, canvas.width, canvas.height, buildStampLines(settings, new Date(), geo), settings);
    };

    draw();
    const timer = window.setInterval(draw, 250);
    return () => window.clearInterval(timer);
  }, [settings, geo]);

  return (
    <canvas
      ref={canvasRef}
      width={640}
      height={360}
      className="w-full rounded-lg border border-slate-700"
    />
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  geo: GeoInfo | null;
  /** owned by App so the top-bar shortcut and this sheet share one consent flow */
  onEnableAddress: () => void;
  onDiagnoseTorch: () => Promise<string>;
}

export default function SettingsSheet({
  open,
  onClose,
  geo,
  onEnableAddress,
  onDiagnoseTorch,
}: Props) {
  const { settings, update, reset } = useSettings();
  const galleryAvailable = canSaveToGallery();
  const [diagnosis, setDiagnosis] = useState<string | null>(null);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-black/70">
      <button type="button" className="h-14 w-full shrink-0" onClick={onClose} aria-label="Schließen" />

      <div className="flex min-h-0 flex-1 flex-col rounded-t-2xl bg-panel">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-700/70 px-5 py-4">
          <h2 className="text-base font-semibold">Einstellungen</h2>
          <button type="button" className="chip" onClick={onClose}>
            Fertig
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="px-5 pt-5">
            <StampPreview geo={geo} />
          </div>

          <Section title="Zeitstempel">
            <div>
              <span className="field-label">Format</span>
              <div className="flex flex-wrap gap-2">
                {FORMAT_PRESETS.map((preset) => (
                  <button
                    key={preset.pattern}
                    type="button"
                    className={`chip ${settings.pattern === preset.pattern ? "chip-active" : ""}`}
                    onClick={() => update({ pattern: preset.pattern })}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="field-label" htmlFor="pattern">
                Eigenes Muster
              </label>
              <input
                id="pattern"
                className="input font-mono"
                value={settings.pattern}
                onChange={(e) => update({ pattern: e.target.value })}
              />
              <p className="mt-1 text-xs text-slate-400">
                YYYY Jahr · MM Monat · DD Tag · dddd Wochentag · HH:mm:ss Zeit · A AM/PM · Z Zeitzone ·
                [Text] bleibt wörtlich
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Taktisch: MON Monat als JAN…DEC · X NATO-Zonenbuchstabe (A = UTC+1, also Winterzeit ·
                B = UTC+2, also Sommerzeit · Z = UTC) · ein führendes ! rechnet das ganze Muster auf
                UTC um
              </p>
            </div>

            <Toggle
              label="Wochentag voranstellen"
              checked={settings.showWeekday}
              onChange={(showWeekday) => update({ showWeekday })}
            />
            <Toggle
              label="Zeitzone anhängen"
              hint="z. B. GMT+2"
              checked={settings.showTimezone}
              onChange={(showTimezone) => update({ showTimezone })}
            />
          </Section>

          <Section title="Darstellung">
            <div>
              <span className="field-label">Position</span>
              <div className="grid w-40 grid-cols-3 gap-1.5">
                {POSITION_GRID.map((position) => (
                  <button
                    key={position}
                    type="button"
                    title={POSITION_LABELS[position]}
                    aria-label={POSITION_LABELS[position]}
                    onClick={() => update({ position })}
                    className={`h-10 rounded border ${
                      settings.position === position
                        ? "border-stamp bg-stamp/20"
                        : "border-slate-600 bg-slate-800"
                    }`}
                  >
                    <span
                      className={`mx-auto block h-1.5 w-6 rounded-full ${
                        settings.position === position ? "bg-stamp" : "bg-slate-500"
                      }`}
                    />
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-400">{POSITION_LABELS[settings.position]}</p>
            </div>

            <Slider
              label="Schriftgröße"
              value={settings.fontScale}
              min={0.02}
              max={0.09}
              step={0.005}
              display={`${Math.round(settings.fontScale * 1000) / 10} % der Bildhöhe`}
              onChange={(fontScale) => update({ fontScale })}
            />

            <Slider
              label="Randabstand"
              value={settings.margin}
              min={0}
              max={0.12}
              step={0.005}
              display={`${Math.round(settings.margin * 1000) / 10} %`}
              onChange={(margin) => update({ margin })}
            />

            <div>
              <span className="field-label">Schriftart</span>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(FONT_LABELS) as FontKey[]).map((font) => (
                  <button
                    key={font}
                    type="button"
                    className={`chip ${settings.font === font ? "chip-active" : ""}`}
                    onClick={() => update({ font })}
                  >
                    {FONT_LABELS[font]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="field-label mb-0">Textfarbe</span>
              <input
                type="color"
                value={settings.color}
                onChange={(e) => update({ color: e.target.value })}
                aria-label="Textfarbe"
              />
            </div>

            <Toggle
              label="Schwarze Kontur"
              hint="hält den Text auf hellem Hintergrund lesbar"
              checked={settings.outline}
              onChange={(outline) => update({ outline })}
            />
            <Toggle
              label="Schlagschatten"
              checked={settings.shadow}
              onChange={(shadow) => update({ shadow })}
            />
            <Toggle
              label="Hintergrundbox"
              checked={settings.box}
              onChange={(box) => update({ box })}
            />

            {settings.box && (
              <div className="space-y-4 rounded-lg border border-slate-700 p-3">
                <div className="flex items-center justify-between">
                  <span className="field-label mb-0">Boxfarbe</span>
                  <input
                    type="color"
                    value={settings.boxColor}
                    onChange={(e) => update({ boxColor: e.target.value })}
                    aria-label="Boxfarbe"
                  />
                </div>
                <Slider
                  label="Deckkraft"
                  value={settings.boxOpacity}
                  min={0.1}
                  max={1}
                  step={0.05}
                  display={`${Math.round(settings.boxOpacity * 100)} %`}
                  onChange={(boxOpacity) => update({ boxOpacity })}
                />
              </div>
            )}
          </Section>

          <Section title="Zusätzlicher Text">
            <div>
              <label className="field-label" htmlFor="line1">
                Zeile 1
              </label>
              <input
                id="line1"
                className="input"
                placeholder="z. B. Projekt oder Name"
                value={settings.line1}
                onChange={(e) => update({ line1: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="line2">
                Zeile 2
              </label>
              <input
                id="line2"
                className="input"
                placeholder="z. B. Auftragsnummer"
                value={settings.line2}
                onChange={(e) => update({ line2: e.target.value })}
              />
            </div>
          </Section>

          <Section title="Standort">
            <Toggle
              label="Standort im Stempel"
              hint="GPS bleibt auf dem Gerät"
              checked={settings.geoEnabled}
              onChange={(geoEnabled) => update({ geoEnabled })}
            />

            {settings.geoEnabled && (
              <>
                <div>
                  <span className="field-label">Koordinatenformat</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={`chip ${settings.coordFormat === "dec" ? "chip-active" : ""}`}
                      onClick={() => update({ coordFormat: "dec" })}
                    >
                      48.137400, 11.575000
                    </button>
                    <button
                      type="button"
                      className={`chip ${settings.coordFormat === "dms" ? "chip-active" : ""}`}
                      onClick={() => update({ coordFormat: "dms" })}
                    >
                      48°08&apos;14.6&quot;N
                    </button>
                  </div>
                </div>

                <Toggle
                  label="Höhe anzeigen"
                  checked={settings.showAltitude}
                  onChange={(showAltitude) => update({ showAltitude })}
                />
                <Toggle
                  label="Genauigkeit anzeigen"
                  hint="z. B. ±8 m"
                  checked={settings.showAccuracy}
                  onChange={(showAccuracy) => update({ showAccuracy })}
                />
                <Toggle
                  label="Adresse auflösen"
                  hint="sendet die Koordinaten an OpenStreetMap"
                  checked={settings.addressEnabled}
                  onChange={(value) => (value ? onEnableAddress() : update({ addressEnabled: false }))}
                />
              </>
            )}
          </Section>

          <Section title="Aufnahme">
            <div>
              <label className="field-label" htmlFor="resolution">
                Auflösung
              </label>
              <select
                id="resolution"
                className="input"
                value={settings.resolution}
                onChange={(e) => update({ resolution: e.target.value as typeof settings.resolution })}
              >
                {RESOLUTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-400">
                Wunschwert — die Kamera wählt die nächstbeste unterstützte Auflösung.
              </p>
            </div>

            <Slider
              label="JPEG-Qualität"
              value={settings.jpegQuality}
              min={0.5}
              max={1}
              step={0.02}
              display={`${Math.round(settings.jpegQuality * 100)} %`}
              onChange={(jpegQuality) => update({ jpegQuality })}
            />

            <div>
              <span className="field-label">Selbstauslöser</span>
              <div className="flex gap-2">
                {([0, 3, 10] as const).map((timer) => (
                  <button
                    key={timer}
                    type="button"
                    className={`chip ${settings.timer === timer ? "chip-active" : ""}`}
                    onClick={() => update({ timer })}
                  >
                    {timer === 0 ? "aus" : `${timer} s`}
                  </button>
                ))}
              </div>
            </div>

            <Toggle
              label="In Handygalerie speichern"
              hint={
                galleryAvailable
                  ? "Aufnahmen landen zusätzlich im Album „Zeitstempel-Kamera“"
                  : "nur in der Android-App verfügbar; im Browser über „Speichern“ in der Galerie der App"
              }
              checked={settings.saveToGallery}
              disabled={!galleryAvailable}
              onChange={(saveToGallery) => update({ saveToGallery })}
            />

            <Toggle label="Gitternetz" checked={settings.grid} onChange={(grid) => update({ grid })} />
            <Toggle
              label="Frontkamera spiegeln"
              hint="Selfie wie im Spiegel; der Stempel bleibt lesbar"
              checked={settings.mirrorFront}
              onChange={(mirrorFront) => update({ mirrorFront })}
            />
          </Section>

          <Section title="Blitz-Diagnose">
            <p className="text-xs text-slate-400">
              Schaltet den Blitz testweise über beide Wege und zeigt, was das Gerät dabei zurückmeldet.
              Der Blitz blitzt dabei kurz auf, falls er funktioniert.
            </p>
            <button
              type="button"
              className="w-full rounded-lg border border-slate-600 px-4 py-2.5 text-sm"
              onClick={() => {
                setDiagnosis("läuft …");
                void onDiagnoseTorch()
                  .then(setDiagnosis)
                  .catch((err) => setDiagnosis(err instanceof Error ? err.message : String(err)));
              }}
            >
              Blitz prüfen
            </button>
            {diagnosis && (
              <>
                <pre className="max-h-60 overflow-auto rounded-lg border border-slate-700 bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-200">
                  {diagnosis}
                </pre>
                <button
                  type="button"
                  className="chip"
                  onClick={() => void navigator.clipboard?.writeText(diagnosis)}
                >
                  Text kopieren
                </button>
              </>
            )}
          </Section>

          <Section title="Zurücksetzen">
            <button
              type="button"
              className="w-full rounded-lg border border-red-500/60 px-4 py-2.5 text-sm text-red-300"
              onClick={() => {
                if (confirm("Alle Einstellungen auf die Standardwerte zurücksetzen?")) reset();
              }}
            >
              Einstellungen zurücksetzen
            </button>
          </Section>
        </div>
      </div>
    </div>
  );
}
