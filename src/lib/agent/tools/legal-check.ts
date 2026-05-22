import { queryDataBroker } from "@/lib/data-broker";
import { formatPackets } from "../formatters";
import { BoardContext } from "@/lib/data-broker/schemas/query-params";
import { withTimeout } from "./timeout";

export async function executeLegalCheck(
  input: Record<string, unknown>,
  boardContext?: BoardContext
): Promise<string> {
  const query = input.query as string;
  const code = input.code as string | undefined;

  const queryParts = [query];
  if (code) queryParts.push(`code ${code}`);

  try {
    const response = await withTimeout(
      queryDataBroker({
        query: queryParts.join(" "),
        board_context: boardContext,
        mode: "chatbot",
      }),
      "check_legal"
    );

    const legalPackets = response.packets.filter(
      (p) => p.category === "legal" || p.data_type === "document"
    );

    if (legalPackets.length === 0) {
      return `Aucun texte juridique trouvé pour "${query}". Note : Legifrance peut être temporairement indisponible, les résultats proviennent alors d'une recherche web.`;
    }

    return formatPackets(legalPackets);
  } catch (err) {
    return `Erreur lors de la recherche juridique : ${err instanceof Error ? err.message : "Erreur inconnue"}`;
  }
}
