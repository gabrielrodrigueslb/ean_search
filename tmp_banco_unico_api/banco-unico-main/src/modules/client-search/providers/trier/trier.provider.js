const crypto = require("node:crypto");

const { config } = require("../../../../config");
const { createHttpError } = require("../../../../shared/utils/http-error");
const { sanitizeBearerToken } = require("../provider-request.utils");
const { mapTrierProduct } = require("./trier.mapper");

const DEFAULT_BASE_URL = "https://api-sgf-gateway.triersistemas.com.br/sgfpod1";
const PRODUTOS_OBTER_PATH = "/rest/integracao/produto/obter-v1";
const CACHE_CLEANUP_INTERVAL_MS = 60 * 1000;

const trierProductCache = new Map();
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

function booleanFromEnv(name, fallback) {
  const rawValue = process.env[name];

  if (rawValue === undefined || rawValue === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(String(rawValue).toLowerCase());
}

function normalizeBaseUrl(value) {
  const candidate = String(value || DEFAULT_BASE_URL).trim();

  try {
    const url = new URL(candidate);
    const normalizedPath = url.pathname
      .replace(/\/rest\/integracao\/produto\/.*$/i, "")
      .replace(/\/+$/, "");

    return `${url.origin}${normalizedPath || ""}`;
  } catch {
    return DEFAULT_BASE_URL;
  }
}

function buildRequestUrl(baseUrl, path) {
  const normalizedBaseUrl = String(baseUrl || "").replace(/\/+$/, "");
  const normalizedPath = String(path || "").replace(/^\/+/, "");
  return new URL(`${normalizedBaseUrl}/${normalizedPath}`);
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

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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

function flattenTrierResponseItems(responseBody) {
  if (Array.isArray(responseBody)) {
    return responseBody;
  }

  return Array.isArray(responseBody?.data)
    ? responseBody.data
    : [];
}

function hashToken(trierToken) {
  return crypto
    .createHash("sha256")
    .update(String(trierToken || ""))
    .digest("hex")
    .slice(0, 12);
}

function buildCacheKey(tokenHash, cdfilial, ean) {
  return `${tokenHash}:${cdfilial}:${ean}`;
}

function getCachedProducts(cacheKey, nowMs) {
  const entry = trierProductCache.get(cacheKey);

  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= nowMs) {
    trierProductCache.delete(cacheKey);
    return null;
  }

  return entry.items;
}

function setCachedProducts(cacheKey, products, ttlMs, nowMs) {
  trierProductCache.set(cacheKey, {
    items: Array.isArray(products) ? products.slice() : [],
    expiresAt: nowMs + ttlMs,
  });
}

function pruneCache(nowMs, maxEntries) {
  if (trierProductCache.size === 0) {
    return;
  }

  if ((nowMs - lastCacheCleanupAt) < CACHE_CLEANUP_INTERVAL_MS && trierProductCache.size <= maxEntries) {
    return;
  }

  lastCacheCleanupAt = nowMs;

  for (const [cacheKey, entry] of trierProductCache.entries()) {
    if (entry.expiresAt <= nowMs) {
      trierProductCache.delete(cacheKey);
    }
  }

  if (trierProductCache.size <= maxEntries) {
    return;
  }

  const entriesByExpiration = [...trierProductCache.entries()]
    .sort(([, left], [, right]) => left.expiresAt - right.expiresAt);
  const overflowCount = trierProductCache.size - maxEntries;

  for (let index = 0; index < overflowCount; index += 1) {
    const cacheKey = entriesByExpiration[index]?.[0];

    if (cacheKey) {
      trierProductCache.delete(cacheKey);
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

function getErrorMessage(error, responseBody = null) {
  if (typeof responseBody === "string" && responseBody.trim()) {
    return responseBody.trim();
  }

  return responseBody?.message
    || responseBody?.msg
    || error?.message
    || "Erro ao consultar a Trier.";
}

function shouldRetryError(error) {
  const status = Number(error?.statusCode);

  if (!Number.isFinite(status)) {
    return true;
  }

  return status === 408
    || status === 425
    || status === 429
    || status === 545
    || status >= 500;
}

function shouldSkipEanAfterRetries(error) {
  const status = Number(error?.statusCode);
  return status === 404 || status === 545 || status === 554;
}

class TrierClientProvider {
  constructor() {
    this.baseUrl = normalizeBaseUrl(process.env.TRIER_API_BASE_URL || DEFAULT_BASE_URL);
    this.maxParallelRequests = positiveNumberFromEnv("TRIER_MAX_PARALLEL_REQUESTS", 1);
    this.cacheTtlMs = nonNegativeNumberFromEnv("TRIER_CACHE_TTL_MS", 5 * 60 * 1000);
    this.cacheMaxEntries = positiveNumberFromEnv("TRIER_CACHE_MAX_ENTRIES", 5000);
    this.queryPageSize = positiveNumberFromEnv("TRIER_QUERY_PAGE_SIZE", 10);
    this.retryAttempts = positiveNumberFromEnv("TRIER_RETRY_ATTEMPTS", 2);
    this.retryDelayMs = positiveNumberFromEnv("TRIER_RETRY_DELAY_MS", 400);
    this.onlyActive = booleanFromEnv("TRIER_ONLY_ACTIVE", true);
    this.onlyEcommerce = booleanFromEnv("TRIER_ONLY_ECOMMERCE", true);
    this.timeoutMs = positiveNumberFromEnv("TRIER_TIMEOUT_MS", config.integrationRequestTimeoutMs);
  }

  buildQueryParams(ean) {
    const params = new URLSearchParams();
    params.set("primeiroRegistro", "0");
    params.set("quantidadeRegistros", String(this.queryPageSize));
    params.set("processaCustoMedio", "false");
    params.set("codigoBarras", ean);

    if (this.onlyActive) {
      params.set("ativo", "true");
    }

    if (this.onlyEcommerce) {
      params.set("integracaoEcommerce", "true");
    }

    return params;
  }

  async fetchByEan(trierToken, ean) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const url = buildRequestUrl(this.baseUrl, PRODUTOS_OBTER_PATH);
      url.search = this.buildQueryParams(ean).toString();

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${trierToken}`,
        },
        signal: controller.signal,
      });
      const responseBody = await readJsonResponse(response);

      if (!response.ok) {
        throw createHttpError(
          response.status,
          `A Trier respondeu com status ${response.status}.`,
          {
            code: "TRIER_HTTP_ERROR",
            cause: responseBody,
          },
        );
      }

      return flattenTrierResponseItems(responseBody);
    } catch (error) {
      if (error?.name === "AbortError") {
        throw createHttpError(504, `A Trier excedeu o timeout de ${this.timeoutMs}ms.`, {
          code: "TRIER_TIMEOUT",
          cause: error,
        });
      }

      if (Number.isInteger(error?.statusCode)) {
        throw error;
      }

      throw createHttpError(502, getErrorMessage(error), {
        code: "TRIER_NETWORK_ERROR",
        cause: error,
      });
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  async fetchByEanWithRetry(trierToken, ean) {
    let attempt = 0;

    while (attempt < this.retryAttempts) {
      attempt += 1;

      try {
        return await this.fetchByEan(trierToken, ean);
      } catch (error) {
        if (attempt >= this.retryAttempts || !shouldRetryError(error)) {
          throw error;
        }

        await sleep(this.retryDelayMs);
      }
    }

    return [];
  }

  async searchByEans(eans, options = {}) {
    const searchStartedAt = startTimer();
    const trierToken = sanitizeBearerToken(options?.trierToken);
    const cdfilial = options?.cdfilial ?? 1;
    const uniqueEans = [...new Set(
      (Array.isArray(eans) ? eans : [])
        .map(normalizeEan)
        .filter(Boolean),
    )];

    if (uniqueEans.length === 0) {
      return [];
    }

    if (!trierToken) {
      throw createHttpError(400, "Token da Trier não informado.", {
        code: "missing_trier_token",
      });
    }

    pruneCache(Date.now(), this.cacheMaxEntries);

    const tokenHash = hashToken(trierToken);
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
      const remoteStartedAt = startTimer();
      const eanResults = await runWithConcurrencyLimit(
        missingEans,
        this.maxParallelRequests,
        async (ean) => {
          try {
            const items = await this.fetchByEanWithRetry(trierToken, ean);
            return items.map(mapTrierProduct);
          } catch (error) {
            if (!shouldSkipEanAfterRetries(error)) {
              throw error;
            }

            return [];
          }
        },
      );

      remoteProducts = eanResults.flat();

      const remoteProductsByEan = groupProductsByEan(remoteProducts);
      const cacheWriteAt = Date.now();

      for (const ean of missingEans) {
        const cacheKey = buildCacheKey(tokenHash, cdfilial, ean);
        setCachedProducts(cacheKey, remoteProductsByEan.get(ean) || [], this.cacheTtlMs, cacheWriteAt);
      }

      pruneCache(cacheWriteAt, this.cacheMaxEntries);

      options?.traceLogger?.step?.("trier.searchByEans", "Consulta à Trier concluída.", {
        uniqueEans: uniqueEans.length,
        missingEans: missingEans.length,
        totalDurationMs: roundDurationMs(elapsedMs(remoteStartedAt)),
      });
    }

    options?.traceLogger?.step?.("trier.searchByEans", "Busca finalizada.", {
      uniqueEans: uniqueEans.length,
      cachedProducts: cachedProducts.length,
      remoteProducts: remoteProducts.length,
      totalDurationMs: roundDurationMs(elapsedMs(searchStartedAt)),
    });

    return [...cachedProducts, ...remoteProducts];
  }
}

module.exports = {
  TrierClientProvider,
};
