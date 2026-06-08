const fs = require("node:fs");
const path = require("node:path");

const { evaluateBenchmarkCase } = require("../src/shared/utils/search-quality");

function readCliOption(name) {
  const exactPrefix = `--${name}=`;
  const args = process.argv.slice(2);

  for (const [index, argument] of args.entries()) {
    if (argument.startsWith(exactPrefix)) {
      return argument.slice(exactPrefix.length);
    }

    if (argument === `--${name}`) {
      return args[index + 1];
    }
  }

  return undefined;
}

function readIntegerOption(name, fallback) {
  const rawValue = readCliOption(name);

  if (rawValue === undefined || rawValue === "") {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);

  if (Number.isNaN(parsed) || parsed < 1) {
    throw new Error(`A opcao --${name} precisa ser um numero inteiro maior que zero.`);
  }

  return parsed;
}

function resolveBenchmarkFile() {
  const relativeFile = readCliOption("file") || "benchmarks/search-quality.cases.json";
  return path.resolve(process.cwd(), relativeFile);
}

function resolveBaseUrl() {
  const cliBaseUrl = readCliOption("base-url");
  const envBaseUrl = process.env.SEARCH_QUALITY_BASE_URL || process.env.API_BASE_URL;
  const fallbackBaseUrl = `http://127.0.0.1:${process.env.PORT || 3000}`;

  return String(cliBaseUrl || envBaseUrl || fallbackBaseUrl).replace(/\/+$/, "");
}

function resolveSearchUrl() {
  const baseUrl = resolveBaseUrl();
  const searchPath = readCliOption("search-path") || "/api/products/search";
  return `${baseUrl}${searchPath.startsWith("/") ? searchPath : `/${searchPath}`}`;
}

function loadBenchmarkCases(filePath) {
  const rawFile = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(rawFile);

  if (!Array.isArray(parsed?.cases)) {
    throw new Error("O arquivo de benchmark precisa conter um array em cases.");
  }

  return parsed.cases;
}

function filterCases(cases) {
  const category = readCliOption("category");
  const limit = readIntegerOption("limit-cases", null);
  let filteredCases = category
    ? cases.filter((testCase) => String(testCase.category || "").toLowerCase() === String(category).toLowerCase())
    : cases.slice();

  if (limit !== null) {
    filteredCases = filteredCases.slice(0, limit);
  }

  return filteredCases;
}

function formatResultSummary(result) {
  return [
    result.ean,
    result.descricaoProduto,
    Array.isArray(result.principioAtivo) ? result.principioAtivo.join(", ") : result.principioAtivo,
    result.fabricante,
  ].filter(Boolean).join(" | ");
}

function printCaseFailure(testCase, evaluation) {
  console.log(`- [FAIL] ${testCase.id} | ${testCase.category} | query="${testCase.query}" | esperado top ${evaluation.expectedTopK}`);

  for (const [index, result] of evaluation.consideredResults.entries()) {
    console.log(`  ${index + 1}. ${formatResultSummary(result)}`);
  }
}

async function runCase(testCase, searchUrl, defaultRequestLimit, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(searchUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: testCase.query,
        limit: Math.max(defaultRequestLimit, testCase.expectedTopK || 1),
      }),
      signal: controller.signal,
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload?.error || `Falha HTTP ${response.status}`);
    }

    if (!Array.isArray(payload?.results)) {
      throw new Error("Resposta da API sem array results.");
    }

    return evaluateBenchmarkCase(testCase, payload.results);
  } finally {
    clearTimeout(timeout);
  }
}

function summarizeByCategory(outcomes) {
  const summary = new Map();

  for (const outcome of outcomes) {
    const current = summary.get(outcome.testCase.category) || {
      total: 0,
      passed: 0,
    };

    current.total += 1;

    if (outcome.evaluation?.passed) {
      current.passed += 1;
    }

    summary.set(outcome.testCase.category, current);
  }

  return summary;
}

async function main() {
  const benchmarkFile = resolveBenchmarkFile();
  const searchUrl = resolveSearchUrl();
  const defaultRequestLimit = readIntegerOption("request-limit", 10);
  const timeoutMs = readIntegerOption("timeout-ms", 15000);
  const benchmarkCases = filterCases(loadBenchmarkCases(benchmarkFile));

  if (benchmarkCases.length === 0) {
    throw new Error("Nenhum caso de benchmark encontrado com os filtros informados.");
  }

  console.log(`Rodando ${benchmarkCases.length} casos contra ${searchUrl}`);

  const outcomes = [];

  for (const testCase of benchmarkCases) {
    try {
      const evaluation = await runCase(testCase, searchUrl, defaultRequestLimit, timeoutMs);
      outcomes.push({
        testCase,
        evaluation,
      });

      if (!evaluation.passed) {
        printCaseFailure(testCase, evaluation);
      }
    } catch (error) {
      outcomes.push({
        testCase,
        error,
      });
      console.log(`- [ERROR] ${testCase.id} | ${testCase.category} | query="${testCase.query}" | ${error.message}`);
    }
  }

  const passedCount = outcomes.filter((outcome) => outcome.evaluation?.passed).length;
  const failedCount = outcomes.filter((outcome) => outcome.evaluation && !outcome.evaluation.passed).length;
  const errorCount = outcomes.filter((outcome) => outcome.error).length;
  const successRate = ((passedCount / outcomes.length) * 100).toFixed(2);

  console.log("");
  console.log("Resumo por categoria:");

  for (const [category, categorySummary] of summarizeByCategory(outcomes).entries()) {
    const categoryRate = ((categorySummary.passed / categorySummary.total) * 100).toFixed(2);
    console.log(`- ${category}: ${categorySummary.passed}/${categorySummary.total} (${categoryRate}%)`);
  }

  console.log("");
  console.log("Resumo geral:");
  console.log(`- aprovados: ${passedCount}`);
  console.log(`- falhas de relevancia: ${failedCount}`);
  console.log(`- erros de execucao: ${errorCount}`);
  console.log(`- taxa de acerto: ${successRate}%`);

  if (failedCount > 0 || errorCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Falha ao rodar benchmark de qualidade da busca:", error.message);
  process.exitCode = 1;
});
