import dotenv from "dotenv";
dotenv.config();
import fs from "fs";

function parseCsvList(value, fallback = []) {
  if (!String(value || "").trim()) {
    return fallback;
  }

  return String(value)
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function parseJsonArray(value, fallback = []) {
  if (!String(value || "").trim()) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function pickFirstExistingPath(paths = []) {
  for (const candidate of paths) {
    if (!String(candidate || "").trim()) {
      continue;
    }

    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return "";
}

const env = {
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL,
  ptProductSearchApiToken: process.env.PT_PRODUCT_SEARCH_API_TOKEN || "",
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 10000),
  browserFallbackTimeoutMs: Number(process.env.BROWSER_FALLBACK_TIMEOUT_MS || 45000),
  browserFallbackHeadless: process.env.BROWSER_FALLBACK_HEADLESS !== "false",
  trierRequestTimeoutMs: Number(process.env.TRIER_REQUEST_TIMEOUT_MS || 60000),
  vetorRequestTimeoutMs: Number(process.env.VETOR_REQUEST_TIMEOUT_MS || 60000),
  convertizeApiToken: process.env.CONVERTIZE_API_TOKEN || "",
  convertizeLookupEnabled: process.env.CONVERTIZE_LOOKUP_ENABLED !== "false",
  convertizeEnvironment: process.env.CONVERTIZE_ENVIRONMENT || "",
  convertizeBaseUrl: process.env.CONVERTIZE_BASE_URL || "https://api.convertize.com.br",
  convertizeRequestTimeoutMs: Number(process.env.CONVERTIZE_REQUEST_TIMEOUT_MS || process.env.REQUEST_TIMEOUT_MS || 10000),
  bancoUnicoBaseUrl: process.env.BANCO_UNICO_BASE_URL || "https://unicocontato.tech/banco-unico",
  bancoUnicoRequestTimeoutMs: Number(process.env.BANCO_UNICO_REQUEST_TIMEOUT_MS || 30000),
  bancoUnicoLookupBatchSize: Math.max(1, Number(process.env.BANCO_UNICO_LOOKUP_BATCH_SIZE || 100)),
  openAiApiKey: process.env.OPENAI_API_KEY || "",
  openAiBaseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  openAiWebLookupEnabled: process.env.OPENAI_WEB_LOOKUP_ENABLED === "true",
  openAiWebLookupModel: process.env.OPENAI_WEB_LOOKUP_MODEL || "gpt-4o-mini",
  openAiWebLookupTimeoutMs: Number(process.env.OPENAI_WEB_LOOKUP_TIMEOUT_MS || 45000),
  openAiWebLookupMaxRetries: Math.max(0, Number(process.env.OPENAI_WEB_LOOKUP_MAX_RETRIES || 3)),
  openAiWebLookupRetryBaseDelayMs: Math.max(250, Number(process.env.OPENAI_WEB_LOOKUP_RETRY_BASE_DELAY_MS || 1500)),
  openAiWebLookupRetryMaxDelayMs: Math.max(1000, Number(process.env.OPENAI_WEB_LOOKUP_RETRY_MAX_DELAY_MS || 15000)),
  openAiWebLookupAllowedDomains: parseCsvList(
    process.env.OPENAI_WEB_LOOKUP_ALLOWED_DOMAINS,
    [],
  ),
  openAiWebLookupMinConfidence: Number(process.env.OPENAI_WEB_LOOKUP_MIN_CONFIDENCE || 0.7),
  mercadologicalAiEnabled: process.env.MERCADOLOGICAL_AI_ENABLED !== "false",
  mercadologicalAiModel: process.env.MERCADOLOGICAL_AI_MODEL || "gpt-4o-mini",
  mercadologicalAiTimeoutMs: Number(process.env.MERCADOLOGICAL_AI_TIMEOUT_MS || 30000),
  mercadologicalAiCandidateLimit: Math.max(5, Number(process.env.MERCADOLOGICAL_AI_CANDIDATE_LIMIT || 25)),
  mercadologicalTreeCsvPath: pickFirstExistingPath([
    process.env.MERCADOLOGICAL_TREE_CSV_PATH,
    "C:\\Users\\Comercial\\Downloads\\levantamento_arvore_mercadologica.csv",
    "./levantamento_arvore_mercadologica.csv",
  ]),
  importQueueConcurrency: Number(process.env.IMPORT_QUEUE_CONCURRENCY || 1),
  importItemConcurrency: Number(process.env.IMPORT_ITEM_CONCURRENCY || 3),
  importProviderTriageBatchSize: Math.max(4, Number(process.env.IMPORT_PROVIDER_TRIAGE_BATCH_SIZE || 32)),
  importPublishBatchSize: Math.max(1, Number(process.env.IMPORT_PUBLISH_BATCH_SIZE || 10)),
  importPublishFlushMs: Math.max(50, Number(process.env.IMPORT_PUBLISH_FLUSH_MS || 1500)),
  lookupQueueConcurrency: Math.min(10, Math.max(1, Number(process.env.LOOKUP_QUEUE_CONCURRENCY || 10))),
  lookupBatchMaxItems: Math.min(10, Math.max(1, Number(process.env.LOOKUP_BATCH_MAX_ITEMS || 10))),
  ptProductSearchMaxRequestsPerMinute: Number(process.env.PT_PRODUCT_SEARCH_MAX_REQUESTS_PER_MINUTE || 45),
  lookupSourceMode: process.env.LOOKUP_SOURCE_MODE || "api_first",
  lookupTrustedNameSources: parseCsvList(
    process.env.LOOKUP_TRUSTED_NAME_SOURCES,
    ["convertize", "drogasil"],
  ),
  lookupPreferredNameSources: parseCsvList(
    process.env.LOOKUP_PREFERRED_NAME_SOURCES,
    ["convertize", "drogasil"],
  ),
  lookupPreferredDataSources: parseCsvList(
    process.env.LOOKUP_PREFERRED_DATA_SOURCES,
    ["convertize", "drogasil"],
  ),
  lookupPassThroughSources: parseCsvList(
    process.env.LOOKUP_PASS_THROUGH_SOURCES,
    ["vtex"],
  ),
  drogasilLookupEnabled: process.env.DROGASIL_LOOKUP_ENABLED !== "false",
  htmlLookupSources: parseJsonArray(process.env.HTML_LOOKUP_SOURCES_JSON, []),
};

export default env;
