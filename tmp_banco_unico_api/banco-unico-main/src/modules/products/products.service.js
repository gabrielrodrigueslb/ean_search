const { config } = require("../../config");
const {
  createTraceLogger,
  describePayloadShape,
  noopTraceLogger,
  summarizeText,
} = require("../../shared/utils/trace-logger");
const { scoreProductRelevance } = require("./openai-product-relevance.service");
const { createEmbedding, createEmbeddings } = require("../vector/openai-embedding.service");
const { buildRepresentation, tokenizeText, toSqlVector } = require("../vector/vector.service");
const {
  findProductsByEans,
  listProductsForReprocessing,
  searchProducts: searchProductsInDatabase,
  upsertProducts,
} = require("./products.repository");

function extractProducts(payload, traceLogger = noopTraceLogger) {
  traceLogger.step("extractProducts", "Analisando o formato do payload recebido.", describePayloadShape(payload));

  if (Array.isArray(payload)) {
    traceLogger.step("extractProducts", "Payload identificado como array direto de produtos.", {
      productCount: payload.length,
    });

    return {
      products: payload,
      options: {},
    };
  }

  if (Array.isArray(payload?.products) || Array.isArray(payload?.produtos)) {
    traceLogger.step("extractProducts", "Payload identificado como wrapper com array de produtos.", {
      productCount: (payload.products || payload.produtos).length,
      wrapperKey: Array.isArray(payload.products) ? "products" : "produtos",
      hasOptions: payload.options && typeof payload.options === "object",
    });

    return {
      products: payload.products || payload.produtos,
      options: payload.options && typeof payload.options === "object" ? payload.options : {},
    };
  }

  if (payload && typeof payload === "object" && (payload.description || payload.descricaoProduto)) {
    traceLogger.step("extractProducts", "Payload identificado como produto unico.", {
      keys: Object.keys(payload).slice(0, 10),
    });

    return {
      products: [payload],
      options: {},
    };
  }

  throw new Error("Envie um produto unico ou um array em products ou produtos.");
}

function normalizeOptionalText(value, fieldName, traceLogger = noopTraceLogger, extraContext = {}) {
  traceLogger.step("normalizeOptionalText", "Normalizando campo opcional.", {
    ...extraContext,
    fieldName,
    inputPreview: summarizeText(value),
  });

  if (value === undefined || value === null || value === "") {
    traceLogger.step("normalizeOptionalText", "Campo opcional ausente; retornando null.", {
      ...extraContext,
      fieldName,
    });

    return null;
  }

  const normalized = String(value).trim();
  const result = normalized || null;

  traceLogger.step("normalizeOptionalText", "Campo opcional normalizado.", {
    ...extraContext,
    fieldName,
    outputPreview: summarizeText(result),
    isNull: result === null,
  });

  return result;
}

function normalizeEan(value, traceLogger = noopTraceLogger, extraContext = {}) {
  traceLogger.step("normalizeEan", "Normalizando EAN do produto.", {
    ...extraContext,
    inputPreview: summarizeText(value),
  });

  const ean = String(value || "").replace(/\D+/g, "");

  if (!ean) {
    throw new Error("Todo produto precisa ter o campo ean.");
  }

  if (ean.length < 8 || ean.length > 14) {
    throw new Error("O campo ean precisa ter entre 8 e 14 digitos.");
  }

  traceLogger.step("normalizeEan", "EAN normalizado com sucesso.", {
    ...extraContext,
    normalizedEan: ean,
    digits: ean.length,
  });

  return ean;
}

function pickBatchLookupEanValue(item) {
  if (item && typeof item === "object") {
    return item.ean || item.codigoBarras || item.codigo_barras || null;
  }

  return item;
}

function extractBatchLookupEans(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.eans)) {
    return payload.eans;
  }

  if (Array.isArray(payload?.codigosBarras)) {
    return payload.codigosBarras;
  }

  if (Array.isArray(payload?.codigosDeBarras)) {
    return payload.codigosDeBarras;
  }

  throw new Error("Envie um array de EANs em eans, codigosBarras ou no body raiz.");
}

