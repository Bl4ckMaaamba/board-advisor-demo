/**
 * MicStreamer — captures the participant's microphone and streams PCM16 chunks
 * to the live meeting backend, tagged with their participant_id.
 *
 * Browser-only. Designed to run on any device (laptop, phone) so each
 * participant's mic feeds its own Deepgram stream on the server.
 *
 * Lifecycle:
 *   const s = new MicStreamer({ meetingId, participantId, onStatus, onLevel });
 *   await s.start();        // requests mic, opens AudioContext, calls /mic-join
 *   s.mute(); s.unmute();   // soft mute (stops sending chunks, keeps stream open)
 *   await s.stop();         // tears everything down + calls /mic-leave
 */

export type MicStatus =
  | "idle"
  | "requesting_permission"
  | "joining"
  | "live"
  | "muted"
  | "reconnecting"
  | "error"
  | "stopped";

export interface MicStreamerOptions {
  meetingId: string;
  participantId: string;
  onStatus?: (status: MicStatus, details?: string) => void;
  /** Called every ~100ms with a 0..1 RMS level for the mic level meter. */
  onLevel?: (level: number) => void;
  onError?: (error: Error) => void;
}

const SAMPLE_RATE = 16_000;
const CHUNK_FAILURE_BACKOFF_MS = [500, 1500, 4000, 10_000];

export class MicStreamer {
  private readonly opts: MicStreamerOptions;
  private status: MicStatus = "idle";
  private muted = false;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private analyser: AnalyserNode | null = null;
  private levelInterval: ReturnType<typeof setInterval> | null = null;
  private chunkIndex = 0;
  /**
   * Counts consecutive chunk POST failures; informs the backoff so we don't
   * hammer a flapping endpoint and surface a "reconnecting" status to the UI.
   */
  private consecutiveFailures = 0;

  constructor(opts: MicStreamerOptions) {
    this.opts = opts;
  }

  getStatus(): MicStatus {
    return this.status;
  }

  isMuted(): boolean {
    return this.muted;
  }

  async start(): Promise<void> {
    if (this.status !== "idle" && this.status !== "stopped" && this.status !== "error") {
      return;
    }

    try {
      this.setStatus("requesting_permission");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: SAMPLE_RATE,
          channelCount: 1,
        },
      });
      this.stream = stream;

      this.setStatus("joining");
      const joinRes = await fetch("/api/live/mic-join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meeting_id: this.opts.meetingId }),
      });
      if (!joinRes.ok) {
        const data = await safeJson(joinRes);
        throw new Error(data?.error ?? `mic-join failed (HTTP ${joinRes.status})`);
      }

      const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
      this.audioContext = audioContext;
      await audioContext.audioWorklet.addModule("/worklets/pcm16-processor.js");

      const source = audioContext.createMediaStreamSource(stream);
      this.source = source;

      const workletNode = new AudioWorkletNode(audioContext, "pcm16-processor");
      this.workletNode = workletNode;

      // Level meter via a parallel AnalyserNode — independent of the worklet
      // so muting (pausing chunk posts) doesn't kill the visual feedback.
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      this.analyser = analyser;
      source.connect(analyser);

      workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        if (this.muted) return;
        this.sendChunk(event.data).catch(() => {
          // Errors are surfaced by sendChunk via setStatus("reconnecting") — swallow here.
        });
      };

      source.connect(workletNode);

      if (this.opts.onLevel) this.startLevelMeter();

      this.setStatus("live");
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.setStatus("error", err.message);
      this.opts.onError?.(err);
      await this.cleanupLocal();
      throw err;
    }
  }

  mute(): void {
    if (this.status === "stopped" || this.status === "idle") return;
    this.muted = true;
    this.setStatus("muted");
  }

  unmute(): void {
    if (this.status !== "muted") return;
    this.muted = false;
    this.setStatus("live");
  }

  async stop(): Promise<void> {
    if (this.status === "stopped" || this.status === "idle") return;

    await this.cleanupLocal();

    // Best-effort mic-leave; failure here is fine, the server will clean up
    // when the session stops or the WS times out.
    try {
      await fetch("/api/live/mic-leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meeting_id: this.opts.meetingId }),
      });
    } catch {
      // ignore
    }

    this.setStatus("stopped");
  }

  // --- internals ---

  private setStatus(status: MicStatus, details?: string): void {
    this.status = status;
    this.opts.onStatus?.(status, details);
  }

  private startLevelMeter(): void {
    if (!this.analyser || !this.opts.onLevel) return;
    const buf = new Uint8Array(this.analyser.frequencyBinCount);
    this.levelInterval = setInterval(() => {
      if (!this.analyser) return;
      this.analyser.getByteTimeDomainData(buf);
      // RMS over the time-domain window, normalised to roughly 0..1.
      let sumSquares = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sumSquares += v * v;
      }
      const rms = Math.sqrt(sumSquares / buf.length);
      this.opts.onLevel?.(Math.min(1, rms * 2));
    }, 100);
  }

  private async sendChunk(buffer: ArrayBuffer): Promise<void> {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    try {
      const res = await fetch("/api/live/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meeting_id: this.opts.meetingId,
          participant_id: this.opts.participantId,
          chunk: base64,
          chunk_index: this.chunkIndex++,
          timestamp: 0,
        }),
        // Keep-alive helps when the page is being unloaded mid-talk.
        keepalive: true,
      });
      if (!res.ok) {
        await this.handleChunkFailure(`HTTP ${res.status}`);
        return;
      }
      if (this.consecutiveFailures > 0) {
        this.consecutiveFailures = 0;
        if (this.status === "reconnecting") this.setStatus("live");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.handleChunkFailure(message);
    }
  }

  private async handleChunkFailure(reason: string): Promise<void> {
    this.consecutiveFailures += 1;
    this.setStatus("reconnecting", reason);
    const idx = Math.min(
      this.consecutiveFailures - 1,
      CHUNK_FAILURE_BACKOFF_MS.length - 1
    );
    await delay(CHUNK_FAILURE_BACKOFF_MS[idx]);
  }

  private async cleanupLocal(): Promise<void> {
    if (this.levelInterval) {
      clearInterval(this.levelInterval);
      this.levelInterval = null;
    }
    if (this.source) {
      try {
        this.source.disconnect();
      } catch {
        // ignore
      }
      this.source = null;
    }
    if (this.workletNode) {
      try {
        this.workletNode.disconnect();
      } catch {
        // ignore
      }
      this.workletNode = null;
    }
    if (this.analyser) {
      try {
        this.analyser.disconnect();
      } catch {
        // ignore
      }
      this.analyser = null;
    }
    if (this.audioContext && this.audioContext.state !== "closed") {
      try {
        await this.audioContext.close();
      } catch {
        // ignore
      }
    }
    this.audioContext = null;
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }
}

async function safeJson(res: Response): Promise<{ error?: string } | null> {
  try {
    return (await res.json()) as { error?: string };
  } catch {
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
