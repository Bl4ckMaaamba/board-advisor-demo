import Anthropic from "@anthropic-ai/sdk";
import { QueryClassification, Intent, Entity } from "../schemas/query-plan";
import { getEnvVar } from "../utils/env";
import { brokerLogger } from "../utils/logger";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: getEnvVar("ANTHROPIC_API_KEY") });
  }
  return client;
}

const INTENT_KEYWORDS: Record<Intent, string[]> = {
  benchmark: [
    "multiple", "ebitda", "ratio", "comparable", "valorisation", "marge",
    "chiffre d'affaires", "ca", "bilan", "p&l", "résultat", "croissance",
    "secteur", "industrie", "comparaison", "benchmark", "financier",
    "cours", "action", "bourse", "capitalisation",
  ],
  fact_check: [
    "vrai", "faux", "confirmer", "vérifier", "fact-check", "est-ce que",
    "a-t-il", "a-t-elle", "levée", "acquisition", "rachat", "annonce",
    "rumeur", "source", "confirme",
  ],
  news: [
    "actualité", "nouvelle", "récent", "dernière", "presse", "article",
    "annonce", "communiqué", "journal", "média",
  ],
  legal: [
    "loi", "décret", "règlement", "article", "code", "juridique", "légal",
    "directive", "norme", "conformité", "réglementation", "jurisprudence",
    "tribunal", "cour", "droit",
  ],
  macro: [
    "pib", "inflation", "taux", "chômage", "croissance", "économie",
    "macro", "fed", "bce", "banque centrale", "dette", "budget",
    "commerce", "export", "import", "devise", "euro", "dollar",
  ],
  esg: [
    "esg", "rse", "environnement", "social", "gouvernance", "carbone",
    "émission", "climat", "durable", "responsable", "dpef", "extra-financier",
  ],
};

function classifyByRules(query: string): QueryClassification {
  const lower = query.toLowerCase();
  const scores: Record<Intent, number> = {
    benchmark: 0,
    fact_check: 0,
    news: 0,
    legal: 0,
    macro: 0,
    esg: 0,
  };

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        scores[intent as Intent]++;
      }
    }
  }

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  const intent = (best[1] > 0 ? best[0] : "benchmark") as Intent;

  // Simple entity extraction: capitalized words and numbers
  const STOPWORDS = new Set([
    "Quel", "Quelle", "Quels", "Quelles", "Est", "Sont", "Les", "Des", "Une",
    "Avec", "Dans", "Pour", "Sur", "Par", "Aux", "Que", "Qui", "Comment",
    "Pourquoi", "Combien", "Quand", "Selon", "Entre", "Depuis", "Vers",
    "Après", "Avant", "Encore", "Aussi", "Bien", "Chez", "Tout", "Tous",
    "Toutes", "Très", "Plus", "Moins", "Dernière", "Dernières", "Derniers",
    "Voici", "Article", "Code",
  ]);

  const entities: Entity[] = [];
  const wordMatches = query.match(/[A-Z][a-zÀ-ÿ]+(?:\s[A-Z][a-zÀ-ÿ]+)*/g);
  if (wordMatches) {
    for (const match of wordMatches) {
      if (!STOPWORDS.has(match.split(" ")[0])) {
        entities.push({ name: match, type: "entity" });
      }
    }
  }
  const numberMatches = query.match(/\d+[,.]?\d*\s*[%€$M]?/g);
  if (numberMatches) {
    for (const match of numberMatches) {
      entities.push({ name: match.trim(), type: "number" });
    }
  }

  return {
    intent,
    entities,
    language: "fr",
    confidence: best[1] > 2 ? 0.7 : 0.4,
  };
}

export async function classifyQuery(query: string): Promise<QueryClassification> {
  try {
    const response = await getClient().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `Analyse cette requête d'un membre de conseil d'administration et classifie-la.

Requête: "${query}"

Réponds UNIQUEMENT avec un JSON valide (pas de markdown, pas de texte autour):
{
  "intent": "benchmark|fact_check|news|legal|macro|esg",
  "entities": [{"name": "...", "type": "company|sector|metric|person|country|number|regulation"}],
  "language": "fr|en",
  "confidence": 0.0-1.0
}

Intents:
- benchmark: questions sur des données financières, ratios, comparaisons sectorielles
- fact_check: vérification d'une affirmation ou d'un fait
- news: recherche d'actualités récentes
- legal: questions juridiques, réglementaires, textes de loi
- macro: indicateurs macroéconomiques (PIB, inflation, taux)
- esg: questions ESG, RSE, environnement, social, gouvernance`,
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const parsed = JSON.parse(text);

    return {
      intent: parsed.intent as Intent,
      entities: (parsed.entities ?? []).map((e: { name: string; type: string }) => ({
        name: e.name,
        type: e.type,
      })),
      language: parsed.language ?? "fr",
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.8,
    };
  } catch (error) {
    brokerLogger.warn("LLM classifier failed, using rule-based fallback", {
      error: String(error),
    });
    return classifyByRules(query);
  }
}
