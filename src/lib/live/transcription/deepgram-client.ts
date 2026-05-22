import WebSocket from "ws";
import { liveLogger } from "../utils/logger";

type FinalTranscriptCallback = (text: string, confidence: number, speaker: string | null) => void;
type PartialTranscriptCallback = (text: string) => void;

interface ConnectOptions {
  sampleRate?: number;
  language?: string;
  keyterms?: string[];
}

interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  punctuated_word?: string;
  speaker?: number;
}

interface DeepgramAlternative {
  transcript: string;
  confidence: number;
  words: DeepgramWord[];
}

interface DeepgramChannel {
  alternatives: DeepgramAlternative[];
}

interface DeepgramMessage {
  type: string;
  channel?: DeepgramChannel;
  is_final?: boolean;
  speech_final?: boolean;
  start?: number;
  duration?: number;
  [key: string]: unknown;
}

export class DeepgramStreamingClient {
  private ws: WebSocket | null = null;
  private apiKey: string;
  private finalCallbacks: FinalTranscriptCallback[] = [];
  private partialCallbacks: PartialTranscriptCallback[] = [];
  private connectPromiseResolve: (() => void) | null = null;
  private connectPromiseReject: ((err: Error) => void) | null = null;
  private closePromiseResolve: (() => void) | null = null;
  private connected = false;
  private audioQueue: Buffer[] = [];
  private keepAliveInterval: ReturnType<typeof setInterval> | null = null;

