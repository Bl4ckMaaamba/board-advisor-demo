export interface SpeakerStats {
  speaker: string;
  duration: number; // total seconds
  segments: number; // total segments
}

interface TimestampedSpeak {
  speaker: string;
  durationSeconds: number;
  atMs: number;
}

export class SpeakerTracker {
  private speakers = new Map<string, { duration: number; segments: number }>();
  private timeline: TimestampedSpeak[] = [];

  addSpeaking(speaker: string, durationSeconds: number): void {
    const existing = this.speakers.get(speaker) ?? { duration: 0, segments: 0 };
    existing.duration += durationSeconds;
    existing.segments += 1;
    this.speakers.set(speaker, existing);
    // new timeline entry
    this.timeline.push({ speaker, durationSeconds, atMs: Date.now() });
    // keep the timeline bounded: drop entries older than 60 minutes to avoid unbounded growth
    const oldestKept = Date.now() - 60 * 60_000;
    while (this.timeline.length > 0 && this.timeline[0].atMs < oldestKept) {
      this.timeline.shift();
    }
  }

  getStats(): SpeakerStats[] {
    return Array.from(this.speakers.entries())
      .map(([speaker, data]) => ({
        speaker,
        duration: Math.round(data.duration * 10) / 10,
        segments: data.segments,
      }))
      .sort((a, b) => b.duration - a.duration);
  }

  getStatsInWindow(windowMs: number): SpeakerStats[] {
    const cutoff = Date.now() - windowMs;
    const agg = new Map<string, { duration: number; segments: number }>();
    for (const e of this.timeline) {
      if (e.atMs < cutoff) continue;
      const existing = agg.get(e.speaker) ?? { duration: 0, segments: 0 };
      existing.duration += e.durationSeconds;
      existing.segments += 1;
      agg.set(e.speaker, existing);
    }
    return Array.from(agg.entries())
      .map(([speaker, data]) => ({
        speaker,
        duration: Math.round(data.duration * 10) / 10,
        segments: data.segments,
      }))
      .sort((a, b) => b.duration - a.duration);
  }

  getTotalDuration(): number {
    let total = 0;
    this.speakers.forEach((data) => {
      total += data.duration;
    });
    return total;
  }

  getSpeakerRatio(speaker: string): number {
    const total = this.getTotalDuration();
    if (total === 0) return 0;
    const data = this.speakers.get(speaker);
    if (!data) return 0;
    return data.duration / total;
  }

  clear(): void {
    this.speakers.clear();
    this.timeline = [];
  }
}
