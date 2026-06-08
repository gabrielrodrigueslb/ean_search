const crypto = require("node:crypto");

const { config } = require("../../../../config");
const { createHttpError } = require("../../../../shared/utils/http-error");
const { mapVetorProduct } = require("./vetor.mapper");

const DEFAULT_BASE_URL = "https://integracao.zetti.dev";
const PRODUTOS_CONSULTA_PATH = "/api/ecommerce/produtos/consulta";
const CACHE_CLEANUP_INTERVAL_MS = 60 * 1000;

const vetorProductCache = new Map();
let lastCacheCleanupAt = 0;

function positiveNumberFromEnv(name, fallback) {
  const rawValue = process.env[name];

  if (rawValue === undefined || rawValue === "") {
    return fallback;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeNumberFromEnv(name, fallback) {
  const rawValue = process.env[name];

  if (rawValue === undefined || rawValue === "") {
    return fallback;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeEan(value) {
  const digitsOnly = String(value || "").replace(/\D+/g, "");
  return digitsOnly || null;
}

function startTimer() {
  return process.hrtime.bigint();
}

function elapsedMs(startedAt) {
  return Number(process.hrtime.bigint() - startedAt) / 1e6;
}

function roundDurationMs(value) {
  return Number(value.toFixed(1));
}

function splitInChunks(items, chunkSize) {
  const chunks = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function buildCodigoBarrasFilter(eans) {
  return eans
    .map((ean) => `codigoBarras eq '${String(ean).replace(/'/g, "''")}'`)
    .join(" or ");
}

function buildConsultaFilter(eans, cdfilial) {
  const filters = [];
  const codigoBarrasFilter = buildCodigoBarrasFilter(eans);

  if (codigoBarrasFilter) {
    filters.push(`(${codigoBarrasFilter})`);
  }

  if (Number.isInteger(cdfilial)) {
    filters.push(`cdFilial eq ${cdfilial}`);
  }

  return filters.join(" and ");
}

async function runWithConcurrencyLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runWorker() {
    while (true) {
      const currentIndex = cursor;
      cursor += 1;

      if (currentIndex >= items.length) {
        return;
      }

      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

  return results;
}

function flattenVetorResponseItems(responseBody) {
  if (Array.isArray(responseBody)) {
    return responseBody;
  }

  return Array.isArray(responseBody?.data)
    ? responseBody.data
    : [];
}

function hashToken(vetorToken) {
  return crypto
    .createHash("sha256")
    .update(String(vetorToken || ""))
    .digest("hex")
    .slice(0, 12);
}

function buildCacheKey(tokenHash, cdfilial, ean) {
  return `${tokenHash}:${cdfilial}:${ean}`;
}

function getCachedProducts(cacheKey, nowMs) {
  const entry = vetorProductCache.get(cacheKey);

  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= nowMs) {
    vetorProductCache.delete(cacheKey);
    return null;
  }

  return entry.items;
}

function setCachedProducts(cacheKey, products, ttlMs, nowMs) {
  vetorProductCache.set(cacheKey, {
    items: Array.isArray(products) ? products.slice() : [],
    expiresAt: nowMs + ttlMs,
  });
}

function pruneCache(nowMs, maxEntries) {
  if (vetorProductCache.size === 0) {
    return;
  }

  if ((nowMs - lastCacheCleanupAt) < CACHE_CLEANUP_INTERVAL_MS && vetorProductCache.size <= maxEntries) {
    return;
  }

  lastCacheCleanupAt = nowMs;

  for (const [cacheKey, entry] of vetorProductCache.entries()) {
    if (entry.expiresAt <= nowMs) {
      vetorProductCache.delete(cacheKey);
    }
  }

  if (vetorProductCache.size <= maxEntries) {
    return;
  }

  const entriesByExpiration = [...vetorProductCache.entries()]
    .sort(([, left], [, right]) => left.expiresAt - right.expiresAt);
  const overflowCount = vetorProductCache.size - maxEntries;

  for (let index = 0; index < overflowCount; index += 1) {
    const cacheKey = entriesByExpiration[index]?.[0];

    if (cacheKey) {
      vetorProductCache.delete(cacheKey);
    }
  }
}

function groupProductsByEan(products) {
  const productsByEan = new Map();

  for (const product of products) {
    const normalizedEan = normalizeEan(product?.ean);

    if (!normalizedEan) {
      continue;
    }

    const currentGroup = productsByEan.get(normalizedEan) || [];
    currentGroup.push(product);
    productsByEan.set(normalizedEan, currentGroup);
  }

  return productsByEan;
}

async function readJsonResponse(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    return text;
  }
}

class VetorClientProvider {
  constructor() {
    this.baseUrl = process.env.VETOR_API_BASE_URL || DEFAULT_BASE_URL;
    this.maxEansPerRequest = positiveNumberFromEnv("VETOR_MAX_EANS_PER_REQUEST", 8);
    this.maxParallelRequests = positiveNumberFromEnv("VETOR_MAX_PARALLEL_REQUESTS", 6);
    this.cacheTtlMs = nonNegativeNumberFromEnv("VETOR_CACHE_TTL_MS", 5 * 60 * 1000);
    this.cacheMaxEntries = positiveNumberFromEnv("VETOR_CACHE_MAX_ENTRIES", 5000);
    this.timeoutMs = positiveNumberFromEnv("VETOR_TIMEOUT_MS", config.integrationRequestTimeoutMs);
  }

  async fetchChunk(vetorToken, chunk, cdfilial) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const url = new URL(PRODUTOS_CONSULTA_PATH, this.baseUrl);
      url.searchParams.set("$filter", buildConsultaFilter(chunk, cdfilial));
      url.searchParams.set("$top", "500");

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `ApiKey ${vetorToken}`,
        },
        signal: controller.signal,
      });
      const responseBody = await readJsonResponse(response);

      if (!response.ok) {
        throw createHttpError(
          response.status,
          `A Vetor respondeu com status ${response.status}.`,
          {
            code: "VETOR_HTTP_ERROR",
            cause: responseBody,
          },
        );
      }

      return flattenVetorResponseItems(responseBody);
    } catch (error) {
      if (error?.name === "AbortError") {
        throw createHttpError(504, `A Vetor excedeu o timeout de ${this.timeoutMs}ms.`, {
          code: "VETOR_TIMEOUT",
          cause: error,
        });
      }

      throw error;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  async fetchChunkWithAdaptiveFallback(vetorToken, chunk, cdfilial, depth = 0) {
    const items = await this.fetchChunk(vetorToken, chunk, cdfilial);

    if (items.length > 0 || chunk.length <= 1 || depth >= 4) {
      return items;
    }

    const midpoint = Math.ceil(chunk.length / 2);
    const leftChunk = chunk.slice(0, midpoint);
    const rightChunk = chunk.slice(midpoint);

    const [leftItems, rightItems] = await Promise.all([
      this.fetchChunkWithAdaptiveFallback(vetorToken, leftChunk, cdfilial, depth + 1),
      this.fetchChunkWithAdaptiveFallback(vetorToken, rightChunk, cdfilial, depth + 1),
    ]);

    return [...leftItems, ...rightItems];
  }

  async searchByEans(eans, options = {}) {
    const searchStartedAt = startTimer();
    const vetorToken = String(options?.vetorToken || "").trim();
    const cdfilial = options?.cdfilial;
    const uniqueEans = [...new Set(
      (Array.isArray(eans) ? eans : [])
        .map(normalizeEan)
        .filter(Boolean),
    )];

    if (uniqueEans.length === 0) {
      return [];
    }

    if (!vetorToken) {
      throw createHttpError(400, "Token da Vetor não informado.", {
        code: "missing_vetor_token",
      });
    }

    pruneCache(Date.now(), this.cacheMaxEntries);

    const tokenHash = hashToken(vetorToken);
    const cacheLookupAt = Date.now();
    const cachedProducts = [];
    const missingEans = [];

    for (const ean of uniqueEans) {
      const cacheKey = buildCacheKey(tokenHash, cdfilial, ean);
      const cachedItems = getCachedProducts(cacheKey, cacheLookupAt);

      if (cachedItems) {
        cachedProducts.push(...cachedItems);
        continue;
      }

      missingEans.push(ean);
    }

    let remoteProducts = [];

    if (missingEans.length > 0) {
      const chunks = splitInChunks(missingEans, this.maxEansPerRequest);
      const chunkStartedAt = startTimer();
      const chunkResults = await runWithConcurrencyLimit(
        chunks,
        this.maxParallelRequests,
        (chunk) => this.fetchChunkWithAdaptiveFallback(vetorToken, chunk, cdfilial),
      );

      remoteProducts = chunkResults
        .flat()
        .map(mapVetorProduct);

      const remoteProductsByEan = groupProductsByEan(remoteProducts);
      const cacheWriteAt = Date.now();

      for (const ean of missingEans) {
        const cacheKey = buildCacheKey(tokenHash, cdfilial, ean);
        setCachedProducts(cacheKey, remoteProductsByEan.get(ean) || [], this.cacheTtlMs, cacheWriteAt);
      }

      pruneCache(cacheWriteAt, this.cacheMaxEntries);

      options?.traceLogger?.step?.("vetor.searchByEans", "Consulta à Vetor concluída.", {
        uniqueEans: uniqueEans.length,
        missingEans: missingEans.length,
        chunkCount: chunks.length,
        totalDurationMs: roundDurationMs(elapsedMs(chunkStartedAt)),
      });
    }

    return [...cachedProducts, ...remoteProducts];
  }
}

module.exports = {
  VetorClientProvider,
};
