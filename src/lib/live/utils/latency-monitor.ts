import { liveLogger } from "./logger";

interface LatencyCheckpoint {
  name: string;
  timestamp: number;
}

export class LatencyMonitor {
  private checkpoints: LatencyCheckpoint[] = [];
  private startTime: number = 0;
  private measurements: number[] = [];

  start(): void {
    this.startTime = Date.now();
    this.checkpoints = [{ name: "start", timestamp: this.startTime }];
  }

  checkpoint(name: string): void {
    this.checkpoints.push({ name, timestamp: Date.now() });
  }

  end(): number {
    const endTime = Date.now();
    const totalLatency = endTime - this.startTime;
    this.checkpoints.push({ name: "end", timestamp: endTime });

    this.measurements.push(totalLatency);

    if (totalLatency > 10000) {
      liveLogger.warn("Pipeline latency exceeded 10s budget", {
        total_ms: totalLatency,
        checkpoints: this.getBreakdown(),
      });
    }

    return totalLatency;
  }

  getBreakdown(): Record<string, number> {
    const breakdown: Record<string, number> = {};
    for (let i = 1; i < this.checkpoints.length; i++) {
      const name = this.checkpoints[i].name;
      const duration = this.checkpoints[i].timestamp - this.checkpoints[i - 1].timestamp;
      breakdown[`${this.checkpoints[i - 1].name} -> ${name}`] = duration;
    }
    return breakdown;
  }

  getAverageLatency(): number {
    if (this.measurements.length === 0) return 0;
    return Math.round(
      this.measurements.reduce((sum, m) => sum + m, 0) / this.measurements.length
    );
  }

  getTotalMeasurements(): number {
    return this.measurements.length;
  }

  reset(): void {
    this.checkpoints = [];
    this.startTime = 0;
  }

  resetAll(): void {
    this.reset();
    this.measurements = [];
  }
}
