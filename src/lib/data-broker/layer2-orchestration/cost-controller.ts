import { Redis } from "@upstash/redis";
import { BudgetExceededError } from "../utils/errors";
import { brokerLogger } from "../utils/logger";
import { getEnvVar } from "../utils/env";

const DEFAULT_REQUEST_BUDGET = 0.05; // €
const DEFAULT_BOARD_MONTHLY_BUDGET = 50; // €
const GLOBAL_MONTHLY_BUDGET = 400; // €
const ALERT_THRESHOLD = 0.8; // 80%

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      url: getEnvVar("UPSTASH_REDIS_REST_URL"),
      token: getEnvVar("UPSTASH_REDIS_REST_TOKEN"),
    });
  }
  return redis;
}

function monthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export const costController = {
  requestCost: 0,

  resetRequestCost(): void {
    this.requestCost = 0;
  },

  checkRequestBudget(additionalCost: number, budget?: number): void {
    const limit = budget ?? DEFAULT_REQUEST_BUDGET;
    if (this.requestCost + additionalCost > limit) {
      throw new BudgetExceededError("request", limit, this.requestCost + additionalCost);
    }
  },

  recordRequestCost(cost: number): void {
    this.requestCost += cost;
  },

  async recordMonthlyCost(cost: number, boardId?: number): Promise<void> {
    try {
      const month = monthKey();
      const r = getRedis();

      // Global monthly cost
      const globalKey = `cost:global:${month}`;
      const globalTotal = await r.incrbyfloat(globalKey, cost);

      // Set expiry on first write (45 days to keep history)
      if (globalTotal <= cost) {
        await r.expire(globalKey, 45 * 86400);
      }

      // Board monthly cost
      if (boardId) {
        const boardKey = `cost:board:${boardId}:${month}`;
        const boardTotal = await r.incrbyfloat(boardKey, cost);

        if (boardTotal <= cost) {
          await r.expire(boardKey, 45 * 86400);
        }

        // Alert at 80%
        if (boardTotal >= DEFAULT_BOARD_MONTHLY_BUDGET * ALERT_THRESHOLD) {
          brokerLogger.warn("Board budget alert", {
            boardId,
            current: boardTotal,
            limit: DEFAULT_BOARD_MONTHLY_BUDGET,
          });
        }
      }

      // Global alert
      if (globalTotal >= GLOBAL_MONTHLY_BUDGET * ALERT_THRESHOLD) {
        brokerLogger.warn("Global budget alert", {
          current: globalTotal,
          limit: GLOBAL_MONTHLY_BUDGET,
        });
      }
    } catch (error) {
      brokerLogger.error("Failed to record monthly cost", { error: String(error) });
    }
  },

  async getMonthlyUsage(): Promise<{ global: number; byBoard: Record<string, number> }> {
    try {
      const month = monthKey();
      const r = getRedis();

      const globalTotal = (await r.get<number>(`cost:global:${month}`)) ?? 0;

      return { global: globalTotal, byBoard: {} };
    } catch {
      return { global: 0, byBoard: {} };
    }
  },

  async checkGlobalBudget(): Promise<void> {
    try {
      const month = monthKey();
      const globalTotal = (await getRedis().get<number>(`cost:global:${month}`)) ?? 0;

      if (globalTotal >= GLOBAL_MONTHLY_BUDGET) {
        throw new BudgetExceededError("global", GLOBAL_MONTHLY_BUDGET, globalTotal);
      }
    } catch (error) {
      if (error instanceof BudgetExceededError) throw error;
      // If Redis is down, allow the request
      brokerLogger.warn("Could not check global budget", { error: String(error) });
    }
  },
};
