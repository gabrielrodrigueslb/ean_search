import { normalizeText } from "./normalizeText.js";
const EMBEDDING_DIMENSIONS = 512;

function uniquePreservingOrder(values) {
  const seen = new Set();
  const output = [];

  for (const value of values) {
    const normalized = String(value || "").trim();
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(normalized);
  }

  return output;
}

function tokenize(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return [];
  }

  return uniquePreservingOrder(normalized.split(" "));
}

function buildEmbedding(tokens) {
  const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);

  for (const token of tokens) {
    let hash = 2166136261;

    for (let index = 0; index < token.length; index += 1) {
      hash ^= token.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    const slot = Math.abs(hash) % EMBEDDING_DIMENSIONS;
    vector[slot] += 1;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + (value * value), 0));
  if (!magnitude) {
    return vector;
  }

  return vector.map((value) => Number((value / magnitude).toFixed(8)));
}

function buildSearchArtifacts(parts) {
  const searchableText = uniquePreservingOrder(parts).join(" | ");
  const normalizedSearchableText = normalizeText(searchableText);
  const tokens = tokenize(normalizedSearchableText);

  return {
    searchable_text: searchableText,
    normalized_searchable_text: normalizedSearchableText,
    tokens,
    token_count: tokens.length,
    embedding: buildEmbedding(tokens),
  };
}

export { EMBEDDING_DIMENSIONS, uniquePreservingOrder, tokenize, buildEmbedding, buildSearchArtifacts, };