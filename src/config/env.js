const dotenv = require("dotenv");

dotenv.config();

module.exports = {
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL,
  openAiApiKey: process.env.OPENAI_API_KEY || "",
  openAiModel: process.env.OPENAI_MODEL || "gpt-5-mini",
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 10000),
  importQueueConcurrency: Number(process.env.IMPORT_QUEUE_CONCURRENCY || 1),
  importItemConcurrency: Number(process.env.IMPORT_ITEM_CONCURRENCY || 5),
};
