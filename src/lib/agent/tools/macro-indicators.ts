import { queryDataBroker } from "@/lib/data-broker";
import { formatPackets } from "../formatters";
import { BoardContext } from "@/lib/data-broker/schemas/query-params";
import { withTimeout } from "./timeout";

export async function executeMacroIndicators(
  input: Record<string, unknown>,
  boardContext?: BoardContext
): Promise<string> {
  const query = input.query as string;
  const indicators = input.indicators as string[] | undefined;
  const countries = input.countries as string[] | undefined;

  const queryParts = [query];
  if (indicators && indicators.length > 0) queryParts.push(`indicateurs: ${indicators.join(", ")}`);
  if (countries && countries.length > 0) queryParts.push(`pays: ${countries.join(", ")}`);

  try {
    const response = await withTimeout(
      queryDataBroker({
        query: queryParts.join(" "),
        board_context: boardContext,
        mode: "chatbot",
      }),
      "get_macro_indicators"
    );

    const macroPackets = response.packets.filter(
      (p) => p.category === "macro" || p.data_type === "timeseries"
    );

    if (macroPackets.length === 0) {
      return `Aucun indicateur macroéconomique trouvé pour "${query}".`;
    }

    return formatPackets(macroPackets);
  } catch (err) {
    return `Erreur lors de la récupération des indicateurs macro : ${err instanceof Error ? err.message : "Erreur inconnue"}`;
  }
}
