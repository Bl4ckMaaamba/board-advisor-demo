import { brokerLogger } from "../utils/logger";
import { CircuitOpenError } from "../utils/errors";

type CircuitState = "closed" | "open" | "half_open";

interface CircuitBreakerState {
  state: CircuitState;
  consecutiveFailures: number;
  lastFailureAt: number;
  openedAt: number;
}

const FAILURE_THRESHOLD = 3;
const OPEN_DURATION_MS = 60_000; // 60 seconds
const FAILURE_WINDOW_MS = 5 * 60_000; // 5 minutes

const breakers = new Map<string, CircuitBreakerState>();

function getState(providerId: string): CircuitBreakerState {
  if (!breakers.has(providerId)) {
    breakers.set(providerId, {
      state: "closed",
      consecutiveFailures: 0,
      lastFailureAt: 0,
      openedAt: 0,
    });
  }
  return breakers.get(providerId)!;
}

export const circuitBreaker = {
  canExecute(providerId: string): boolean {
    const cb = getState(providerId);

    if (cb.state === "closed") return true;

    if (cb.state === "open") {
      // Check if cooldown period has passed
      if (Date.now() - cb.openedAt >= OPEN_DURATION_MS) {
        cb.state = "half_open";
        brokerLogger.info("Circuit breaker half-open", { provider: providerId });
        return true; // allow one test request
      }
      return false;
    }

    // half_open: allow the test request
    return true;
  },

  assertCanExecute(providerId: string): void {
    if (!this.canExecute(providerId)) {
      throw new CircuitOpenError(providerId);
    }
  },

  recordSuccess(providerId: string): void {
    const cb = getState(providerId);
    const wasOpen = cb.state !== "closed";
    cb.state = "closed";
    cb.consecutiveFailures = 0;
    if (wasOpen) {
      brokerLogger.info("Circuit breaker closed", { provider: providerId });
    }
  },

  recordFailure(providerId: string): void {
    const cb = getState(providerId);
    const now = Date.now();

    // Reset counter if last failure was outside the window
    if (now - cb.lastFailureAt > FAILURE_WINDOW_MS) {
      cb.consecutiveFailures = 0;
    }

    cb.consecutiveFailures++;
    cb.lastFailureAt = now;

    if (cb.consecutiveFailures >= FAILURE_THRESHOLD || cb.state === "half_open") {
      cb.state = "open";
      cb.openedAt = now;
      brokerLogger.warn("Circuit breaker opened", {
        provider: providerId,
        failures: cb.consecutiveFailures,
      });
    }
  },

  getStatus(providerId: string): { state: CircuitState; failures: number } {
    const cb = getState(providerId);
    // Re-evaluate if open state should transition
    if (cb.state === "open" && Date.now() - cb.openedAt >= OPEN_DURATION_MS) {
      cb.state = "half_open";
    }
    return { state: cb.state, failures: cb.consecutiveFailures };
  },

  getAllStatuses(): Record<string, { state: CircuitState; failures: number }> {
    const result: Record<string, { state: CircuitState; failures: number }> = {};
    breakers.forEach((_, id) => {
      result[id] = this.getStatus(id);
    });
    return result;
  },

  reset(providerId: string): void {
    breakers.delete(providerId);
  },
};
