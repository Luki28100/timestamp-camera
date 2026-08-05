import { resolutionSize, type FacingMode, type Resolution } from "./settings";

// Torch and zoom are not in the TS DOM lib yet, but every Chromium-based mobile
// browser exposes them on the video track.
interface ExtendedCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
  zoom?: { min: number; max: number; step?: number };
}
interface ExtendedConstraintSet extends MediaTrackConstraintSet {
  torch?: boolean;
  zoom?: number;
}

export interface CameraCapabilities {
  torch: boolean;
  zoom: { min: number; max: number; step: number } | null;
}

export interface OpenCameraOptions {
  facingMode: FacingMode;
  resolution: Resolution;
  deviceId?: string;
}

export function isCameraSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

const FRONT_LABEL = /front|user|selfie|vorder/i;
const BACK_LABEL = /back|rear|environment|rück|ruck/i;

/**
 * Opens the requested camera.
 *
 * The order matters: `facingMode: { exact }` is tried first because `{ ideal }`
 * is only a preference — plenty of Android devices happily hand back the camera
 * that is already open, which makes the switch button look broken. Only once
 * `exact` has failed do we fall back to picking the device by its label, then to
 * a soft preference, then to whatever the browser offers.
 */
export async function openCamera(opts: OpenCameraOptions): Promise<MediaStream> {
  if (!isCameraSupported()) {
    throw new Error(
      "Kamerazugriff nicht verfügbar. Die Seite muss über HTTPS oder localhost laufen."
    );
  }

  const { width, height } = resolutionSize(opts.resolution);
  const size = { width: { ideal: width }, height: { ideal: height } };
  const open = (video: MediaTrackConstraints) =>
    navigator.mediaDevices.getUserMedia({ video, audio: false });

  let lastError: unknown;
  const tryOpen = async (video: MediaTrackConstraints): Promise<MediaStream | null> => {
    try {
      return await open(video);
    } catch (err) {
      lastError = err;
      return null;
    }
  };

  if (opts.deviceId) {
    const stream = await tryOpen({ ...size, deviceId: { exact: opts.deviceId } });
    if (stream) return stream;
  }

  for (const video of [
    { ...size, facingMode: { exact: opts.facingMode } },
    { facingMode: { exact: opts.facingMode } },
  ]) {
    const stream = await tryOpen(video);
    if (stream) return stream;
  }

  // Some devices report no facing mode at all (USB webcams, a few tablets).
  // Their labels usually still say which way they point.
  const wanted = opts.facingMode === "user" ? FRONT_LABEL : BACK_LABEL;
  const match = (await listVideoInputs()).find((device) => wanted.test(device.label));
  if (match) {
    const stream = await tryOpen({ ...size, deviceId: { exact: match.deviceId } });
    if (stream) return stream;
  }

  for (const video of [{ ...size, facingMode: { ideal: opts.facingMode } }, {}]) {
    const stream = await tryOpen(video);
    if (stream) return stream;
  }

  throw lastError instanceof Error ? lastError : new Error("Kamera konnte nicht geöffnet werden.");
}

/** Which way the stream that actually opened is pointing, if the device says. */
export function facingOf(stream: MediaStream | null): string | undefined {
  return stream?.getVideoTracks()[0]?.getSettings().facingMode;
}

export async function countVideoInputs(): Promise<number> {
  return (await listVideoInputs()).length;
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export async function listVideoInputs(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "videoinput");
  } catch {
    return [];
  }
}

export function readCapabilities(stream: MediaStream | null): CameraCapabilities {
  const track = stream?.getVideoTracks()[0];
  if (!track || typeof track.getCapabilities !== "function") {
    return { torch: false, zoom: null };
  }
  const caps = track.getCapabilities() as ExtendedCapabilities;
  return {
    torch: caps.torch === true,
    zoom: caps.zoom
      ? { min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step ?? 0.1 }
      : null,
  };
}

async function applyAdvanced(stream: MediaStream | null, set: ExtendedConstraintSet): Promise<boolean> {
  const track = stream?.getVideoTracks()[0];
  if (!track) return false;
  // Some engines want the constraint in the advanced list, others only accept
  // it top-level. Try both before giving up.
  try {
    await track.applyConstraints({ advanced: [set] } as MediaTrackConstraints);
    return true;
  } catch {
    try {
      await track.applyConstraints(set as MediaTrackConstraints);
      return true;
    } catch {
      return false;
    }
  }
}

/** True if the torch state was accepted by the camera. */
export const setTorch = (stream: MediaStream | null, on: boolean) =>
  applyAdvanced(stream, { torch: on });

/**
 * What the track itself says the torch is doing right now. `undefined` when the
 * engine does not report it — that alone is no proof of failure.
 */
export function readTorchState(stream: MediaStream | null): boolean | undefined {
  const track = stream?.getVideoTracks()[0];
  if (!track || typeof track.getSettings !== "function") return undefined;
  return (track.getSettings() as MediaTrackSettings & { torch?: boolean }).torch;
}

/** What the track claims about torch support, or undefined if it says nothing. */
export function torchCapability(stream: MediaStream | null): boolean | undefined {
  const track = stream?.getVideoTracks()[0];
  if (!track || typeof track.getCapabilities !== "function") return undefined;
  return (track.getCapabilities() as ExtendedCapabilities).torch;
}

export const setZoom = (stream: MediaStream | null, zoom: number) =>
  applyAdvanced(stream, { zoom });

/** Mic stream, requested only when a recording actually starts. */
export async function openMicrophone(): Promise<MediaStream | null> {
  if (!isCameraSupported()) return null;
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    return null; // recording without sound beats not recording at all
  }
}

export interface DemoStream {
  stream: MediaStream;
  stop: () => void;
}

/**
 * Synthetic moving test image used when no camera is available (desktop without
 * webcam, denied permission, plain http). Keeps the whole pipeline — stamp,
 * capture, recording, gallery — usable and testable.
 */
export function createDemoStream(width = 1280, height = 720, fps = 30): DemoStream {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  let frame = 0;

  const draw = () => {
    frame += 1;
    const t = frame / fps;

    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#1e3a5f");
    sky.addColorStop(0.55, "#3b6ea5");
    sky.addColorStop(1, "#7fb4d8");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    // scrolling ground stripes give the recorded video visible motion
    ctx.fillStyle = "#1f3d2b";
    ctx.fillRect(0, height * 0.7, width, height * 0.3);
    ctx.fillStyle = "#2f5c40";
    const stripeWidth = width / 12;
    const offset = (t * 120) % (stripeWidth * 2);
    for (let x = -stripeWidth * 2; x < width; x += stripeWidth * 2) {
      ctx.fillRect(x + offset, height * 0.7, stripeWidth, height * 0.3);
    }

    // sun on a slow arc
    const sunX = width * (0.15 + 0.7 * ((t / 12) % 1));
    ctx.fillStyle = "#ffd400";
    ctx.beginPath();
    ctx.arc(sunX, height * 0.28, Math.min(width, height) * 0.07, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.font = `600 ${Math.round(height * 0.07)}px "Segoe UI", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("DEMOBILD", width / 2, height * 0.5);
    ctx.font = `400 ${Math.round(height * 0.035)}px "Segoe UI", sans-serif`;
    ctx.fillText(`Frame ${frame}`, width / 2, height * 0.58);
  };

  draw();
  const timer = window.setInterval(draw, 1000 / fps);
  const stream = canvas.captureStream(fps);

  return {
    stream,
    stop: () => {
      window.clearInterval(timer);
      stream.getTracks().forEach((track) => track.stop());
    },
  };
}
