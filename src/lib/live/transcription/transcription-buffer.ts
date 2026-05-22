import { TranscriptionSegment } from "../schemas";

const MIN_SEGMENT_LENGTH = 3;

export class TranscriptionBuffer {
  private buffer: TranscriptionSegment[] = [];

  /**
   * Emit all valid segments immediately — no sentence-ending wait.
   */
  addSegments(segments: TranscriptionSegment[]): TranscriptionSegment[] {
    const valid = segments.filter(s => s.content.trim().length >= MIN_SEGMENT_LENGTH);
    this.buffer.push(...valid);
    return valid;
  }

  /**
   * Flush — nothing to flush since we emit immediately.
   */
  flush(): TranscriptionSegment[] {
    return [];
  }

  getAll(): TranscriptionSegment[] {
    return [...this.buffer];
  }

  getRecent(count: number): TranscriptionSegment[] {
    return this.buffer.slice(-count);
  }

  clear(): void {
    this.buffer = [];
  }
}
