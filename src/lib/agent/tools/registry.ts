import { ToolExecutor } from "../types";
import { executeSearchInternal } from "./search-internal";
import { executeCompanyProfile } from "./company-profile";
import { executeFinancialData } from "./financial-data";
import { executeSearchNews } from "./search-news";
import { executeLegalCheck } from "./legal-check";
import { executeMacroIndicators } from "./macro-indicators";
import { executeSectorBenchmark } from "./sector-benchmark";

export const TOOL_EXECUTORS: Record<string, ToolExecutor> = {
  search_internal_documents: executeSearchInternal,
  get_company_info: executeCompanyProfile,
  get_financial_data: executeFinancialData,
  search_news: executeSearchNews,
  check_legal: executeLegalCheck,
  get_macro_indicators: executeMacroIndicators,
  sector_benchmark: executeSectorBenchmark,
};

export { TOOL_LABELS } from "./labels";
