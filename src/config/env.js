const dotenv = require("dotenv");

dotenv.config();

module.exports = {
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL,
  ptProductSearchApiToken: process.env.PT_PRODUCT_SEARCH_API_TOKEN || "",
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 10000),
  browserFallbackTimeoutMs: Number(process.env.BROWSER_FALLBACK_TIMEOUT_MS || 45000),
  browserFallbackHeadless: process.env.BROWSER_FALLBACK_HEADLESS !== "false",
  trierRequestTimeoutMs: Number(process.env.TRIER_REQUEST_TIMEOUT_MS || 60000),
  vetorRequestTimeoutMs: Number(process.env.VETOR_REQUEST_TIMEOUT_MS || 60000),
  importQueueConcurrency: Number(process.env.IMPORT_QUEUE_CONCURRENCY || 1),
  ptProductSearchMaxRequestsPerMinute: Number(process.env.PT_PRODUCT_SEARCH_MAX_REQUESTS_PER_MINUTE || 45),
};
