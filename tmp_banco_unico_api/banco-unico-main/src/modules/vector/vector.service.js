const crypto = require("node:crypto");
const { noopTraceLogger, summarizeText } = require("../../shared/utils/trace-logger");

function normalizeText(text, options = {}) {
  const { traceLogger = noopTraceLogger, traceContext = {} } = options;

  traceLogger.step("normalizeText", "Normalizando texto bruto.", {
    ...traceContext,
    inputPreview: summarizeText(text),
  });

  const normalizedText = String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // Split "250mg" into "250 mg" so dosage/volume queries match lexical tokens.
    .replace(/([a-z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  traceLogger.step("normalizeText", "Texto normalizado.", {
    ...traceContext,
    outputPreview: summarizeText(normalizedText),
    outputLength: normalizedText.length,
  });

  return normalizedText;
}

function tokenizeText(text, maxTokens, options = {}) {
  const { traceLogger = noopTraceLogger, traceContext = {} } = options;
  const normalizedText = normalizeText(text, { traceLogger, traceContext });

  if (!normalizedText) {
    traceLogger.step("tokenizeText", "Texto vazio apos normalizacao; nenhum token gerado.", {
      ...traceContext,
      maxTokens,
    });

    return {
      normalizedText,
      tokens: [],
    };
  }

  const rawTokens = normalizedText.match(/[a-z0-9]+/g) || [];
  const tokens = Number.isInteger(maxTokens) && maxTokens > 0
    ? rawTokens.slice(0, maxTokens)
    : rawTokens;

  traceLogger.step("tokenizeText", "Tokens gerados a partir do texto normalizado.", {
    ...traceContext,
    rawTokenCount: rawTokens.length,
    returnedTokenCount: tokens.length,
    maxTokens,
  });

  return {
    normalizedText,
    tokens,
  };
}

function hashToken(token) {
  let hash = 2166136261;

  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function vectorizeTokens(tokens, dimensions, options = {}) {
  const { traceLogger = noopTraceLogger, traceContext = {} } = options;
  const vector = new Array(dimensions).fill(0);
  const frequencies = new Map();

  for (const token of tokens) {
    frequencies.set(token, (frequencies.get(token) || 0) + 1);
  }

  for (const [token, occurrences] of frequencies.entries()) {
    const hash = hashToken(token);
    const position = hash % dimensions;
    const signal = (hash & 1) === 0 ? 1 : -1;
    const weight = 1 + Math.log(occurrences);
    vector[position] += signal * weight;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

  if (magnitude === 0) {
    traceLogger.step("vectorizeTokens", "Magnitude zero; vetor retornado sem normalizacao.", {
      ...traceContext,
      tokenCount: tokens.length,
      uniqueTokenCount: frequencies.size,
      dimensions,
    });

    return vector;
  }

  const normalizedVector = vector.map((value) => Number((value / magnitude).toFixed(12)));

  traceLogger.step("vectorizeTokens", "Vetor normalizado gerado a partir dos tokens.", {
    ...traceContext,
    tokenCount: tokens.length,
    uniqueTokenCount: frequencies.size,
    dimensions,
  });

  return normalizedVector;
}

function toSqlVector(vector, options = {}) {
  const { traceLogger = noopTraceLogger, traceContext = {} } = options;

  traceLogger.step("toSqlVector", "Convertendo vetor para o formato aceito pelo pgvector.", {
    ...traceContext,
    dimensions: Array.isArray(vector) ? vector.length : 0,
  });

  return `[${vector.join(",")}]`;
}

function buildRepresentation(text, options = {}) {
  const {
    dimensions,
    maxTokens,
    traceLogger = noopTraceLogger,
    traceContext = {},
  } = options;

  traceLogger.step("buildRepresentation", "Construindo representacao textual para o produto.", {
    ...traceContext,
    dimensions,
    maxTokens,
  });

  const { normalizedText, tokens } = tokenizeText(text, maxTokens, {
    traceLogger,
    traceContext,
  });
  const vector = vectorizeTokens(tokens, dimensions, {
    traceLogger,
    traceContext,
  });

  traceLogger.step("buildRepresentation", "Representacao textual concluida.", {
    ...traceContext,
    tokenCount: tokens.length,
    vectorDimensions: vector.length,
  });

  return {
    normalizedText,
    tokens,
    tokenCount: tokens.length,
    vector,
  };
}

function createExternalId(source, normalizedText) {
  return crypto
    .createHash("sha256")
    .update(`${source}:${normalizedText}`)
    .digest("hex");
}

module.exports = {
  buildRepresentation,
  createExternalId,
  normalizeText,
  toSqlVector,
  tokenizeText,
  vectorizeTokens,
};
