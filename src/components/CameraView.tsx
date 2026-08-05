import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  countVideoInputs,
  createDemoStream,
  facingOf,
  openCamera,
  openMicrophone,
  readCapabilities,
  setZoom,
  stopStream,
  type CameraCapabilities,
  type DemoStream,
} from "../lib/camera";
import { StampRecorder, extensionFor } from "../lib/recorder";
import { switchTorch, torchDiagnosis, type TorchResult } from "../lib/torch";
import { buildStampLines, drawStamp } from "../lib/stamp";
import { fileStamp } from "../lib/format";
import type { GeoInfo } from "../lib/geo";
import type { Settings } from "../lib/settings";

export interface CaptureResult {
  blob: Blob;
  thumb: string;
  filename: string;
  width: number;
  height: number;
  stampText: string;
  durationMs?: number;
}

export interface CameraHandle {
  capturePhoto: () => Promise<CaptureResult | null>;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<CaptureResult | null>;
  setTorch: (on: boolean) => Promise<TorchResult>;
  diagnoseTorch: () => Promise<string>;
}

interface Props {
  settings: Settings;
  geo: GeoInfo | null;
  zoom: number;
  onReady: (info: {
    demo: boolean;
    capabilities: CameraCapabilities;
    /** what the opened camera reports — may differ from what was requested */
    facing?: string;
    cameraCount: number;
  }) => void;
  onError: (message: string | null) => void;
}

const THUMB_WIDTH = 320;

/**
 * How long the light burns before the shutter fires. The sensor needs a moment
 * to re-meter for the sudden brightness; capturing right away yields a frame
 * still exposed for the dark scene.
 */
const FLASH_WARMUP_MS = 550;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function makeThumb(source: HTMLCanvasElement): string {
  const scale = THUMB_WIDTH / source.width;
  const thumb = document.createElement("canvas");
  thumb.width = THUMB_WIDTH;
  thumb.height = Math.max(1, Math.round(source.height * scale));
  const ctx = thumb.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(source, 0, 0, thumb.width, thumb.height);
  return thumb.toDataURL("image/jpeg", 0.6);
}

/**
 * Owns the camera stream and the render loop. The visible canvas *is* the
 * preview and also the source for photos and recordings, so preview and file
 * can never drift apart.
 */
