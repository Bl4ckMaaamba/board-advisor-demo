/**
 * AudioWorklet processor that captures raw PCM16 audio at 16kHz.
 * Accumulates 250ms of samples, converts Float32 to Int16, and posts to main thread.
 */
class PCM16Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [];
    this.CHUNK_SIZE = 4000; // 250ms at 16kHz
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channel = input[0]; // mono

    for (let i = 0; i < channel.length; i++) {
      // Clamp and convert Float32 [-1, 1] to Int16 [-32768, 32767]
      const sample = Math.max(-1, Math.min(1, channel[i]));
      this.buffer.push(sample * 0x7fff);
    }

    if (this.buffer.length >= this.CHUNK_SIZE) {
      const int16 = new Int16Array(this.buffer.splice(0, this.CHUNK_SIZE));
      this.port.postMessage(int16.buffer, [int16.buffer]);
    }

    return true;
  }
}

registerProcessor("pcm16-processor", PCM16Processor);
