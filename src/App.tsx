import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useCallback, useEffect, useRef, useState } from "react";
import AddressConsentDialog from "./components/AddressConsentDialog";
import CameraView, { type CameraHandle, type CaptureResult } from "./components/CameraView";
import Gallery, { type GalleryHandle } from "./components/Gallery";
import SettingsSheet from "./components/SettingsSheet";
import { FLASH_LABELS, ShutterBar, TopBar, type CaptureMode } from "./components/Controls";
import type { CameraCapabilities } from "./lib/camera";
import type { FlashMode } from "./lib/settings";
import { addCapture, clearCaptures, deleteCapture, listCaptures, newId, type CaptureRecord } from "./lib/db";
import { canSaveToGallery, saveToGallery } from "./lib/gallery";
import { useGeolocation } from "./lib/geo";
import { isRecordingSupported } from "./lib/recorder";
import { useSettings } from "./state/settings";

const NO_CAPABILITIES: CameraCapabilities = { torch: false, zoom: null };

export default function App() {
  const { settings, update } = useSettings();
  const cameraRef = useRef<CameraHandle>(null);
  const galleryRef = useRef<GalleryHandle>(null);

  const [mode, setMode] = useState<CaptureMode>("photo");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordStartedAt, setRecordStartedAt] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);

  const [demo, setDemo] = useState(false);
  const [capabilities, setCapabilities] = useState<CameraCapabilities>(NO_CAPABILITIES);
  const [cameraCount, setCameraCount] = useState(0);
  const [actualFacing, setActualFacing] = useState<string | undefined>(undefined);
  // read inside callbacks that must not be re-created on every settings change
  const requestedFacingRef = useRef(settings.facingMode);
  requestedFacingRef.current = settings.facingMode;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0);

  const [items, setItems] = useState<CaptureRecord[]>([]);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [askAddressConsent, setAskAddressConsent] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // The hardware back button must walk our view hierarchy instead of killing
  // the app. The listener is registered once, so it reads live state via a ref.
  const backStateRef = useRef({ askAddressConsent: false, settingsOpen: false, galleryOpen: false });
  backStateRef.current = { askAddressConsent, settingsOpen, galleryOpen };

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const subscription = CapacitorApp.addListener("backButton", () => {
      const state = backStateRef.current;
      if (state.askAddressConsent) {
        setAskAddressConsent(false);
      } else if (state.settingsOpen) {
        setSettingsOpen(false);
      } else if (state.galleryOpen) {
        if (!galleryRef.current?.handleBack()) setGalleryOpen(false);
      } else {
        void CapacitorApp.minimizeApp();
      }
    });
    return () => {
      void subscription.then((s) => s.remove());
    };
  }, []);

  const { geo, status: geoStatus } = useGeolocation(settings.geoEnabled, settings.addressEnabled);
  const videoSupported = isRecordingSupported();
  // 0 means "not known yet" — only a confirmed single camera disables the button
  const canSwitchCamera = cameraCount !== 1;

  const refreshItems = useCallback(async () => {
    try {
      setItems(await listCaptures());
    } catch {
      setToast("Galerie konnte nicht gelesen werden.");
    }
  }, []);

  useEffect(() => {
    void refreshItems();
  }, [refreshItems]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2_800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setElapsedMs(Date.now() - recordStartedAt), 250);
    return () => window.clearInterval(timer);
  }, [recording, recordStartedAt]);

  const handleReady = useCallback(
    (info: { demo: boolean; capabilities: CameraCapabilities; facing?: string; cameraCount: number }) => {
      setDemo(info.demo);
      setCapabilities(info.capabilities);
      setCameraCount(info.cameraCount);
      setActualFacing(info.facing);
      setZoom(info.capabilities.zoom?.min ?? 0);
      // A fresh stream starts dark, so continuous light has to be re-armed
      // after a camera switch or the button would lie about its state.
      if (settingsRef.current.flashMode === "torch") {
        void cameraRef.current?.setTorch(true);
      }

      // A device may quietly hand back the camera that was already open. Say so
      // instead of leaving the switch button looking broken.
      if (!info.demo && info.facing && info.facing !== requestedFacingRef.current) {
        setToast(
          info.cameraCount < 2
            ? "Nur eine Kamera gefunden."
            : "Dieses Gerät lässt den Wechsel gerade nicht zu."
        );
      }
    },
    []
  );

  const store = useCallback(
    async (result: CaptureResult, kind: "photo" | "video") => {
      const record: CaptureRecord = {
        id: newId(),
        kind,
        blob: result.blob,
        thumb: result.thumb,
        filename: result.filename,
        createdAt: Date.now(),
        width: result.width,
        height: result.height,
        durationMs: result.durationMs,
        stampText: result.stampText,
      };
      await addCapture(record);
      setItems((prev) => [record, ...prev]);
      const what = kind === "photo" ? "Foto" : "Video";

      // The capture is safe in the app at this point. Copying it into the phone
      // gallery is a bonus that must never take the capture down with it.
      if (settingsRef.current.saveToGallery && canSaveToGallery()) {
        try {
          await saveToGallery(result.blob, result.filename, kind);
          setToast(`${what} in der Galerie gespeichert`);
        } catch (err) {
          const reason = err instanceof Error ? err.message : "unbekannter Fehler";
          setToast(`${what} gespeichert, aber nicht in der Galerie: ${reason}`);
        }
        return;
      }

      setToast(`${what} gespeichert`);
    },
    []
  );

  const runCountdown = (seconds: number) =>
    new Promise<void>((resolve) => {
      let left = seconds;
      setCountdown(left);
      const timer = window.setInterval(() => {
        left -= 1;
        if (left <= 0) {
          window.clearInterval(timer);
          setCountdown(null);
          resolve();
        } else {
          setCountdown(left);
        }
      }, 1_000);
    });

  const takePhoto = async () => {
    setBusy(true);
    try {
      if (settings.timer > 0) await runCountdown(settings.timer);
      const result = await cameraRef.current?.capturePhoto();
      if (result) await store(result, "photo");
      else setToast("Es liegt noch kein Kamerabild vor.");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Aufnahme fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };

  const startVideo = async () => {
    setBusy(true);
    try {
      if (settings.timer > 0) await runCountdown(settings.timer);
      await cameraRef.current?.startRecording();
      setRecordStartedAt(Date.now());
      setElapsedMs(0);
      setRecording(true);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Aufnahme konnte nicht gestartet werden.");
    } finally {
      setBusy(false);
    }
  };

  const stopVideo = async () => {
    setBusy(true);
    try {
      const result = await cameraRef.current?.stopRecording();
      setRecording(false);
      if (result) await store(result, "video");
    } catch (err) {
      setRecording(false);
      setToast(err instanceof Error ? err.message : "Aufnahme konnte nicht beendet werden.");
    } finally {
      setBusy(false);
    }
  };

  const handleShutter = () => {
    if (mode === "photo") void takePhoto();
    else if (recording) void stopVideo();
    else void startVideo();
  };

  // aus → Blitz bei Aufnahme → Dauerlicht → aus
  const cycleFlash = async () => {
    const next: FlashMode =
      settings.flashMode === "off" ? "flash" : settings.flashMode === "flash" ? "torch" : "off";

    // Only continuous light switches the lamp now; "flash" is armed for the next
    // capture and has to leave the lamp dark until the shutter fires.
    const result = await cameraRef.current?.setTorch(next === "torch");
    if (next === "torch" && !result?.ok) {
      // The detail comes from the failing layer (WebView or Android) and is the
      // only way to see from outside WHY a device refuses the light.
      setToast(`Licht nicht schaltbar${result?.detail ? ` — ${result.detail}` : ""}`);
      return;
    }
    update({ flashMode: next });
    setToast(FLASH_LABELS[next]);
  };

  // Address lookup needs coordinates, so switching it on switches GPS on too.
  const enableAddress = () => {
    if (settings.addressConsent) update({ addressEnabled: true, geoEnabled: true });
    else setAskAddressConsent(true);
  };

  const toggleAddress = () => {
    if (settings.addressEnabled) update({ addressEnabled: false });
    else enableAddress();
  };

  const handleDelete = async (id: string) => {
    await deleteCapture(id);
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleClearAll = async () => {
    await clearCaptures();
    setItems([]);
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-ink">
      <CameraView
        ref={cameraRef}
        settings={settings}
        geo={geo}
        zoom={zoom}
        onReady={handleReady}
        onError={setError}
      />

      <TopBar
        demo={demo}
        flashMode={settings.flashMode}
        onCycleFlash={() => void cycleFlash()}
        timer={settings.timer}
        onCycleTimer={() => update({ timer: settings.timer === 0 ? 3 : settings.timer === 3 ? 10 : 0 })}
        grid={settings.grid}
        onToggleGrid={() => update({ grid: !settings.grid })}
        geoEnabled={settings.geoEnabled}
        geoStatus={geoStatus}
        onToggleGeo={() => update({ geoEnabled: !settings.geoEnabled })}
        addressEnabled={settings.addressEnabled}
        onToggleAddress={toggleAddress}
        showMirror={(actualFacing ?? settings.facingMode) === "user"}
        mirror={settings.mirrorFront}
        onToggleMirror={() => update({ mirrorFront: !settings.mirrorFront })}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <ShutterBar
        mode={mode}
        onModeChange={setMode}
        onShutter={handleShutter}
        busy={busy}
        recording={recording}
        elapsedMs={elapsedMs}
        countdown={countdown}
        lastThumb={items[0]?.thumb ?? null}
        onOpenGallery={() => setGalleryOpen(true)}
        onSwitchCamera={() =>
          update({ facingMode: settings.facingMode === "environment" ? "user" : "environment" })
        }
        capabilities={capabilities}
        zoom={zoom}
        onZoomChange={setZoom}
        videoSupported={videoSupported}
        canSwitchCamera={canSwitchCamera}
      />

      {countdown !== null && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <span className="text-8xl font-bold text-white drop-shadow-lg">{countdown}</span>
        </div>
      )}

      {error && (
        <div className="pointer-events-none absolute inset-x-0 top-20 z-20 flex justify-center px-4">
          <p className="rounded-lg bg-amber-500/90 px-3 py-2 text-center text-xs font-medium text-black">
            {error}
          </p>
        </div>
      )}

      {toast && (
        <div className="pointer-events-none absolute inset-x-0 bottom-56 z-20 flex justify-center px-4">
          <p className="rounded-full bg-black/80 px-4 py-2 text-sm text-slate-100">{toast}</p>
        </div>
      )}

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        geo={geo}
        onEnableAddress={enableAddress}
        onDiagnoseTorch={async () =>
          (await cameraRef.current?.diagnoseTorch()) ?? "Keine Kamera aktiv."
        }
      />

      <AddressConsentDialog
        open={askAddressConsent}
        onCancel={() => setAskAddressConsent(false)}
        onConfirm={() => {
          update({ addressEnabled: true, addressConsent: true, geoEnabled: true });
          setAskAddressConsent(false);
        }}
      />

      <Gallery
        ref={galleryRef}
        open={galleryOpen}
        items={items}
        onClose={() => setGalleryOpen(false)}
        onDelete={(id) => void handleDelete(id)}
        onClearAll={() => void handleClearAll()}
      />
    </div>
  );
}