function normalizeBatchLookupRequest(payload) {
  const items = extractBatchLookupEans(payload);

  if (items.length === 0) {
    throw new Error("Envie pelo menos um EAN para consulta em lote.");
  }

  const uniqueEans = [];
  const seenEans = new Set();

  for (const [index, item] of items.entries()) {
    const rawEan = pickBatchLookupEanValue(item);
    let normalizedEan;

    try {
      normalizedEan = normalizeEan(rawEan);
    } catch (error) {
      throw new Error(`EAN invalido na posicao ${index}: ${error.message}`);
    }

    if (seenEans.has(normalizedEan)) {
      continue;
    }

    seenEans.add(normalizedEan);
    uniqueEans.push(normalizedEan);
  }

  return uniqueEans;
}

function buildSearchableText(product, traceLogger = noopTraceLogger, extraContext = {}) {
  const weightedSegments = [
    product.description,
    product.activeIngredient,
    product.description,
    product.activeIngredient,
    product.socialName,
    product.classification,
    product.manufacturer,
  ].filter(Boolean);

  const searchableText = weightedSegments.join(" ");
  traceLogger.step("buildSearchableText", "Texto pesquisavel composto com peso maior para descricao e principio ativo.", {
    ...extraContext,
    searchableTextPreview: summarizeText(searchableText),
    searchableTextLength: searchableText.length,
    weightedFieldCount: weightedSegments.length,
    ignoredFields: ["details", "ean"],
  });

  return searchableText;
}

function normalizePositiveInteger(value, fallback, fieldName) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed) || parsed < 1) {
    throw new Error(`O campo ${fieldName} precisa ser um numero inteiro maior que zero.`);
  }

  return parsed;
}

function buildSearchLimit(rawLimit) {
  const requestedLimit = Number.parseInt(rawLimit, 10);

  return Number.isNaN(requestedLimit)
    ? config.defaultSearchLimit
    : Math.min(Math.max(requestedLimit, 1), config.maxSearchLimit);
}

function buildSearchOffset(rawOffset) {
  if (rawOffset === undefined || rawOffset === null || rawOffset === "") {
    return 0;
  }

  const requestedOffset = Number.parseInt(rawOffset, 10);

  if (Number.isNaN(requestedOffset) || requestedOffset < 0) {
    throw new Error("O campo offset precisa ser um numero inteiro maior ou igual a zero.");
  }

  return requestedOffset;
}

function paginateResults(results, limit, offset) {
  const safeResults = Array.isArray(results) ? results : [];
  const pageResults = safeResults.slice(0, limit);
  const hasMore = safeResults.length > limit;

  return {
    results: pageResults,
    returned: pageResults.length,
    hasMore,
    nextOffset: hasMore ? offset + limit : null,
  };
}

function prepareProductPayload(input, productIndex, traceLogger = noopTraceLogger) {
  traceLogger.step("prepareProductPayload", "Entrou na preparacao de um produto para persistencia.", {
    productIndex,
    inputKeys: input && typeof input === "object" ? Object.keys(input).slice(0, 10) : [],
  });

  if (!input || typeof input !== "object") {
    throw new Error("Cada produto precisa ser um objeto.");
  }

  const description = normalizeOptionalText(
    input.descricaoProduto || input.description,
    "description",
    traceLogger,
    { productIndex },
  );

  if (!description) {
    throw new Error("Todo produto precisa ter o campo descricaoProduto.");
  }

  const preparedProduct = {
    ean: normalizeEan(input.ean, traceLogger, { productIndex }),
    description,
    activeIngredient: normalizeOptionalText(
      input.principioAtivo || input.activeIngredient,
      "activeIngredient",
      traceLogger,
      { productIndex },
    ),
    classification: normalizeOptionalText(
      input.classificacao || input.classification,
      "classification",
      traceLogger,
      { productIndex },
    ),
    socialName: normalizeOptionalText(
      input.nomeSocial || input.socialName,
      "socialName",
      traceLogger,
      { productIndex },
    ),
    manufacturer: normalizeOptionalText(
      input.fabricante || input.manufacturer,
      "manufacturer",
      traceLogger,
      { productIndex },
    ),
    details: normalizeOptionalText(
      input.detalhes || input.details,
      "details",
      traceLogger,
      { productIndex },
    ),
  };

  const searchableText = buildSearchableText(preparedProduct, traceLogger, { productIndex });
  const representation = buildRepresentation(searchableText, {
    dimensions: config.vectorDimensions,
    maxTokens: config.maxTokensPerProduct,
    traceLogger,
    traceContext: {
      productIndex,
    },
  });

  if (representation.tokenCount === 0) {
    throw new Error("Nao foi possivel gerar tokens a partir dos dados do produto.");
  }

  traceLogger.step("prepareProductPayload", "Produto preparado e tokenizado.", {
    productIndex,
    ean: preparedProduct.ean,
    tokenCount: representation.tokenCount,
  });

  return {
    ...preparedProduct,
    searchableText,
    normalizedSearchableText: representation.normalizedText,
    tokens: representation.tokens,
    tokenCount: representation.tokenCount,
  };
}

