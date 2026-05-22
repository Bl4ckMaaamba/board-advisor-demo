import { queryDataBroker } from "@/lib/data-broker";
import { formatPackets } from "../formatters";
import { BoardContext } from "@/lib/data-broker/schemas/query-params";
import { withTimeout } from "./timeout";

export async function executeFinancialData(
  input: Record<string, unknown>,
  boardContext?: BoardContext
): Promise<string> {
  const query = input.query as string;
  const ticker = input.ticker as string | undefined;
  const metrics = input.metrics as string[] | undefined;

  // Build a structured query that prioritizes the ticker for the Data Broker classifier
  // The ticker is the most important signal for financial data providers (FMP)
  const queryParts: string[] = [];
  if (ticker) queryParts.push(`[TICKER: ${ticker}]`);
  queryParts.push(query);
  if (metrics && metrics.length > 0) queryParts.push(`métriques: ${metrics.join(", ")}`);

  try {
    const response = await withTimeout(
      queryDataBroker({
        query: queryParts.join(" "),
        board_context: boardContext,
        mode: "chatbot",
      }),
      "get_financial_data"
    );

    const financialPackets = response.packets.filter(
      (p) => p.category === "finance"
    );

    if (financialPackets.length === 0) {
      return `Aucune donnée financière trouvée pour "${query}".`;
    }

    return formatPackets(financialPackets);
  } catch (err) {
    return `Erreur lors de la récupération des données financières : ${err instanceof Error ? err.message : "Erreur inconnue"}`;
  }
}
