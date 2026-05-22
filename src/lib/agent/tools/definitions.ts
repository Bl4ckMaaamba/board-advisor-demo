import Anthropic from "@anthropic-ai/sdk";

export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: "search_internal_documents",
    description:
      "Recherche dans la base documentaire interne du board (PV de réunions, rapports financiers, statuts, résolutions, board packs, documents de préparation). Utilise la recherche sémantique Voyage 4 avec reranking Haiku. Utilise cet outil EN PREMIER pour toute question sur l'entreprise, ses décisions passées ou ses documents.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description:
            "Requête de recherche en langage naturel. Sois spécifique — inclus les types de documents, dates, sujets.",
        },
        board_filter: {
          type: "string",
          description: "Nom du board pour filtrer les documents. Optionnel.",
        },
        max_results: {
          type: "number",
          description: "Nombre maximum de résultats (1-10). Défaut : 5.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_company_info",
    description:
      "Récupère le profil complet d'une entreprise depuis les registres officiels : SIREN/SIRET, forme juridique, dirigeants, actionnaires, liens capitalistiques, bilans déposés. Pappers pour les entreprises françaises, OpenCorporates pour l'international.",
    input_schema: {
      type: "object" as const,
      properties: {
        company_name: {
          type: "string",
          description: "Nom de l'entreprise à rechercher",
        },
        siren: {
          type: "string",
          description: "Numéro SIREN si connu (9 chiffres)",
        },
        country: {
          type: "string",
          description: "Code pays (FR, US, GB...). Défaut : FR.",
        },
      },
      required: ["company_name"],
    },
  },
  {
    name: "get_financial_data",
    description:
      "Récupère des données financières : ratios (P/E, EV/EBITDA, ROE), compte de résultat, bilan, cours de bourse, capitalisation boursière. Source : Financial Modeling Prep. Fournir le ticker si connu.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description:
            "Requête financière (ex: 'chiffre d'affaires et marge EBITDA LVMH 2024')",
        },
        ticker: {
          type: "string",
          description: "Symbole boursier si connu (ex: MC.PA, AAPL)",
        },
        metrics: {
          type: "array",
          items: { type: "string" },
          description:
            "Métriques spécifiques : revenue, ebitda, net_income, margins, pe_ratio, debt_to_equity, market_cap, stock_price",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "search_news",
    description:
      "Recherche les actualités et articles de presse récents sur une entreprise, personne, secteur ou sujet. Agrège Brave Search, Tavily, NewsAPI et Google News.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Requête de recherche d'actualités",
        },
        days_back: {
          type: "number",
          description:
            "Nombre de jours à remonter (1-90). Défaut : 30.",
        },
        sources_count: {
          type: "number",
          description: "Nombre d'articles à retourner (1-10). Défaut : 5.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "check_legal",
    description:
      "Recherche dans les textes juridiques et réglementaires français via Legifrance. Couvre le Code de commerce, Code civil, réglementation AMF, code AFEP-MEDEF, loi Sapin II, devoir de vigilance, CSRD.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Question ou sujet juridique/réglementaire",
        },
        code: {
          type: "string",
          description:
            "Code juridique spécifique : commerce, civil, monetaire, travail",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_macro_indicators",
    description:
      "Récupère des données macroéconomiques depuis FRED (Federal Reserve) et World Bank. PIB, inflation (IPC), taux directeurs, chômage, balances commerciales, taux de change.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description:
            "Requête macro (ex: 'croissance PIB zone euro 2024')",
        },
        indicators: {
          type: "array",
          items: { type: "string" },
          description:
            "Indicateurs : gdp, inflation, interest_rate, unemployment, exchange_rate",
        },
        countries: {
          type: "array",
          items: { type: "string" },
          description: "Codes pays : FR, US, DE, GB, EU",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "sector_benchmark",
    description:
      "Compare la performance financière d'une entreprise avec ses pairs sectoriels. Récupère les moyennes et médianes du secteur pour le benchmarking. Utiliser après get_financial_data pour mettre en perspective.",
    input_schema: {
      type: "object" as const,
      properties: {
        sector: {
          type: "string",
          description:
            "Secteur d'activité (ex: 'luxe', 'automobile', 'banque', 'logistique')",
        },
        company_ticker: {
          type: "string",
          description: "Ticker de l'entreprise principale pour comparaison",
        },
        metrics: {
          type: "array",
          items: { type: "string" },
          description:
            "Métriques à comparer : revenue_growth, ebitda_margin, roe, pe_ratio, debt_ratio",
        },
      },
      required: ["sector"],
    },
  },
];
