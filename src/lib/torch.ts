import { Capacitor, registerPlugin } from "@capacitor/core";
import { readTorchState, setTorch as setTorchViaTrack, torchCapability } from "./camera";

// Bridge to TorchPlugin in the Android project. Registered only there; calls
// from anywhere else reject, which the callers below handle.
interface TorchPluginApi {
  setTorch(options: { on: boolean }): Promise<{ ok: boolean; cameraId?: string }>;
  getInfo(): Promise<Record<string, unknown>>;
}

const NativeTorch = registerPlugin<TorchPluginApi>("Torch");

export interface TorchResult {
  ok: boolean;
  /** readable reason shown to the user when ok is false */
  detail?: string;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Switches the torch, native path first.
 *
 * Order matters: several WebViews resolve the getUserMedia torch constraint and
 * then do nothing at all, without reporting a torch setting to read back. There
 * is no way to tell that apart from success on the web side, so on Android the
 * system camera service decides — and the constraint is only a fallback for
 * plain browsers.
 */
export async function switchTorch(stream: MediaStream | null, on: boolean): Promise<TorchResult> {
  const problems: string[] = [];

  if (Capacitor.isNativePlatform()) {
    try {
      await NativeTorch.setTorch({ on });
      return { ok: true };
    } catch (err) {
      problems.push(`System: ${message(err)}`);
    }
  }

  const accepted = await setTorchViaTrack(stream, on);
  if (accepted) {
    const reported = readTorchState(stream);
    if (reported === on) return { ok: true };
    // Unverifiable outside the app: no native layer to cross-check against, so
    // take the browser at its word rather than refuse a working torch.
    if (reported === undefined && !Capacitor.isNativePlatform()) return { ok: true };
    problems.push(
      reported === undefined
        ? "Kamera meldet keinen Blitz-Zustand zurück"
        : `Kamera meldet weiterhin ${reported ? "an" : "aus"}`
    );
  } else {
    problems.push("Kamera lehnt die Blitz-Einstellung ab");
  }

  return { ok: false, detail: problems.join(" · ") };
}

/** Human-readable dump of everything the device says about its flash. */
export async function torchDiagnosis(stream: MediaStream | null): Promise<string> {
  const lines: string[] = [];
  lines.push(`Plattform: ${Capacitor.isNativePlatform() ? "Android-App" : "Browser"}`);

  const capability = torchCapability(stream);
  lines.push(`Kamera meldet Blitz-Fähigkeit: ${capability === undefined ? "nichts" : capability}`);
  lines.push(`Kamera meldet Blitz-Zustand: ${readTorchState(stream) ?? "nichts"}`);

  const accepted = await setTorchViaTrack(stream, true);
  lines.push(`Web-Schaltversuch: ${accepted ? "angenommen" : "abgelehnt"}`);
  lines.push(`Zustand danach: ${readTorchState(stream) ?? "nichts"}`);
  await setTorchViaTrack(stream, false);

  if (Capacitor.isNativePlatform()) {
    try {
      lines.push(`System vorher: ${JSON.stringify(await NativeTorch.getInfo())}`);
      await NativeTorch.setTorch({ on: true });
      await new Promise((resolve) => setTimeout(resolve, 700));
      lines.push(`System nach An: ${JSON.stringify(await NativeTorch.getInfo())}`);
      await NativeTorch.setTorch({ on: false });
    } catch (err) {
      lines.push(`System-Schaltversuch: FEHLER ${message(err)}`);
    }
  }

  return lines.join("\n");
}
