import { queryDataBroker } from "@/lib/data-broker";
import { formatPackets } from "../formatters";
import { BoardContext } from "@/lib/data-broker/schemas/query-params";
import { withTimeout } from "./timeout";

export async function executeSectorBenchmark(
  input: Record<string, unknown>,
  boardContext?: BoardContext
): Promise<string> {
  const sector = input.sector as string;
  const companyTicker = input.company_ticker as string | undefined;
  const metrics = input.metrics as string[] | undefined;

  const queryParts = [`benchmark sectoriel ${sector}`];
  if (companyTicker) queryParts.push(`comparaison avec ${companyTicker}`);
  if (metrics && metrics.length > 0) queryParts.push(`métriques: ${metrics.join(", ")}`);

  try {
    const response = await withTimeout(
      queryDataBroker({
        query: queryParts.join(" "),
        board_context: boardContext,
        mode: "chatbot",
      }),
      "sector_benchmark"
    );

    const benchPackets = response.packets.filter(
      (p) => p.category === "finance" || p.data_type === "metric"
    );

    if (benchPackets.length === 0) {
      return `Aucune donnée de benchmark trouvée pour le secteur "${sector}".`;
    }

    return formatPackets(benchPackets);
  } catch (err) {
    return `Erreur lors du benchmark sectoriel : ${err instanceof Error ? err.message : "Erreur inconnue"}`;
  }
}