  // Track the latest partial so we can flush it as final after silence
  private lastPartialText = "";
  private lastPartialConfidence = 0.9;
  private lastPartialSpeaker: string | null = null;
  private partialFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private static PARTIAL_FLUSH_MS = 2000;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async connect(options: ConnectOptions = {}): Promise<void> {
    const sampleRate = options.sampleRate ?? 16000;
    const language = options.language ?? "fr";

    const params = new URLSearchParams({
      encoding: "linear16",
      sample_rate: String(sampleRate),
      language,
      model: "nova-3",
      diarize: "true",
      interim_results: "true",
      punctuate: "true",
      smart_format: "true",
      utterances: "true",
      endpointing: "500",
    });

    if (options.keyterms && options.keyterms.length > 0) {
      for (const term of options.keyterms) {
        params.append("keyterm", term);
      }
    }

    const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;

    return new Promise((resolve, reject) => {
      this.connectPromiseResolve = resolve;
      this.connectPromiseReject = reject;

      this.ws = new WebSocket(url, {
        headers: {
          Authorization: `Token ${this.apiKey}`,
        },
      });

      this.ws.on("open", () => {
        liveLogger.info("Deepgram WebSocket opened", { sampleRate, language });
        this.connected = true;
        // Start KeepAlive interval
        this.keepAliveInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: "KeepAlive" }));
          }
        }, 5000);
        // Flush queued audio
        while (this.audioQueue.length > 0) {
          const queued = this.audioQueue.shift()!;
          this.sendAudioInternal(queued);
        }
        if (this.connectPromiseResolve) {
          this.connectPromiseResolve();
          this.connectPromiseResolve = null;
          this.connectPromiseReject = null;
        }
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        try {
          const msg: DeepgramMessage = JSON.parse(data.toString());
          this.handleMessage(msg);
        } catch (err) {
          liveLogger.error("Failed to parse Deepgram message", {
            error: String(err),
          });
        }
      });

      this.ws.on("error", (err) => {
        liveLogger.error("Deepgram WebSocket error", { error: String(err) });
        if (this.connectPromiseReject) {
          this.connectPromiseReject(err instanceof Error ? err : new Error(String(err)));
          this.connectPromiseResolve = null;
          this.connectPromiseReject = null;
        }
      });

      this.ws.on("close", (code, reason) => {
        liveLogger.info("Deepgram WebSocket closed", {
          code,
          reason: reason.toString(),
        });
        this.connected = false;
        this.clearKeepAlive();
        this.flushPartial();
        if (this.closePromiseResolve) {
          this.closePromiseResolve();
          this.closePromiseResolve = null;
        }
      });

      setTimeout(() => {
        if (this.connectPromiseReject) {
          this.connectPromiseReject(new Error("Deepgram connection timeout"));
          this.connectPromiseResolve = null;
          this.connectPromiseReject = null;
        }
      }, 10000);
    });
  }

  private clearKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  private resetPartialTimer() {
    if (this.partialFlushTimer) {
      clearTimeout(this.partialFlushTimer);
    }
    if (this.lastPartialText.length > 0) {
      this.partialFlushTimer = setTimeout(() => {
        this.flushPartial();
      }, DeepgramStreamingClient.PARTIAL_FLUSH_MS);
    }
  }

  private flushPartial() {
    if (this.partialFlushTimer) {
      clearTimeout(this.partialFlushTimer);
      this.partialFlushTimer = null;
    }
    if (this.lastPartialText.length > 0) {
      const text = this.lastPartialText;
      const conf = this.lastPartialConfidence;
      const speaker = this.lastPartialSpeaker;
      this.lastPartialText = "";
      this.lastPartialSpeaker = null;
      liveLogger.info("Flushing partial as final", { text: text.substring(0, 80) });
      for (const cb of this.finalCallbacks) cb(text, conf, speaker);
    }
  }

  private getMajoritySpeaker(words: DeepgramWord[]): string | null {
    const speakerCounts = new Map<number, number>();
    for (const w of words) {
      if (w.speaker !== undefined) {
        speakerCounts.set(w.speaker, (speakerCounts.get(w.speaker) ?? 0) + 1);
      }
    }
    if (speakerCounts.size === 0) return null;
    let maxCount = 0;
    let maxSpeaker = 0;
    speakerCounts.forEach((count, speaker) => {
      if (count > maxCount) {
        maxCount = count;
        maxSpeaker = speaker;
      }
    });
    return `speaker_${maxSpeaker}`;
  }

  private handleMessage(msg: DeepgramMessage) {
    switch (msg.type) {
      case "Results": {
        const alt = msg.channel?.alternatives?.[0];
        if (!alt) return;

        const transcript = (alt.transcript ?? "").trim();
        if (transcript.length === 0) return;

        const confidence = alt.confidence ?? 0.9;
        const speaker = this.getMajoritySpeaker(alt.words ?? []);

        if (msg.is_final) {
          // Clear partial tracking — this segment is finalized
          this.lastPartialText = "";
          this.lastPartialSpeaker = null;
          if (this.partialFlushTimer) {
            clearTimeout(this.partialFlushTimer);
            this.partialFlushTimer = null;
          }
          liveLogger.info("Deepgram final transcript", {
            text: transcript.substring(0, 80),
            speaker,
            speech_final: msg.speech_final,
          });
          for (const cb of this.finalCallbacks) cb(transcript, confidence, speaker);
        } else {
          // Interim result — track for potential flush
          this.lastPartialText = transcript;
          this.lastPartialConfidence = confidence;
          this.lastPartialSpeaker = speaker;
          this.resetPartialTimer();
          for (const cb of this.partialCallbacks) cb(transcript);
        }
        break;
      }

      case "Metadata":
        liveLogger.info("Deepgram session metadata", {
          request_id: msg.request_id,
          channels: msg.channels,
        });
        break;

      case "SpeechStarted":
        break;

      case "UtteranceEnd":
        liveLogger.debug("Deepgram utterance end");
        break;

      case "Error":
        liveLogger.error("Deepgram error", { error: msg.message ?? msg });
        break;

      default:
        liveLogger.debug("Deepgram message", { type: msg.type });
    }
  }

  sendAudio(base64Pcm16: string): void {
    const buffer = Buffer.from(base64Pcm16, "base64");

    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.audioQueue.push(buffer);
      return;
    }
    this.sendAudioInternal(buffer);
  }

  private sendAudioInternal(buffer: Buffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // Send as binary frames in chunks of ~250ms at 16kHz PCM16
    const CHUNK_SIZE = 8000;
    for (let offset = 0; offset < buffer.length; offset += CHUNK_SIZE) {
      const chunk = buffer.subarray(offset, Math.min(offset + CHUNK_SIZE, buffer.length));
      this.ws.send(chunk);
    }
  }

  onFinalTranscript(cb: FinalTranscriptCallback): void {
    this.finalCallbacks.push(cb);
  }

  onPartialTranscript(cb: PartialTranscriptCallback): void {
    this.partialCallbacks.push(cb);
  }

  async close(): Promise<void> {
    if (!this.ws) return;

    this.clearKeepAlive();

    if (this.ws.readyState === WebSocket.OPEN) {
      return new Promise((resolve) => {
        this.closePromiseResolve = resolve;
        this.ws!.send(JSON.stringify({ type: "CloseStream" }));
        setTimeout(() => {
          this.flushPartial();
          if (this.closePromiseResolve) {
            this.closePromiseResolve();
            this.closePromiseResolve = null;
          }
          if (this.ws) {
            this.ws.close();
            this.ws = null;
          }
        }, 5000);
      });
    }

    this.flushPartial();
    this.ws.close();
    this.ws = null;
  }

  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }
}
