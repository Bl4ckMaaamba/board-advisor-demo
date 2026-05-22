import { NextResponse } from "next/server";
import { providerRegistry } from "@/lib/data-broker/layer3-providers/registry";
import { circuitBreaker } from "@/lib/data-broker/layer2-orchestration/circuit-breaker";
import { l2Cache } from "@/lib/data-broker/layer4-normalize-cache/cache/l2-redis";
import { costController } from "@/lib/data-broker/layer2-orchestration/cost-controller";

export async function GET() {
  const providers = providerRegistry.getAllProviders();

  const [redisOk, monthlyUsage] = await Promise.all([
    l2Cache.ping(),
    costController.getMonthlyUsage(),
  ]);

  const providerStatuses = providers.map((p) => ({
    id: p.id,
    name: p.name,
    categories: p.categories,
    circuitBreaker: circuitBreaker.getStatus(p.id),
  }));

  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    cache: {
      redis: redisOk ? "connected" : "disconnected",
    },
    costs: monthlyUsage,
    providers: providerStatuses,
  });
}
