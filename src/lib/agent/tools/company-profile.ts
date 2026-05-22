import { queryDataBroker } from "@/lib/data-broker";
import { formatPackets } from "../formatters";
import { BoardContext } from "@/lib/data-broker/schemas/query-params";
import { withTimeout } from "./timeout";

export async function executeCompanyProfile(
  input: Record<string, unknown>,
  boardContext?: BoardContext
): Promise<string> {
  const companyName = input.company_name as string;
  const siren = input.siren as string | undefined;
  const country = (input.country as string) || "FR";

  const queryParts = [`profil entreprise ${companyName}`];
  if (siren) queryParts.push(`SIREN ${siren}`);
  if (country !== "FR") queryParts.push(`pays ${country}`);

  try {
    const response = await withTimeout(
      queryDataBroker({
        query: queryParts.join(" "),
        board_context: boardContext,
        mode: "chatbot",
      }),
      "get_company_info"
    );

    const relevantPackets = response.packets.filter(
      (p) =>
        p.provider === "pappers" ||
        p.provider === "opencorporates" ||
        p.category === "finance"
    );

    if (relevantPackets.length === 0) {
      return `Aucune information trouvée pour l'entreprise "${companyName}".`;
    }

    return formatPackets(relevantPackets);
  } catch (err) {
    return `Erreur lors de la recherche d'informations sur ${companyName} : ${err instanceof Error ? err.message : "Erreur inconnue"}`;
  }
}
