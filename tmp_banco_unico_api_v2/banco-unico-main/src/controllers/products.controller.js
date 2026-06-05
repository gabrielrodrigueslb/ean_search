const { config } = require("../config");
const {
  saveProducts,
  searchProductsByEans,
  searchProducts,
} = require("../modules/products/products.service");
const {
  listClientSearchProviders,
  searchProductsForClientProvider,
} = require("../modules/client-search/client-search.service");
const {
  getSearchIntegrationContracts: listSearchIntegrationContracts,
  searchProductsWithIntegrations,
} = require("../modules/product-search/product-search-orchestrator.service");
const { createTraceLogger, describePayloadShape } = require("../shared/utils/trace-logger");

function buildSearchPayload(body) {
  const requestedIncludeRelevanceScore = body?.includeRelevanceScore;

  return {
    ...(body || {}),
    includeRelevanceScore: typeof requestedIncludeRelevanceScore === "boolean"
      ? requestedIncludeRelevanceScore
      : config.defaultIncludeRelevanceScore,
  };
}

function inferClientProviderKey(body, forcedProviderKey = null) {
  if (forcedProviderKey) {
    return forcedProviderKey;
  }

  if (body?.providerKey || body?.provider || body?.clientProvider) {
    return body.providerKey || body.provider || body.clientProvider;
  }

  if (body?.vetorToken) {
    return "vetor";
  }

  if (body?.trierToken) {
    return "trier";
  }

  if (body?.alpha7Authenticate || body?.alpha7ApiKey) {
    return "alpha7";
  }

  return null;
}

async function createProducts(req, res) {
  const traceLogger = req.traceLogger || createTraceLogger({
    requestId: req.requestId || req.headers?.["x-request-id"],
    flow: "products.create",
  });

  traceLogger.step("createProducts", "Caiu no controller de cadastro de produtos.", {
    ...describePayloadShape(req.body),
  });

  try {
    const result = await saveProducts(req.body, { traceLogger });

    traceLogger.step("createProducts", "Controller finalizado com sucesso.", {
      processed: result.processed,
      returned: result.returned,
    });

    res.status(201).json(result);
  } catch (error) {
    traceLogger.fail("createProducts", error, {
      stage: "controller",
    });
    throw error;
  }
}

async function searchRegisteredProducts(req, res) {
  const payload = buildSearchPayload(req.body);
  const providerKey = inferClientProviderKey(payload);

  if (providerKey) {
    const result = await searchProductsForClientProvider(payload, {
      providerKey,
    });
    res.json(result);
    return;
  }

  const result = await searchProductsWithIntegrations(payload);
  res.json(result);
}

async function searchRegisteredProductsBase(req, res) {
  const result = await searchProducts(buildSearchPayload(req.body));
  res.json(result);
}

async function searchRegisteredProductsByEans(req, res) {
  const result = await searchProductsByEans(req.body);
  res.json(result);
}

async function searchRegisteredProductsForProvider(req, res) {
  const result = await searchProductsForClientProvider(buildSearchPayload(req.body), {
    providerKey: req.params.provider,
  });
  res.json(result);
}

async function searchRegisteredProductsForVetor(req, res) {
  const result = await searchProductsForClientProvider(buildSearchPayload(req.body), {
    providerKey: "vetor",
  });
  res.json(result);
}

async function searchRegisteredProductsForTrier(req, res) {
  const result = await searchProductsForClientProvider(buildSearchPayload(req.body), {
    providerKey: "trier",
  });
  res.json(result);
}

async function searchRegisteredProductsForAlpha7(req, res) {
  const result = await searchProductsForClientProvider(buildSearchPayload(req.body), {
    providerKey: "alpha7",
  });
  res.json(result);
}

async function getSearchIntegrationContracts(_req, res) {
  res.json(listSearchIntegrationContracts());
}

async function getClientSearchProviderContracts(_req, res) {
  res.json({
    providers: listClientSearchProviders(),
  });
}

module.exports = {
  createProducts,
  getClientSearchProviderContracts,
  getSearchIntegrationContracts,
  searchRegisteredProducts,
  searchRegisteredProductsByEans,
  searchRegisteredProductsBase,
  searchRegisteredProductsForAlpha7,
  searchRegisteredProductsForProvider,
  searchRegisteredProductsForTrier,
  searchRegisteredProductsForVetor,
};
