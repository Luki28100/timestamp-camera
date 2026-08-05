import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import type { CaptureRecord } from "../lib/db";
import { formatBytes, formatDate, formatDuration } from "../lib/format";
import { canSaveToGallery, shareCapture } from "../lib/gallery";

interface Props {
  open: boolean;
  items: CaptureRecord[];
  onClose: () => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

export interface GalleryHandle {
  /** One step back inside the gallery (detail → grid). True if consumed. */
  handleBack: () => boolean;
}

function download(record: CaptureRecord): void {
  const url = URL.createObjectURL(record.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = record.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // give the browser a moment to start the download before dropping the blob url
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function share(record: CaptureRecord): Promise<void> {
  // Inside the Android app neither the web share API nor blob downloads exist —
  // the native share sheet is the only working path there.
  if (canSaveToGallery()) {
    await shareCapture(record.blob, record.filename);
    return;
  }

  const file = new File([record.blob], record.filename, { type: record.blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: record.filename });
      return;
    } catch {
      /* user cancelled — fall through to download */
    }
  }
  download(record);
}

const Gallery = forwardRef<GalleryHandle, Props>(function Gallery(
  { open, items, onClose, onDelete, onClearAll },
  ref
) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = items.find((item) => item.id === selectedId) ?? null;

  useImperativeHandle(ref, () => ({
    handleBack() {
      if (selectedId === null) return false;
      setSelectedId(null);
      return true;
    },
  }));

  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!selected) {
      setObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(selected.blob);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selected]);

  const totalBytes = useMemo(
    () => items.reduce((sum, item) => sum + item.blob.size, 0),
    [items]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-ink">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-700/70 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold">Galerie</h2>
          <p className="text-xs text-slate-400">
            {items.length} Aufnahmen · {formatBytes(totalBytes)} auf diesem Gerät
          </p>
        </div>
        <div className="flex gap-2">
          {items.length > 0 && (
            <button
              type="button"
              className="chip border-red-500/60 text-red-300"
              onClick={() => {
                if (confirm("Wirklich alle Aufnahmen löschen?")) {
                  onClearAll();
                  setSelectedId(null);
                }
              }}
            >
              Alle löschen
            </button>
          )}
          <button type="button" className="chip" onClick={onClose}>
            Zurück
          </button>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-8 text-center text-sm text-slate-400">
          Noch keine Aufnahmen. Alles, was du aufnimmst, bleibt lokal auf diesem Gerät.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className="relative aspect-square overflow-hidden rounded-lg border border-slate-700 bg-slate-800"
              >
                {item.thumb ? (
                  <img src={item.thumb} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs text-slate-400">kein Vorschaubild</span>
                )}
                {item.kind === "video" && (
                  <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px]">
                    {item.durationMs ? formatDuration(item.durationMs) : "Video"}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-40 flex flex-col bg-black/95">
          <div className="flex shrink-0 items-center justify-between px-5 py-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{selected.filename}</p>
              <p className="text-xs text-slate-400">
                {formatDate(new Date(selected.createdAt), "dddd[, ]DD.MM.YYYY HH:mm:ss")} ·{" "}
                {selected.width} × {selected.height} · {formatBytes(selected.blob.size)}
              </p>
            </div>
            <button type="button" className="chip" onClick={() => setSelectedId(null)}>
              Schließen
            </button>
          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center p-3">
            {objectUrl &&
              (selected.kind === "video" ? (
                <video src={objectUrl} controls playsInline className="max-h-full max-w-full" />
              ) : (
                <img src={objectUrl} alt={selected.stampText} className="max-h-full max-w-full" />
              ))}
          </div>

          <div className="flex shrink-0 justify-center gap-2 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
            {/* In the app every capture already lands in the phone gallery, so a
                separate save button would be noise; in the browser it is the only
                way to get the file out. */}
            {!canSaveToGallery() && (
              <button type="button" className="chip" onClick={() => download(selected)}>
                Speichern
              </button>
            )}
            <button
              type="button"
              className="chip"
              onClick={() => {
                void share(selected).catch((err) => {
                  alert(err instanceof Error ? err.message : "Teilen fehlgeschlagen.");
                });
              }}
            >
              Teilen
            </button>
            <button
              type="button"
              className="chip border-red-500/60 text-red-300"
              onClick={() => {
                if (confirm("Diese Aufnahme löschen?")) {
                  onDelete(selected.id);
                  setSelectedId(null);
                }
              }}
            >
              Löschen
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

export default Gallery;
