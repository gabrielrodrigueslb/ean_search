const { config } = require("../../config");
const { noopTraceLogger, summarizeText } = require("../../shared/utils/trace-logger");

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

function buildProductRelevanceSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["ratedResults"],
    properties: {
      ratedResults: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["resultIndex", "score", "reason"],
          properties: {
            resultIndex: {
              type: "integer",
            },
            score: {
              type: "integer",
              minimum: 1,
              maximum: 5,
            },
            reason: {
              type: "string",
            },
          },
        },
      },
    },
  };
}

function buildInstructions() {
  return [
    "Voce avalia a relevancia de produtos de catalogo para uma busca do usuario.",
    "Para cada produto, retorne uma nota inteira de 1 a 5.",
    "5 significa altamente relevante e provavelmente o produto correto.",
    "4 significa relevante, mas nao necessariamente a melhor opcao.",
    "3 significa parcialmente relacionado.",
    "2 significa pouco relacionado.",
    "1 significa falso positivo ou quase irrelevante.",
    "Considere descricao, principio ativo, nome social, fabricante e sinais de busca como pistas.",
    "Se a busca expressa uma intencao indireta, priorize o produto que melhor atende a intencao real, nao apenas palavras parecidas.",
    "Seja severo com falsos positivos.",
    "Retorne apenas o JSON no schema solicitado.",
  ].join(" ");
}

function serializeResults(results) {
  return results.map((result, resultIndex) => ({
    resultIndex,
    ean: result.ean,
    descricaoProduto: result.descricaoProduto,
    principioAtivo: result.principioAtivo,
    classificacao: result.classificacao,
    nomeSocial: result.nomeSocial,
    fabricante: result.fabricante,
    similarity: result.similarity,
    tokenOverlap: result.tokenOverlap,
    exactEanMatch: result.exactEanMatch,
  }));
}

function buildRequestBody(query, results, traceLogger = noopTraceLogger) {
  const requestBody = {
    model: config.openAiProductRelevanceModel,
    instructions: buildInstructions(),
    input: JSON.stringify({
      query,
      results: serializeResults(results),
    }),
    max_output_tokens: 2000,
    text: {
      format: {
        type: "json_schema",
        name: "product_relevance_scores",
        strict: true,
        schema: buildProductRelevanceSchema(),
      },
    },
  };

  traceLogger.step("buildProductRelevanceRequestBody", "Payload da avaliacao de relevancia montado.", {
    model: requestBody.model,
    queryPreview: summarizeText(query),
    resultCount: results.length,
  });

  return requestBody;
}

function extractOpenAiErrorMessage(payload, fallback) {
  if (payload && typeof payload === "object" && payload.error?.message) {
    return payload.error.message;
  }

  return fallback;
}

function extractResponseText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const outputItems = Array.isArray(payload?.output) ? payload.output : [];
  const messageItem = outputItems.find((item) => item?.type === "message" && Array.isArray(item.content));

  if (!messageItem) {
    return null;
  }

  const textParts = messageItem.content
    .filter((contentItem) => contentItem?.type === "output_text" && typeof contentItem.text === "string")
    .map((contentItem) => contentItem.text.trim())
    .filter(Boolean);

  return textParts.length > 0 ? textParts.join("\n") : null;
}

function parseResponse(payload) {
  const rawText = extractResponseText(payload);

  if (!rawText) {
    throw new Error("Resposta invalida da OpenAI ao avaliar relevancia dos produtos.");
  }

  return JSON.parse(rawText);
}

async function scoreProductRelevance(query, results, options = {}) {
  const { traceLogger = noopTraceLogger } = options;

  if (!Array.isArray(results) || results.length === 0) {
    traceLogger.step("scoreProductRelevance", "Nenhum resultado recebido para avaliacao de relevancia.");
    return [];
  }

  traceLogger.step("scoreProductRelevance", "Chamando a OpenAI para avaliar a relevancia de cada produto.", {
    model: config.openAiProductRelevanceModel,
    queryPreview: summarizeText(query),
    resultCount: results.length,
  });

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openAiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildRequestBody(query, results, traceLogger)),
  });

  const rawBody = await response.text();
  let payload = null;

  if (rawBody) {
    try {
      payload = JSON.parse(rawBody);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    throw new Error(
      `Falha ao avaliar relevancia na OpenAI (${response.status}): ${extractOpenAiErrorMessage(payload, rawBody || "sem resposta detalhada")}`,
    );
  }

  const parsed = parseResponse(payload);
  const ratedResults = Array.isArray(parsed?.ratedResults) ? parsed.ratedResults : [];
  const ratingsByIndex = new Map(
    ratedResults.map((item) => [item.resultIndex, item]),
  );

  traceLogger.step("scoreProductRelevance", "Avaliacao de relevancia concluida.", {
    ratedCount: ratedResults.length,
  });

  return results.map((result, resultIndex) => {
    const rating = ratingsByIndex.get(resultIndex);

    return {
      ...result,
      relevanceScore: Number.isInteger(rating?.score) ? rating.score : null,
      relevanceReason: typeof rating?.reason === "string" ? rating.reason : null,
    };
  });
}

module.exports = {
  scoreProductRelevance,
};
