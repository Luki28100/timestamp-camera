// Records the stamped canvas — not the raw camera stream — so the timestamp is
// burnt into every frame and keeps ticking inside the video.

// Order matters a lot on phones. H.264 is hardware-encoded on virtually every
// Android device; VP9 usually is not, and software-encoding 1080p in real time
// starves the encoder until barely a frame per second survives. So: H.264 first,
// VP8 next, VP9 only as a last resort.
const MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=h264,aac",
  "video/mp4",
  "video/webm;codecs=h264,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=vp9,opus",
  "video/webm",
];

export function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

export function isRecordingSupported(): boolean {
  return typeof MediaRecorder !== "undefined" && pickMimeType() !== null;
}

export function extensionFor(mimeType: string): "webm" | "mp4" {
  return mimeType.startsWith("video/mp4") ? "mp4" : "webm";
}

export class StampRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private canvasStream: MediaStream | null = null;
  private audioStream: MediaStream | null = null;
  private mimeType = "";
  private startedAt = 0;

  get isRecording(): boolean {
    return this.recorder?.state === "recording";
  }

  get elapsedMs(): number {
    return this.startedAt ? Date.now() - this.startedAt : 0;
  }

  get mime(): string {
    return this.mimeType;
  }

  start(canvas: HTMLCanvasElement, audioStream: MediaStream | null, fps = 30): void {
    const mimeType = pickMimeType();
    if (!mimeType) throw new Error("Videoaufnahme wird von diesem Browser nicht unterstützt.");

    this.mimeType = mimeType;
    this.chunks = [];
    this.canvasStream = canvas.captureStream(fps);
    this.audioStream = audioStream;

    const tracks = [...this.canvasStream.getVideoTracks()];
    if (audioStream) tracks.push(...audioStream.getAudioTracks());
    const combined = new MediaStream(tracks);

    // Roughly 0.1 bits per pixel per frame — enough for a clean picture without
    // asking the encoder for more than it can deliver.
    const bitrate = Math.min(6_000_000, Math.round(canvas.width * canvas.height * fps * 0.1));

    this.recorder = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: bitrate });
    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };
    // No timeslice on purpose. start(1000) produces a fragmented file whose
    // duration index only covers the first fragments — gallery players then
    // show a 10-second clip as 3 seconds. One flush at stop() writes a single
    // file with a correct index. Trade-off: a crash mid-recording loses the clip.
    this.recorder.start();
    this.startedAt = Date.now();
  }

  async stop(): Promise<Blob> {
    const recorder = this.recorder;
    if (!recorder) throw new Error("Es läuft keine Aufnahme.");

    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(this.chunks, { type: this.mimeType }));
      recorder.stop();
    });

    this.canvasStream?.getTracks().forEach((track) => track.stop());
    this.audioStream?.getTracks().forEach((track) => track.stop());
    this.canvasStream = null;
    this.audioStream = null;
    this.recorder = null;
    this.startedAt = 0;

    return blob;
  }

  /** Drops a running recording without producing a file (used on unmount). */
  cancel(): void {
    if (this.recorder?.state === "recording") {
      this.recorder.onstop = null;
      this.recorder.stop();
    }
    this.canvasStream?.getTracks().forEach((track) => track.stop());
    this.audioStream?.getTracks().forEach((track) => track.stop());
    this.recorder = null;
    this.canvasStream = null;
    this.audioStream = null;
    this.startedAt = 0;
  }
}
