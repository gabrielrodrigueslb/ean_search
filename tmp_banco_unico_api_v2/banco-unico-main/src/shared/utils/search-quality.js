function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toFlatText(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "")).join(" ");
  }

  return String(value || "");
}

function buildResultHaystack(result) {
  return normalizeSearchText([
    result.ean,
    result.descricaoProduto,
    toFlatText(result.principioAtivo),
    result.classificacao,
    result.nomeSocial,
    result.fabricante,
  ].filter(Boolean).join(" "));
}

function matcherMatchesResult(result, matcher) {
  if (!matcher || typeof matcher !== "object") {
    return false;
  }

  if (matcher.ean && String(result.ean || "") !== String(matcher.ean)) {
    return false;
  }

  const haystack = buildResultHaystack(result);
  const allOf = Array.isArray(matcher.allOf) ? matcher.allOf : [];
  const anyOf = Array.isArray(matcher.anyOf) ? matcher.anyOf : [];

  if (allOf.some((term) => !haystack.includes(normalizeSearchText(term)))) {
    return false;
  }

  if (anyOf.length > 0 && !anyOf.some((term) => haystack.includes(normalizeSearchText(term)))) {
    return false;
  }

  return Boolean(matcher.ean || allOf.length > 0 || anyOf.length > 0);
}

function evaluateBenchmarkCase(testCase, results) {
  const expectedTopK = Number.parseInt(testCase.expectedTopK, 10) || 1;
  const matchers = Array.isArray(testCase.matchers) ? testCase.matchers : [];
  const consideredResults = (Array.isArray(results) ? results : []).slice(0, expectedTopK);
  const matchingIndex = consideredResults.findIndex((result) => matchers.some((matcher) => matcherMatchesResult(result, matcher)));

  return {
    passed: matchingIndex >= 0,
    expectedTopK,
    matchingIndex,
    consideredResults,
  };
}

module.exports = {
  buildResultHaystack,
  evaluateBenchmarkCase,
  matcherMatchesResult,
  normalizeSearchText,
};
