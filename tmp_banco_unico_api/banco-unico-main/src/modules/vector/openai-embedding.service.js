const { config } = require("../../config");
const { noopTraceLogger, summarizeText } = require("../../shared/utils/trace-logger");

const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
const OPENAI_EMBEDDING_BATCH_SIZE = 100;

function chunkArray(items, chunkSize, traceLogger = noopTraceLogger, traceContext = {}) {
  const chunks = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  traceLogger.step("chunkEmbeddingArray", "Textos separados em lotes para gerar embeddings.", {
    ...traceContext,
    itemCount: items.length,
    chunkSize,
    batchCount: chunks.length,
  });

  return chunks;
}

function normalizeEmbeddingInput(text, traceLogger = noopTraceLogger, traceContext = {}) {
  const normalized = String(text || "").trim();

  if (!normalized) {
    throw new Error("Nao e possivel gerar embedding a partir de um texto vazio.");
  }

  traceLogger.step("normalizeEmbeddingInput", "Texto preparado para a chamada de embedding.", {
    ...traceContext,
    inputPreview: summarizeText(normalized),
    inputLength: normalized.length,
  });

  return normalized;
}

function buildRequestBody(inputs, traceLogger = noopTraceLogger, traceContext = {}) {
  const requestBody = {
    model: config.openAiEmbeddingModel,
    input: inputs,
    encoding_format: "float",
    dimensions: config.vectorDimensions,
  };

  traceLogger.step("buildRequestBody", "Payload da requisicao de embedding montado.", {
    ...traceContext,
    inputCount: inputs.length,
    model: requestBody.model,
    dimensions: requestBody.dimensions,
  });

  return requestBody;
}

function extractOpenAiErrorMessage(payload, fallback) {
  if (payload && typeof payload === "object" && payload.error?.message) {
    return payload.error.message;
  }

  return fallback;
}

async function requestEmbeddings(inputs, options = {}) {
  const { traceLogger = noopTraceLogger, traceContext = {} } = options;

  traceLogger.step("requestEmbeddings", "Chamando a API da OpenAI para gerar embeddings.", {
    ...traceContext,
    inputCount: inputs.length,
    model: config.openAiEmbeddingModel,
    dimensions: config.vectorDimensions,
  });

  const response = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openAiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildRequestBody(inputs, traceLogger, traceContext)),
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
      `Falha ao gerar embeddings na OpenAI (${response.status}): ${extractOpenAiErrorMessage(payload, rawBody || "sem resposta detalhada")}`,
    );
  }

  if (!Array.isArray(payload?.data)) {
    throw new Error("Resposta invalida da OpenAI ao gerar embeddings.");
  }

  traceLogger.step("requestEmbeddings", "Embeddings retornados pela OpenAI.", {
    ...traceContext,
    embeddingCount: payload.data.length,
  });

  return payload.data
    .slice()
    .sort((left, right) => left.index - right.index)
    .map((item) => item.embedding);
}

async function createEmbeddings(texts, options = {}) {
  const { traceLogger = noopTraceLogger, traceContext = {} } = options;

  if (!Array.isArray(texts) || texts.length === 0) {
    traceLogger.step("createEmbeddings", "Nenhum texto recebido para gerar embeddings.", traceContext);
    return [];
  }

  traceLogger.step("createEmbeddings", "Iniciando geracao de embeddings para os produtos.", {
    ...traceContext,
    textCount: texts.length,
  });

  const normalizedTexts = texts.map((text, index) => normalizeEmbeddingInput(text, traceLogger, {
    ...traceContext,
    textIndex: index,
  }));
  const chunks = chunkArray(normalizedTexts, OPENAI_EMBEDDING_BATCH_SIZE, traceLogger, traceContext);
  const embeddings = [];

  for (const [chunkIndex, chunk] of chunks.entries()) {
    traceLogger.step("createEmbeddings", "Processando lote de embeddings.", {
      ...traceContext,
      chunkIndex,
      chunkSize: chunk.length,
    });

    const chunkEmbeddings = await requestEmbeddings(chunk, {
      traceLogger,
      traceContext: {
        ...traceContext,
        chunkIndex,
      },
    });

    if (chunkEmbeddings.length !== chunk.length) {
      throw new Error("A OpenAI retornou uma quantidade inesperada de embeddings.");
    }

    embeddings.push(...chunkEmbeddings);
  }

  traceLogger.step("createEmbeddings", "Todos os embeddings foram gerados.", {
    ...traceContext,
    embeddingCount: embeddings.length,
  });

  return embeddings;
}

async function createEmbedding(text, options = {}) {
  const { traceLogger = noopTraceLogger, traceContext = {} } = options;

  traceLogger.step("createEmbedding", "Gerando embedding unico.", {
    ...traceContext,
    textPreview: summarizeText(text),
  });

  const embeddings = await createEmbeddings([text], {
    traceLogger,
    traceContext,
  });

  traceLogger.step("createEmbedding", "Embedding unico gerado.", {
    ...traceContext,
    dimensions: embeddings[0]?.length || 0,
  });

  return embeddings[0];
}

module.exports = {
  createEmbedding,
  createEmbeddings,
};