async function attachEmbeddingsToProducts(products, traceLogger = noopTraceLogger) {
  traceLogger.step("attachEmbeddingsToProducts", "Solicitando embeddings reais para os produtos preparados.", {
    productCount: products.length,
  });

  const embeddings = await createEmbeddings(products.map((product) => product.searchableText), {
    traceLogger,
    traceContext: {
      productCount: products.length,
    },
  });

  traceLogger.step("attachEmbeddingsToProducts", "Embeddings recebidos; convertendo para formato SQL.", {
    productCount: products.length,
    embeddingCount: embeddings.length,
  });

  return products.map((product, index) => ({
    ...product,
    embedding: toSqlVector(embeddings[index], {
      traceLogger,
      traceContext: {
        productIndex: index,
        ean: product.ean,
      },
    }),
  }));
}

async function prepareProductsForPersistence(products, traceLogger = noopTraceLogger, options = {}) {
  const { startIndex = 0 } = options;

  traceLogger.step("prepareProductsForPersistence", "Preparando lote de produtos para recalculo dos artefatos de busca.", {
    productCount: products.length,
    startIndex,
  });

  return attachEmbeddingsToProducts(
    products.map((product, index) => prepareProductPayload(product, startIndex + index, traceLogger)),
    traceLogger,
  );
}

function extractExactEan(query, explicitEan) {
  if (explicitEan) {
    return normalizeEan(explicitEan);
  }

  const digitsOnly = String(query || "").replace(/\D+/g, "");
  return digitsOnly.length >= 8 && digitsOnly.length <= 14 ? digitsOnly : null;
}

function buildResultSearchText(result) {
  return [
    result.ean,
    result.descricaoProduto,
    Array.isArray(result.principioAtivo) ? result.principioAtivo.join(" ") : result.principioAtivo,
    result.classificacao,
    result.nomeSocial,
    result.fabricante,
  ].filter(Boolean).join(" ");
}

function resolveFuzzyDistance(token) {
  if (token.length >= 10) {
    return 2;
  }

  if (token.length >= 5) {
    return 1;
  }

  return 0;
}

function computeBoundedLevenshtein(left, right, maxDistance) {
  if (left === right) {
    return 0;
  }

  if (maxDistance < 0 || Math.abs(left.length - right.length) > maxDistance) {
    return Number.POSITIVE_INFINITY;
  }

  const previous = new Array(right.length + 1);
  const current = new Array(right.length + 1);

  for (let column = 0; column <= right.length; column += 1) {
    previous[column] = column;
  }

  for (let row = 1; row <= left.length; row += 1) {
    current[0] = row;
    let rowMinimum = current[0];

    for (let column = 1; column <= right.length; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;

      current[column] = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + substitutionCost,
      );
      rowMinimum = Math.min(rowMinimum, current[column]);
    }

    if (rowMinimum > maxDistance) {
      return Number.POSITIVE_INFINITY;
    }

    for (let column = 0; column <= right.length; column += 1) {
      previous[column] = current[column];
    }
  }

  return previous[right.length];
}

function hasReliableLexicalMatch(queryTokens, result) {
  const { tokens: resultTokens } = tokenizeText(buildResultSearchText(result), config.maxTokensPerProduct);
  const uniqueResultTokens = [...new Set(resultTokens)];

  for (const queryToken of queryTokens) {
    if (!queryToken || /^\d+$/.test(queryToken)) {
      continue;
    }

    const allowedDistance = resolveFuzzyDistance(queryToken);

    if (allowedDistance === 0) {
      continue;
    }

    const hasFuzzyMatch = uniqueResultTokens.some((resultToken) => {
      if (
        !resultToken
        || /^\d+$/.test(resultToken)
        || Math.abs(resultToken.length - queryToken.length) > allowedDistance
      ) {
        return false;
      }

      return computeBoundedLevenshtein(queryToken, resultToken, allowedDistance) <= allowedDistance;
    });

    if (hasFuzzyMatch) {
      return true;
    }
  }

  return false;
}

