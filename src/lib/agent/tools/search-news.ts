import { queryDataBroker } from "@/lib/data-broker";
import { formatPackets } from "../formatters";
import { BoardContext } from "@/lib/data-broker/schemas/query-params";
import { withTimeout } from "./timeout";

export async function executeSearchNews(
  input: Record<string, unknown>,
  boardContext?: BoardContext
): Promise<string> {
  const query = input.query as string;
  const daysBack = (input.days_back as number) || 30;
  const sourcesCount = (input.sources_count as number) || 5;

  // Encode time window into query for the Data Broker classifier
  const enrichedQuery = `${query} (actualités des ${daysBack} derniers jours)`;

  try {
    const response = await withTimeout(
      queryDataBroker({
        query: enrichedQuery,
        board_context: boardContext,
        mode: "chatbot",
      }),
      "search_news"
    );

    const newsPackets = response.packets
      .filter((p) => p.category === "press" || p.data_type === "article")
      .slice(0, sourcesCount);

    if (newsPackets.length === 0) {
      return `Aucune actualité trouvée pour "${query}".`;
    }

    return formatPackets(newsPackets);
  } catch (err) {
    return `Erreur lors de la recherche d'actualités : ${err instanceof Error ? err.message : "Erreur inconnue"}`;
  }
}
