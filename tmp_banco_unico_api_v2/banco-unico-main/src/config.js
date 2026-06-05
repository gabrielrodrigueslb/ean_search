const dotenv = require("dotenv");

dotenv.config();

function readInteger(name, fallback) {
  const rawValue = process.env[name];

  if (rawValue === undefined || rawValue === "") {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);

  if (Number.isNaN(parsed)) {
    throw new Error(`Variavel ${name} precisa ser um numero inteiro.`);
  }

  return parsed;
}

function readBoolean(name, fallback) {
  const rawValue = process.env[name];

  if (rawValue === undefined || rawValue === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(rawValue.toLowerCase());
}

function readString(name, fallback = null) {
  const rawValue = process.env[name];

  if (rawValue === undefined || rawValue === "") {
    return fallback;
  }

  const normalized = String(rawValue).trim();
  return normalized || fallback;
}

function readFirstInteger(names, fallback) {
  for (const name of names) {
    const rawValue = process.env[name];

    if (rawValue === undefined || rawValue === "") {
      continue;
    }

    return readInteger(name, fallback);
  }

  return fallback;
}

function resolveDatabaseConfig() {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
    };
  }

  const host = process.env.DB_HOST || process.env.POSTGRES_HOST;
  const port = readInteger("DB_PORT", readInteger("POSTGRES_PORT", 5432));
  const database = process.env.DB_NAME || process.env.POSTGRES_DB;
  const user = process.env.DB_USER || process.env.POSTGRES_USER;
  const password = process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD;

  if (!host || !database || !user) {
    throw new Error(
      "Defina DATABASE_URL ou as variaveis DB_HOST, DB_NAME e DB_USER no arquivo .env.",
    );
  }

  return {
    host,
    port,
    database,
    user,
    password,
  };
}

function resolveOpenAiEmbeddingMaxDimensions(model) {
  switch (model) {
    case "text-embedding-3-small":
      return 1536;
    case "text-embedding-3-large":
      return 3072;
    default:
      return null;
  }
}

const config = Object.freeze({
  port: readInteger("PORT", 3000),
  database: resolveDatabaseConfig(),
  databaseSsl: readBoolean("DATABASE_SSL", false),
  openAiApiKey: readString("OPENAI_API_KEY", null),
  openAiEmbeddingModel: readString("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"),
  openAiProductRelevanceModel: readString(
    "OPENAI_PRODUCT_RELEVANCE_MODEL",
    "gpt-4o-mini",
  ),
  vectorDimensions: readInteger("VECTOR_DIMENSIONS", 512),
  defaultSearchLimit: readInteger("DEFAULT_SEARCH_LIMIT", 10),
  maxSearchLimit: readInteger("MAX_SEARCH_LIMIT", 50),
  maxTokensPerProduct: readFirstInteger(
    ["MAX_TOKENS_PER_PRODUCT", "MAX_TOKENS_PER_DOCUMENT"],
    256,
  ),
  defaultIncludeRelevanceScore: readBoolean("DEFAULT_INCLUDE_RELEVANCE_SCORE", false),
  integrationRequestTimeoutMs: readInteger("INTEGRATION_REQUEST_TIMEOUT_MS", 15000),
  upsertBatchSize: readInteger("UPSERT_BATCH_SIZE", 1000),
  maxReturnedProducts: readInteger("MAX_RETURNED_PRODUCTS", 100),
});

if (config.vectorDimensions < 16) {
  throw new Error("VECTOR_DIMENSIONS precisa ser pelo menos 16.");
}

if (!config.openAiApiKey) {
  throw new Error("Defina OPENAI_API_KEY no arquivo .env para gerar embeddings reais da OpenAI.");
}

if (!config.openAiEmbeddingModel.startsWith("text-embedding-3")) {
  throw new Error(
    "OPENAI_EMBEDDING_MODEL precisa usar a familia text-embedding-3 para respeitar VECTOR_DIMENSIONS sem mudar o schema.",
  );
}

const maxOpenAiEmbeddingDimensions = resolveOpenAiEmbeddingMaxDimensions(config.openAiEmbeddingModel);

if (maxOpenAiEmbeddingDimensions !== null && config.vectorDimensions > maxOpenAiEmbeddingDimensions) {
  throw new Error(
    `VECTOR_DIMENSIONS=${config.vectorDimensions} excede o maximo de ${maxOpenAiEmbeddingDimensions} para ${config.openAiEmbeddingModel}.`,
  );
}

module.exports = {
  config,
};