function filterReliableResults(results, representation, options = {}) {
  const queryTokens = Array.isArray(representation?.tokens) ? representation.tokens : [];

  if (options.prioritizeLexicalSignals !== true || queryTokens.length === 0) {
    return Array.isArray(results) ? results : [];
  }

  return (Array.isArray(results) ? results : []).filter((result) => {
    if (result?.exactEanMatch) {
      return true;
    }

    if (Number(result?.tokenOverlap || 0) > 0) {
      return true;
    }

    if (Number(result?.similarity || 0) < 0.45) {
      return false;
    }

    return hasReliableLexicalMatch(queryTokens, result);
  });
}

async function annotateResultsWithRelevance(query, results, options = {}) {
  const { includeRelevanceScore = false, traceLogger = noopTraceLogger } = options;
  const safeResults = Array.isArray(results) ? results : [];

  if (includeRelevanceScore !== true || safeResults.length === 0) {
    return safeResults;
  }

  try {
    return await scoreProductRelevance(query, safeResults, { traceLogger });
  } catch (error) {
    traceLogger.step("annotateResultsWithRelevance", "Falha ao avaliar relevancia; retornando resultados sem nota.", {
      queryPreview: summarizeText(query),
      resultCount: safeResults.length,
      errorMessage: error.message,
    });

    return safeResults.map((result) => ({
      ...result,
      relevanceScore: null,
      relevanceReason: null,
    }));
  }
}

async function saveProducts(payload, context = {}) {
  const traceLogger = context.traceLogger || createTraceLogger({
    flow: "products.create",
  });

  traceLogger.step("saveProducts", "Entrou no service principal de cadastro.", describePayloadShape(payload));

  const { products, options } = extractProducts(payload, traceLogger);

  if (products.length === 0) {
    throw new Error("Envie pelo menos um produto para cadastro.");
  }

  traceLogger.step("saveProducts", "Payload extraido; iniciando preparacao individual dos produtos.", {
    productCount: products.length,
  });

  try {
    const preparedProducts = await prepareProductsForPersistence(products, traceLogger);
    const returnItems = (
      options.returnItems === true
      || options.retornarItens === true
      || preparedProducts.length <= config.maxReturnedProducts
    );

    traceLogger.step("saveProducts", "Produtos preparados; enviando para persistencia.", {
      productCount: preparedProducts.length,
      returnRows: returnItems,
      batchSize: config.upsertBatchSize,
    });

    const result = await upsertProducts(preparedProducts, {
      batchSize: config.upsertBatchSize,
      returnRows: returnItems,
    }, traceLogger);

    traceLogger.step("saveProducts", "Persistencia concluida com sucesso.", {
      processedCount: result.processedCount,
      returnedProducts: result.products.length,
    });

    return {
      processed: result.processedCount,
      upserted: result.processedCount,
      returned: result.products.length,
      products: result.products,
    };
  } catch (error) {
    traceLogger.fail("saveProducts", error, {
      stage: "service",
      productCount: products.length,
    });
    throw error;
  }
}

