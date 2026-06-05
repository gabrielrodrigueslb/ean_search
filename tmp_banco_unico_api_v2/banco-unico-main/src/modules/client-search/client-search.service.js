const { config } = require("../../config");
const { createHttpError } = require("../../shared/utils/http-error");
const { searchProducts } = require("../products/products.service");
const { getClientSearchProvider, listClientSearchProviders } = require("./client-provider-registry");
const { mergeClientSearchResults } = require("./client-search-merge.service");
const {
  mergeProviderOptions,
  throwInvalidProviderRequest,
} = require("./providers/provider-request.utils");

const DEFAULT_SEARCH_LIMIT_MULTIPLIER = 2;

function buildSearchLimit(rawLimit) {
  const requestedLimit = Number.parseInt(rawLimit, 10);

  return Number.isNaN(requestedLimit)
    ? config.defaultSearchLimit
    : Math.min(Math.max(requestedLimit, 1), config.maxSearchLimit);
}

function getNextSearchLimit(currentLimit) {
  const multipliedLimit = Math.floor(currentLimit * DEFAULT_SEARCH_LIMIT_MULTIPLIER);
  const candidateLimit = Math.max(currentLimit + 1, multipliedLimit);
  return Math.min(config.maxSearchLimit, candidateLimit);
}

function dedupeProductsByEan(products) {
  const productsByEan = new Map();

  for (const product of Array.isArray(products) ? products : []) {
    const normalizedEan = String(product?.ean || "").trim();

    if (!normalizedEan || productsByEan.has(normalizedEan)) {
      continue;
    }

    productsByEan.set(normalizedEan, product);
  }

  return [...productsByEan.values()];
}

function extractMatchedEans(products) {
  return dedupeProductsByEan(products)
    .map((product) => String(product.ean || "").trim())
    .filter(Boolean);
}

function inferProviderKey(params, forcedProviderKey) {
  if (forcedProviderKey) {
    return String(forcedProviderKey).trim().toLowerCase();
  }

  const explicitProvider = params?.providerKey || params?.provider || params?.clientProvider;

  if (explicitProvider && String(explicitProvider).trim()) {
    return String(explicitProvider).trim().toLowerCase();
  }

  if (params?.vetorToken) {
    return "vetor";
  }

  if (params?.trierToken) {
    return "trier";
  }

  if (params?.alpha7Authenticate || params?.alpha7ApiKey) {
    return "alpha7";
  }

  return null;
}

function normalizeProviderSearchRequest(params = {}, options = {}) {
  const providerKey = inferProviderKey(params, options.providerKey);

  if (!providerKey) {
    throw createHttpError(
      400,
      "Informe um provider para consultar o catálogo externo ou envie vetorToken/trierToken/alpha7Authenticate para a integração local.",
      {
        code: "missing_provider",
      },
    );
  }

  const providerDefinition = getClientSearchProvider(providerKey);

  if (!providerDefinition) {
    throw createHttpError(400, `Provider externo não suportado: ${providerKey}.`, {
      code: "unsupported_provider",
    });
  }

  const parsedProviderRequest = providerDefinition.parseRequest(mergeProviderOptions(params));
  throwInvalidProviderRequest(parsedProviderRequest);

  return {
    providerKey,
    providerDefinition,
    clientSearchOptions: parsedProviderRequest.clientSearchOptions || {},
    requestContext: parsedProviderRequest.requestContext || {},
    logContext: parsedProviderRequest.logContext || {},
  };
}

function shouldExpandSearchWindow(baseSearchResult, mergeDiagnostics, currentLimit) {
  if (currentLimit >= config.maxSearchLimit) {
    return false;
  }

  if (Number(mergeDiagnostics?.filteredByLowStock || 0) > 0) {
    return true;
  }

  return baseSearchResult?.hasMore === true || Number(baseSearchResult?.returned || 0) >= currentLimit;
}

async function searchProductsForClientProvider(params = {}, options = {}) {
  const normalizedProviderRequest = normalizeProviderSearchRequest(params, options);
  const initialLimit = buildSearchLimit(params.limit);
  let currentLimit = initialLimit;
  let attempts = 0;

  while (true) {
    attempts += 1;

    const baseSearchResult = await searchProducts({
      ...params,
      limit: currentLimit,
      offset: 0,
      includeRelevanceScore: params.includeRelevanceScore === true,
    });
    const dedupedProducts = dedupeProductsByEan(baseSearchResult.results);
    const matchedEans = extractMatchedEans(dedupedProducts);

    if (matchedEans.length === 0) {
      if (shouldExpandSearchWindow(baseSearchResult, null, currentLimit)) {
        const nextLimit = getNextSearchLimit(currentLimit);

        if (nextLimit > currentLimit) {
          currentLimit = nextLimit;
          continue;
        }
      }

      return {
        found: false,
        provider: {
          key: normalizedProviderRequest.providerDefinition.key,
          displayName: normalizedProviderRequest.providerDefinition.displayName,
        },
        query: baseSearchResult.query,
        total: 0,
        products: [],
        matchedEans: [],
        attempts,
        message: "Nenhum produto relevante com EAN válido encontrado no banco_unico.",
      };
    }

    const clientProducts = await normalizedProviderRequest.providerDefinition.clientProductProvider.searchByEans(
      matchedEans,
      {
        ...normalizedProviderRequest.clientSearchOptions,
        traceLogger: params.traceLogger,
        requestContext: {
          query: baseSearchResult.query,
          provider: normalizedProviderRequest.providerDefinition.key,
          ...normalizedProviderRequest.requestContext,
        },
      },
    );
    const mergeResult = mergeClientSearchResults(
      dedupedProducts,
      clientProducts,
      normalizedProviderRequest.providerDefinition,
    );

    if (mergeResult.products.length > 0) {
      return {
        found: true,
        provider: {
          key: normalizedProviderRequest.providerDefinition.key,
          displayName: normalizedProviderRequest.providerDefinition.displayName,
        },
        query: baseSearchResult.query,
        normalizedQuery: baseSearchResult.normalizedQuery,
        queryTokens: baseSearchResult.queryTokens,
        total: mergeResult.products.length,
        products: mergeResult.products,
        matchedEans,
        attempts,
        baseSearch: {
          limit: currentLimit,
          returned: baseSearchResult.returned,
          hasMore: baseSearchResult.hasMore,
        },
        mergeDiagnostics: mergeResult.diagnostics,
        message: "Produtos encontrados com sucesso.",
      };
    }

    if (shouldExpandSearchWindow(baseSearchResult, mergeResult.diagnostics, currentLimit)) {
      const nextLimit = getNextSearchLimit(currentLimit);

      if (nextLimit > currentLimit) {
        currentLimit = nextLimit;
        continue;
      }
    }

    return {
      found: false,
      provider: {
        key: normalizedProviderRequest.providerDefinition.key,
        displayName: normalizedProviderRequest.providerDefinition.displayName,
      },
      query: baseSearchResult.query,
      total: 0,
      products: [],
      matchedEans,
      attempts,
      baseSearch: {
        limit: currentLimit,
        returned: baseSearchResult.returned,
        hasMore: baseSearchResult.hasMore,
      },
      mergeDiagnostics: mergeResult.diagnostics,
      message: Array.isArray(clientProducts) && clientProducts.length > 0
        ? "Nenhum produto compatível encontrado após cruzamento por EAN."
        : `Nenhum produto encontrado no provider ${normalizedProviderRequest.providerDefinition.displayName}.`,
    };
  }
}

module.exports = {
  listClientSearchProviders,
  searchProductsForClientProvider,
};
