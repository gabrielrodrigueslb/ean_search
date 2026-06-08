const { config } = require("../../config");
const { createHttpError } = require("../../shared/utils/http-error");
const { searchProducts } = require("../products/products.service");
const {
  applyAuthToIntegrationRequest,
  getSupportedAuthTypes,
  normalizeIntegrationAuth,
} = require("./integrations/integration-auth.service");
const { executeIntegrationHttpRequest } = require("./integrations/integration-http.service");
const {
  getSearchIntegrationProvider,
  listSearchIntegrationProviders,
} = require("./integrations/integration-registry");

function normalizeTimeoutMs(value) {
  if (value === undefined || value === null || value === "") {
    return config.integrationRequestTimeoutMs;
  }

  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed) || parsed < 1) {
    throw createHttpError(400, "O campo integrations[].timeoutMs precisa ser um inteiro maior que zero.");
  }

  return parsed;
}

function normalizeIntegrationDescriptor(input, index) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw createHttpError(400, "Cada item de integrations precisa ser um objeto.");
  }

  const providerKey = String(input.provider || "").trim();

  if (!providerKey) {
    throw createHttpError(400, "Cada integracao precisa informar o campo provider.");
  }

  const provider = getSearchIntegrationProvider(providerKey);

  if (!provider) {
    throw createHttpError(400, `Provider de integracao nao suportado: ${providerKey}.`);
  }

  if (!input.request || typeof input.request !== "object" || Array.isArray(input.request)) {
    throw createHttpError(400, "Cada integracao precisa informar request como objeto.");
  }

  const integrationId = String(input.id || "").trim() || `${providerKey}-${index + 1}`;

  return {
    id: integrationId,
    provider,
    auth: normalizeIntegrationAuth(input.auth),
    request: {
      ...input.request,
    },
    timeoutMs: normalizeTimeoutMs(input.timeoutMs),
  };
}

function normalizeIntegrations(integrations) {
  if (integrations === undefined || integrations === null) {
    return [];
  }

  if (!Array.isArray(integrations)) {
    throw createHttpError(400, "O campo integrations precisa ser um array.");
  }

  return integrations.map((integration, index) => normalizeIntegrationDescriptor(integration, index));
}

function extractMatchedEans(results) {
  const seen = new Set();
  const matchedEans = [];

  for (const result of Array.isArray(results) ? results : []) {
    const ean = String(result?.ean || "").trim();

    if (!ean || seen.has(ean)) {
      continue;
    }

    seen.add(ean);
    matchedEans.push(ean);
  }

  return matchedEans;
}

function summarizeRequest(request, auth, eanCount) {
  return {
    method: request.method,
    url: request.url,
    authType: auth.type,
    timeoutMs: request.timeoutMs,
    eanCount,
  };
}

function buildSkippedIntegrationResult(integration) {
  return {
    id: integration.id,
    provider: integration.provider.key,
    ok: null,
    status: "skipped",
    reason: "Nenhum EAN encontrado no banco_unico para repassar para a integracao.",
  };
}

function buildHttpErrorResult(integration, request, response, eanCount) {
  return {
    id: integration.id,
    provider: integration.provider.key,
    ok: false,
    status: "error",
    request: summarizeRequest(request, integration.auth, eanCount),
    response: {
      statusCode: response.statusCode,
      data: response.data,
    },
    error: {
      code: "INTEGRATION_HTTP_ERROR",
      message: `A integracao ${integration.id} respondeu com status ${response.statusCode}.`,
    },
  };
}

function buildRuntimeErrorResult(integration, error) {
  return {
    id: integration.id,
    provider: integration.provider.key,
    ok: false,
    status: "error",
    error: {
      code: error.code || "INTEGRATION_REQUEST_FAILED",
      message: error.message,
    },
  };
}

async function executeSingleIntegration(integration, context, options = {}) {
  if (context.matchedEans.length === 0) {
    return buildSkippedIntegrationResult(integration);
  }

  let request;

  try {
    request = integration.provider.buildRequest({
      request: integration.request,
      auth: integration.auth,
      query: context.query,
      matchedProducts: context.matchedProducts,
      eans: context.matchedEans,
      timeoutMs: integration.timeoutMs,
    });
    request = applyAuthToIntegrationRequest(request, integration.auth);
  } catch (error) {
    if (Number.isInteger(error.statusCode) && error.statusCode >= 400 && error.statusCode < 500) {
      throw error;
    }

    return buildRuntimeErrorResult(integration, error);
  }

  try {
    const response = await executeIntegrationHttpRequest(request, {
      fetchImpl: options.fetchImpl,
    });

    if (!response.ok) {
      return buildHttpErrorResult(integration, request, response, context.matchedEans.length);
    }

    return {
      id: integration.id,
      provider: integration.provider.key,
      ok: true,
      status: "success",
      request: summarizeRequest(request, integration.auth, context.matchedEans.length),
      response: {
        statusCode: response.statusCode,
        data: response.data,
      },
    };
  } catch (error) {
    return buildRuntimeErrorResult(integration, error);
  }
}

async function searchProductsWithIntegrations(params = {}, options = {}) {
  const integrations = normalizeIntegrations(params.integrations);
  const baseSearchResult = await searchProducts(params);
  const matchedProducts = Array.isArray(baseSearchResult.results) ? baseSearchResult.results : [];
  const matchedEans = extractMatchedEans(matchedProducts);

  if (integrations.length === 0) {
    return {
      ...baseSearchResult,
      matchedEans,
      integrations: [],
    };
  }

  const integrationResults = await Promise.all(
    integrations.map((integration) => executeSingleIntegration(integration, {
      query: baseSearchResult.query,
      matchedProducts,
      matchedEans,
    }, options)),
  );

  return {
    ...baseSearchResult,
    matchedEans,
    integrations: integrationResults,
  };
}

function getSearchIntegrationContracts() {
  return {
    authTypes: getSupportedAuthTypes(),
    providers: listSearchIntegrationProviders(),
  };
}

module.exports = {
  getSearchIntegrationContracts,
  searchProductsWithIntegrations,
};