async function reprocessProducts(options = {}) {
  const traceLogger = options.traceLogger || createTraceLogger({
    flow: "products.reprocess",
  });
  const readBatchSize = normalizePositiveInteger(
    options.readBatchSize,
    config.upsertBatchSize,
    "readBatchSize",
  );
  const writeBatchSize = normalizePositiveInteger(
    options.writeBatchSize,
    config.upsertBatchSize,
    "writeBatchSize",
  );
  const limit = options.limit === undefined || options.limit === null || options.limit === ""
    ? null
    : normalizePositiveInteger(options.limit, null, "limit");
  let totalReprocessed = 0;
  let batchCount = 0;
  let lastEan = null;

  traceLogger.step("reprocessProducts", "Iniciando reprocessamento de produtos ja persistidos.", {
    readBatchSize,
    writeBatchSize,
    limit,
  });

  while (true) {
    const remaining = limit === null ? readBatchSize : Math.min(readBatchSize, limit - totalReprocessed);

    if (remaining <= 0) {
      break;
    }

    const sourceProducts = await listProductsForReprocessing({
      afterEan: lastEan,
      limit: remaining,
    });

    if (sourceProducts.length === 0) {
      traceLogger.step("reprocessProducts", "Nenhum produto adicional encontrado para reprocessar.", {
        totalReprocessed,
        batchCount,
      });
      break;
    }

    batchCount += 1;
    lastEan = sourceProducts[sourceProducts.length - 1].ean;

    traceLogger.step("reprocessProducts", "Lote carregado do banco; recalculando representacao e embeddings.", {
      batchCount,
      batchSize: sourceProducts.length,
      lastEan,
    });

    const preparedProducts = await prepareProductsForPersistence(sourceProducts, traceLogger, {
      startIndex: totalReprocessed,
    });
    const result = await upsertProducts(preparedProducts, {
      batchSize: writeBatchSize,
      returnRows: false,
    }, traceLogger);

    totalReprocessed += result.processedCount;

    traceLogger.step("reprocessProducts", "Lote reprocessado com sucesso.", {
      batchCount,
      batchProcessedCount: result.processedCount,
      totalReprocessed,
      lastEan,
    });
  }

  return {
    processed: totalReprocessed,
    reprocessed: totalReprocessed,
    batches: batchCount,
    limit,
    readBatchSize,
    writeBatchSize,
    lastEan,
  };
}

async function searchProductsByEans(payload) {
  const requestedEans = normalizeBatchLookupRequest(payload);
  const products = await findProductsByEans(requestedEans);
  const productsByEan = new Map(
    products.map((product) => [String(product?.ean || "").trim(), product]),
  );
  const orderedProducts = requestedEans
    .map((ean) => productsByEan.get(ean))
    .filter(Boolean);
  const missingEans = requestedEans.filter((ean) => !productsByEan.has(ean));

  return {
    requested: requestedEans.length,
    returned: orderedProducts.length,
    missing: missingEans.length,
    products: orderedProducts,
    missingEans,
  };
}

async function searchProducts(params) {
  const {
    query,
    representation,
    limit,
    offset,
    minScore,
  } = buildSearchRequest(params);
  const prioritizeLexicalSignals = representation.tokenCount <= 2;
  const results = await searchProductsInDatabase({
    embedding: toSqlVector(await createEmbedding(query)),
    eanFilter: extractExactEan(query, params.ean),
    queryTokens: representation.tokens,
    minScore,
    limit: limit + 1,
    offset,
    prioritizeLexicalSignals,
  });
  const page = paginateResults(results, limit, offset);
  const filteredResults = params.includeRelevanceScore === true
    ? page.results
    : filterReliableResults(page.results, representation, {
      prioritizeLexicalSignals,
    });
  const annotatedResults = await annotateResultsWithRelevance(query, filteredResults, {
    includeRelevanceScore: params.includeRelevanceScore === true,
  });

  return {
    query,
    normalizedQuery: representation.normalizedText,
    queryTokens: representation.tokens,
    limit,
    offset,
    returned: annotatedResults.length,
    hasMore: page.hasMore,
    nextOffset: page.nextOffset,
    prioritizeLexicalSignals,
    results: annotatedResults,
  };
}

function buildSearchRequest(params) {
  const query = String(params.query || "").trim();

  if (!query) {
    throw new Error("Informe o campo query para pesquisar.");
  }

  const representation = buildRepresentation(query, {
    dimensions: config.vectorDimensions,
    maxTokens: config.maxTokensPerProduct,
  });

  if (representation.tokenCount === 0) {
    throw new Error("Nao foi possivel gerar tokens a partir da query informada.");
  }

  const limit = buildSearchLimit(params.limit);
  const offset = buildSearchOffset(params.offset);
  const minScore = params.minScore === undefined ? null : Number(params.minScore);

  if (minScore !== null && Number.isNaN(minScore)) {
    throw new Error("O campo minScore precisa ser numerico.");
  }

  return {
    query,
    representation,
    limit,
    offset,
    minScore,
  };
}

module.exports = {
  reprocessProducts,
  saveProducts,
  searchProductsByEans,
  searchProducts,
};