const CameraView = forwardRef<CameraHandle, Props>(function CameraView(
  { settings, geo, zoom, onReady, onError },
  ref
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const demoRef = useRef<DemoStream | null>(null);
  const recorderRef = useRef(new StampRecorder());
  const stampTextRef = useRef("");

  // Stamp overlay, re-rendered only when it actually changes (once a second).
  const stampCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stampKeyRef = useRef("");
  // Downscaled canvas the recorder reads from.
  const recordCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const recordingRef = useRef(false);
  const frameCountRef = useRef(0);

  // The render loop must always see current values without being re-created.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const geoRef = useRef(geo);
  geoRef.current = geo;

  const renderFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) return;

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const current = settingsRef.current;

    ctx.save();
    if (current.mirrorFront && current.facingMode === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    // The stamp's outline and shadow are expensive to rasterise, and on phones
    // doing that 30 times a second starves the video encoder. The text only
    // changes once a second, so it is drawn to an offscreen canvas exactly then
    // and cheaply blitted every frame. Drawn after restore(), so never mirrored.
    const lines = buildStampLines(current, new Date(), geoRef.current);
    stampTextRef.current = lines.map((line) => line.text).join(" | ");
    const stampKey = `${canvas.width}x${canvas.height}|${JSON.stringify(current)}|${stampTextRef.current}`;
    if (stampKey !== stampKeyRef.current) {
      stampKeyRef.current = stampKey;
      let stamp = stampCanvasRef.current;
      if (!stamp) stamp = stampCanvasRef.current = document.createElement("canvas");
      if (stamp.width !== canvas.width || stamp.height !== canvas.height) {
        stamp.width = canvas.width;
        stamp.height = canvas.height;
      }
      const stampCtx = stamp.getContext("2d");
      if (stampCtx) {
        stampCtx.clearRect(0, 0, stamp.width, stamp.height);
        drawStamp(stampCtx, stamp.width, stamp.height, lines, current);
      }
    }
    if (stampCanvasRef.current) ctx.drawImage(stampCanvasRef.current, 0, 0);

    // While recording, mirror the finished frame into the (possibly downscaled)
    // canvas the MediaRecorder captures from.
    const record = recordCanvasRef.current;
    if (recordingRef.current && record) {
      frameCountRef.current += 1;
      record.getContext("2d")?.drawImage(canvas, 0, 0, record.width, record.height);
    }
  };

  // Keep the loop alive for the lifetime of the component.
  useEffect(() => {
    let frameId = 0;
    let lastRenderAt = 0;

    const render = () => {
      lastRenderAt = performance.now();
      renderFrame();
    };
    const tick = () => {
      render();
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);

    // requestAnimationFrame stops entirely while the page is hidden (app in the
    // background, screen off), which would freeze a running recording on its
    // last frame. This watchdog keeps the picture — and the clock burnt into
    // it — moving even then.
    const watchdog = window.setInterval(() => {
      if (performance.now() - lastRenderAt > 200) render();
    }, 100);

    return () => {
      cancelAnimationFrame(frameId);
      window.clearInterval(watchdog);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (Re-)open the camera whenever the requested camera or resolution changes.
  useEffect(() => {
    let cancelled = false;

    const attach = async (stream: MediaStream, demo: boolean) => {
      if (cancelled) {
        stopStream(stream);
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        void video.play().catch(() => {
          /* autoplay policies — the muted inline video normally starts fine */
        });
      }

      const cameraCount = demo ? 1 : await countVideoInputs();
      if (cancelled) return;
      const report = () =>
        onReady({
          demo,
          capabilities: demo ? { torch: false, zoom: null } : readCapabilities(stream),
          facing: demo ? undefined : facingOf(stream),
          cameraCount,
        });
      report();
      // getCapabilities() is often still empty right after getUserMedia — the
      // engine fills in torch/zoom once the track is running. Read again later,
      // otherwise the torch button stays dead on devices that do support it.
      if (!demo) {
        window.setTimeout(() => {
          if (!cancelled) report();
        }, 1_200);
      }
    };

    const start = async () => {
      try {
        const stream = await openCamera({
          facingMode: settings.facingMode,
          resolution: settings.resolution,
        });
        onError(null);
        await attach(stream, false);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Kamera konnte nicht geöffnet werden.";
        onError(`${message} Es läuft ein Demobild.`);
        const demo = createDemoStream();
        demoRef.current = demo;
        await attach(demo.stream, true);
      }
    };

    void start();

    return () => {
      cancelled = true;
      stopStream(streamRef.current);
      streamRef.current = null;
      demoRef.current?.stop();
      demoRef.current = null;
      // The native torch outlives the stream — never leave the LED burning
      // after a camera switch or when the view goes away.
      void switchTorch(null, false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.facingMode, settings.resolution]);

  useEffect(() => {
    if (zoom > 0) void setZoom(streamRef.current, zoom);
  }, [zoom]);

  useEffect(() => {
    const recorder = recorderRef.current;
    return () => recorder.cancel();
  }, []);

  useImperativeHandle(ref, () => ({
    async capturePhoto() {
      const canvas = canvasRef.current;
      if (!canvas || !canvas.width) return null;

      // Fire the light for this one shot. A failure here must not cost the
      // photo — a dark picture beats no picture.
      const fireFlash = settingsRef.current.flashMode === "flash";
      if (fireFlash) {
        await switchTorch(streamRef.current, true);
        await wait(FLASH_WARMUP_MS);
      }

      try {
        renderFrame(); // guarantee the freshest frame and second

        // Read these before awaiting — the render loop keeps running and would
        // otherwise overwrite the stamp text belonging to this exact frame.
        const current = settingsRef.current;
        const stampText = stampTextRef.current;
        const thumb = makeThumb(canvas);
        const filename = `TS_${fileStamp(new Date())}.jpg`;

        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", current.jpegQuality)
        );
        if (!blob) return null;

        return { blob, thumb, filename, width: canvas.width, height: canvas.height, stampText };
      } finally {
        if (fireFlash) await switchTorch(streamRef.current, false);
      }
    },

    async setTorch(on: boolean) {
      return switchTorch(streamRef.current, on);
    },

    async diagnoseTorch() {
      return torchDiagnosis(streamRef.current);
    },

    async startRecording() {
      const canvas = canvasRef.current;
      if (!canvas || !canvas.width) throw new Error("Kein Bild zum Aufnehmen.");

      // Photos keep the full sensor resolution, but real-time video encoding
      // above ~720p overwhelms phone encoders (the result: a slideshow). Record
      // from a capped copy instead; the preview stays untouched.
      const scale = Math.min(1, 1280 / Math.max(canvas.width, canvas.height));
      let record = recordCanvasRef.current;
      if (!record) record = recordCanvasRef.current = document.createElement("canvas");
      record.width = Math.round((canvas.width * scale) / 2) * 2; // encoders want even sizes
      record.height = Math.round((canvas.height * scale) / 2) * 2;
      record.getContext("2d")?.drawImage(canvas, 0, 0, record.width, record.height);

      // A one-shot flash makes no sense for video — the light stays on for the
      // whole clip and goes off again when the recording stops.
      if (settingsRef.current.flashMode === "flash") {
        await switchTorch(streamRef.current, true);
      }

      const audio = await openMicrophone();
      frameCountRef.current = 0;
      recordingRef.current = true;
      recorderRef.current.start(record, audio);
    },

    async stopRecording() {
      const recorder = recorderRef.current;
      if (!recorder.isRecording) return null;
      recordingRef.current = false;
      if (settingsRef.current.flashMode === "flash") {
        await switchTorch(streamRef.current, false);
      }
      const durationMs = recorder.elapsedMs;
      const frames = frameCountRef.current;
      const blob = await recorder.stop();
      const canvas = canvasRef.current;

      // A slideshow instead of a video means the encoder starved. Better to say
      // so than to let the user find out in the gallery.
      const fps = frames / Math.max(durationMs / 1000, 0.001);
      if (durationMs > 1500 && fps < 5) {
        console.warn(`Aufnahme lieferte nur ${fps.toFixed(1)} fps (${frames} Frames in ${durationMs} ms)`);
      }

      const record = recordCanvasRef.current;
      return {
        blob,
        thumb: canvas ? makeThumb(canvas) : "",
        filename: `TS_${fileStamp(new Date())}.${extensionFor(recorder.mime)}`,
        width: record?.width ?? canvas?.width ?? 0,
        height: record?.height ?? canvas?.height ?? 0,
        stampText: stampTextRef.current,
        durationMs,
      };
    },
  }));

  return (
    <div className="flex h-full w-full items-center justify-center bg-black">
      <video ref={videoRef} className="hidden" playsInline muted autoPlay />

      {/* The canvas keeps its own aspect ratio via max-width/max-height, and the
          wrapper shrink-wraps it — so the grid overlay lines up with the picture
          exactly, without ever being drawn into the captured frame. */}
      <div className="relative inline-flex max-h-full max-w-full">
        <canvas ref={canvasRef} className="max-h-full max-w-full" />

        {settings.grid && (
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/3 top-0 h-full w-px bg-white/30" />
            <div className="absolute left-2/3 top-0 h-full w-px bg-white/30" />
            <div className="absolute left-0 top-1/3 h-px w-full bg-white/30" />
            <div className="absolute left-0 top-2/3 h-px w-full bg-white/30" />
          </div>
        )}
      </div>
    </div>
  );
});

export default CameraView;
