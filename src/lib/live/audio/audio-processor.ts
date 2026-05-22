import { liveLogger } from "../utils/logger";

const MAX_CHUNK_SIZE = 10 * 1024 * 1024; // 10MB max per chunk
const MIN_CHUNK_SIZE = 100; // minimum useful audio

export interface AudioChunkMeta {
  size: number;
}

export function validateAudioChunk(base64: string): {
  buffer: Buffer;
  meta: AudioChunkMeta;
} {
  const buffer = Buffer.from(base64, "base64");

  if (buffer.length < MIN_CHUNK_SIZE) {
    throw new Error(`Audio chunk too small: ${buffer.length} bytes`);
  }

  if (buffer.length > MAX_CHUNK_SIZE) {
    throw new Error(
      `Audio chunk too large: ${buffer.length} bytes (max ${MAX_CHUNK_SIZE})`
    );
  }

  liveLogger.debug("Audio chunk validated", { size: buffer.length });

  return {
    buffer,
    meta: { size: buffer.length },
  };
}
