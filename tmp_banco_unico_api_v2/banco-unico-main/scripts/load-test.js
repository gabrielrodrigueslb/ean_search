const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

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

function readCliOptions(name) {
  const exactPrefix = `--${name}=`;
  const args = process.argv.slice(2);
  const values = [];

  for (const [index, argument] of args.entries()) {
    if (argument.startsWith(exactPrefix)) {
      values.push(argument.slice(exactPrefix.length));
      continue;
    }

    if (argument === `--${name}` && args[index + 1] !== undefined) {
      values.push(args[index + 1]);
    }
  }

  return values;
}

function hasCliFlag(name) {
  return process.argv.slice(2).includes(`--${name}`);
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

function readNonNegativeIntegerOption(name, fallback) {
  const rawValue = readCliOption(name);

  if (rawValue === undefined || rawValue === "") {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);

  if (Number.isNaN(parsed) || parsed < 0) {
    throw new Error(`A opcao --${name} precisa ser um numero inteiro maior ou igual a zero.`);
  }

  return parsed;
}

function readStringOption(name, fallback = undefined) {
  const rawValue = readCliOption(name);

  if (rawValue === undefined || rawValue === "") {
    return fallback;
  }

  const normalized = String(rawValue).trim();
  return normalized || fallback;
}

function resolveBaseUrl() {
  const cliBaseUrl = readCliOption("base-url");
  const envBaseUrl = process.env.LOAD_TEST_BASE_URL || process.env.API_BASE_URL;
  const fallbackBaseUrl = `http://127.0.0.1:${process.env.PORT || 3000}`;

  return String(cliBaseUrl || envBaseUrl || fallbackBaseUrl).replace(/\/+$/, "");
}

function parseHeaders() {
  const entries = readCliOptions("header");
  const headers = {};

  for (const entry of entries) {
    const separatorIndex = entry.indexOf(":");

    if (separatorIndex === -1) {
      throw new Error(`Cabecalho invalido em --header: "${entry}". Use o formato Nome: valor.`);
    }

    const name = entry.slice(0, separatorIndex).trim();
    const value = entry.slice(separatorIndex + 1).trim();

    if (!name || !value) {
      throw new Error(`Cabecalho invalido em --header: "${entry}".`);
    }

    headers[name] = value;
  }

  return headers;
}

function parseStages() {
  const rawStages = readStringOption("stages", null);

  if (!rawStages) {
    return [
      {
        concurrency: readIntegerOption("concurrency", 5),
        durationSeconds: readIntegerOption("duration", 30),
      },
    ];
  }

  return rawStages.split(",").map((stage, index) => {
    const trimmedStage = stage.trim();
    const match = /^(\d+)x(\d+)$/.exec(trimmedStage);

    if (!match) {
      throw new Error(
        `Stage invalido "${trimmedStage}". Use o formato concorrenciaxduracao, por exemplo 10x30.`,
      );
    }

    const concurrency = Number.parseInt(match[1], 10);
    const durationSeconds = Number.parseInt(match[2], 10);

    if (concurrency < 1 || durationSeconds < 1) {
      throw new Error(`Stage invalido na posicao ${index + 1}.`);
    }

    return {
      concurrency,
      durationSeconds,
    };
  });
}

function resolveBenchmarkFile() {
  const relativeFile = readCliOption("file") || "benchmarks/search-quality.cases.json";
  return path.resolve(process.cwd(), relativeFile);
}

function loadBenchmarkCases(filePath) {
  const rawFile = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(rawFile);

  if (!Array.isArray(parsed?.cases)) {
    throw new Error("O arquivo de benchmark precisa conter um array em cases.");
  }

  return parsed;
}

function filterBenchmarkCases(cases) {
  const category = readStringOption("category", null);
  const limitCases = readIntegerOption("limit-cases", null);
  let filteredCases = category
    ? cases.filter((testCase) => String(testCase.category || "").toLowerCase() === category.toLowerCase())
    : cases.slice();

  if (limitCases !== null) {
    filteredCases = filteredCases.slice(0, limitCases);
  }

  return filteredCases;
}

function buildSearchBodies() {
  const explicitQuery = readStringOption("query", null);
  const requestLimit = readIntegerOption("request-limit", null);
  const offset = readNonNegativeIntegerOption("offset", 0);

  if (explicitQuery) {
    return {
      description: `query unica "${explicitQuery}"`,
      bodies: [
        {
          query: explicitQuery,
          limit: requestLimit || 10,
          offset,
        },
      ],
    };
  }

  const benchmarkFile = resolveBenchmarkFile();
  const benchmark = loadBenchmarkCases(benchmarkFile);
  const benchmarkCases = filterBenchmarkCases(benchmark.cases);
  const defaultRequestLimit = requestLimit
    || benchmark.metadata?.defaultRequestLimit
    || 10;

  if (benchmarkCases.length === 0) {
    throw new Error("Nenhum caso de benchmark encontrado para montar o teste de busca.");
  }

  return {
    description: `${benchmarkCases.length} queries de ${path.relative(process.cwd(), benchmarkFile)}`,
    bodies: benchmarkCases.map((testCase) => ({
      query: testCase.query,
      limit: Math.max(defaultRequestLimit, testCase.expectedTopK || 1),
      offset,
    })),
  };
}

function buildScenario() {
  const scenario = readStringOption("scenario", "search");

  if (scenario === "health") {
    const resolvedMethod = readStringOption("method", "GET").toUpperCase();
    const requestPath = readStringOption("path", "/health");
    const resolvedPath = requestPath.startsWith("/") ? requestPath : `/${requestPath}`;

    return {
      scenario,
      method: resolvedMethod,
      path: resolvedPath,
      targetDescription: resolvedPath,
      nextRequest() {
        return {
          method: resolvedMethod,
          path: resolvedPath,
          headers: {},
          body: null,
          label: "health",
        };
      },
    };
  }

  if (scenario === "search") {
    const resolvedMethod = readStringOption("method", "POST").toUpperCase();
    const requestPath = readStringOption("path", "/api/products/search");
    const resolvedPath = requestPath.startsWith("/") ? requestPath : `/${requestPath}`;
    const searchBodies = buildSearchBodies();
    let nextBodyIndex = 0;

    return {
      scenario,
      method: resolvedMethod,
      path: resolvedPath,
      targetDescription: `${resolvedPath} com ${searchBodies.description}`,
      nextRequest() {
        const body = searchBodies.bodies[nextBodyIndex % searchBodies.bodies.length];
        nextBodyIndex += 1;

        return {
          method: resolvedMethod,
          path: resolvedPath,
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          label: body.query,
        };
      },
    };
  }

  throw new Error('A opcao --scenario precisa ser "health" ou "search".');
}

function createEmptyMetrics() {
  return {
    startedAt: new Date().toISOString(),
    completedRequests: 0,
    successfulResponses: 0,
    failedResponses: 0,
    httpErrors: 0,
    networkErrors: 0,
    timeoutErrors: 0,
    totalBytes: 0,
    latenciesMs: [],
    statusCodes: {},
    samples: [],
  };
}

function recordStatusCode(statusCodes, status) {
  const key = String(status);
  statusCodes[key] = (statusCodes[key] || 0) + 1;
}

function recordSample(samples, sample, limit = 10) {
  if (samples.length < limit) {
    samples.push(sample);
  }
}

function percentile(sortedValues, fraction) {
  if (!sortedValues.length) {
    return null;
  }

  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil(sortedValues.length * fraction) - 1),
  );

  return sortedValues[index];
}

function summarizeMetrics(metrics, elapsedMs) {
  const sortedLatencies = metrics.latenciesMs.slice().sort((left, right) => left - right);
  const completedRequests = metrics.completedRequests;
  const elapsedSeconds = elapsedMs / 1000;

  return {
    startedAt: metrics.startedAt,
    completedRequests,
    successfulResponses: metrics.successfulResponses,
    failedResponses: metrics.failedResponses,
    httpErrors: metrics.httpErrors,
    networkErrors: metrics.networkErrors,
    timeoutErrors: metrics.timeoutErrors,
    statusCodes: metrics.statusCodes,
    totalBytes: metrics.totalBytes,
    elapsedMs: Number(elapsedMs.toFixed(2)),
    requestsPerSecond: elapsedSeconds > 0
      ? Number((completedRequests / elapsedSeconds).toFixed(2))
      : 0,
    successRate: completedRequests > 0
      ? Number(((metrics.successfulResponses / completedRequests) * 100).toFixed(2))
      : 0,
    latency: {
      minMs: sortedLatencies.length ? Number(sortedLatencies[0].toFixed(2)) : null,
      avgMs: sortedLatencies.length
        ? Number((sortedLatencies.reduce((sum, value) => sum + value, 0) / sortedLatencies.length).toFixed(2))
        : null,
      p50Ms: sortedLatencies.length ? Number(percentile(sortedLatencies, 0.5).toFixed(2)) : null,
      p90Ms: sortedLatencies.length ? Number(percentile(sortedLatencies, 0.9).toFixed(2)) : null,
      p95Ms: sortedLatencies.length ? Number(percentile(sortedLatencies, 0.95).toFixed(2)) : null,
      p99Ms: sortedLatencies.length ? Number(percentile(sortedLatencies, 0.99).toFixed(2)) : null,
      maxMs: sortedLatencies.length ? Number(sortedLatencies[sortedLatencies.length - 1].toFixed(2)) : null,
    },
    samples: metrics.samples,
  };
}

async function executeRequest(baseUrl, scenarioRequest, timeoutMs, extraHeaders = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  const startedAt = performance.now();

  try {
    const response = await fetch(`${baseUrl}${scenarioRequest.path}`, {
      method: scenarioRequest.method,
      headers: {
        ...scenarioRequest.headers,
        ...extraHeaders,
      },
      body: scenarioRequest.body,
      signal: controller.signal,
    });
    const rawBody = await response.text();
    const latencyMs = performance.now() - startedAt;

    return {
      ok: response.ok,
      status: response.status,
      latencyMs,
      bytes: Buffer.byteLength(rawBody, "utf8"),
      error: null,
      label: scenarioRequest.label,
    };
  } catch (error) {
    const latencyMs = performance.now() - startedAt;
    const aborted = error?.name === "AbortError";

    return {
      ok: false,
      status: null,
      latencyMs,
      bytes: 0,
      error: aborted ? `timeout depois de ${timeoutMs}ms` : error.message,
      timedOut: aborted,
      label: scenarioRequest.label,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runStage(baseUrl, stage, scenario, timeoutMs, extraHeaders, progressIntervalMs) {
  const metrics = createEmptyMetrics();
  const stageStartedAt = performance.now();
  const stageDeadline = stageStartedAt + (stage.durationSeconds * 1000);
  let lastProgressAt = stageStartedAt;

  function printProgress(force = false) {
    const now = performance.now();

    if (!force && (progressIntervalMs < 1 || now - lastProgressAt < progressIntervalMs)) {
      return;
    }

    lastProgressAt = now;
    const elapsedMs = now - stageStartedAt;
    const elapsedSeconds = elapsedMs / 1000;
    const rps = elapsedSeconds > 0 ? (metrics.completedRequests / elapsedSeconds).toFixed(2) : "0.00";

    console.log(
      `  progresso: ${metrics.completedRequests} reqs | sucesso ${metrics.successfulResponses} | falhas ${metrics.failedResponses} | ${rps} req/s`,
    );
  }

  async function worker() {
    while (performance.now() < stageDeadline) {
      const result = await executeRequest(baseUrl, scenario.nextRequest(), timeoutMs, extraHeaders);

      metrics.completedRequests += 1;
      metrics.totalBytes += result.bytes;
      metrics.latenciesMs.push(result.latencyMs);

      if (result.status !== null) {
        recordStatusCode(metrics.statusCodes, result.status);
      }

      if (result.ok) {
        metrics.successfulResponses += 1;
      } else {
        metrics.failedResponses += 1;

        if (result.status !== null) {
          metrics.httpErrors += 1;
        } else if (result.timedOut) {
          metrics.timeoutErrors += 1;
        } else {
          metrics.networkErrors += 1;
        }

        recordSample(metrics.samples, {
          label: result.label,
          status: result.status,
          error: result.error,
          latencyMs: Number(result.latencyMs.toFixed(2)),
        });
      }

      printProgress(false);
    }
  }

  await Promise.all(Array.from({ length: stage.concurrency }, () => worker()));

  printProgress(true);

  const elapsedMs = performance.now() - stageStartedAt;

  return {
    ...summarizeMetrics(metrics, elapsedMs),
    _rawLatencies: metrics.latenciesMs.slice(),
  };
}

function mergeStatusCodes(summaries) {
  const merged = {};

  for (const summary of summaries) {
    for (const [statusCode, count] of Object.entries(summary.statusCodes || {})) {
      merged[statusCode] = (merged[statusCode] || 0) + count;
    }
  }

  return merged;
}

function mergeSamples(summaries, limit = 10) {
  const samples = [];

  for (const summary of summaries) {
    for (const sample of summary.samples || []) {
      if (samples.length >= limit) {
        return samples;
      }

      samples.push(sample);
    }
  }

  return samples;
}

function formatStatusCodes(statusCodes) {
  const entries = Object.entries(statusCodes);

  if (entries.length === 0) {
    return "nenhum";
  }

  return entries
    .sort((left, right) => Number(left[0]) - Number(right[0]))
    .map(([statusCode, count]) => `${statusCode}=${count}`)
    .join(", ");
}

function printStageSummary(stageIndex, totalStages, stage, summary) {
  console.log("");
  console.log(`Resumo do stage ${stageIndex + 1}/${totalStages} (${stage.concurrency}x${stage.durationSeconds}s):`);
  console.log(`- requests concluidas: ${summary.completedRequests}`);
  console.log(`- sucesso: ${summary.successfulResponses} (${summary.successRate}%)`);
  console.log(`- falhas: ${summary.failedResponses}`);
  console.log(`- req/s: ${summary.requestsPerSecond}`);
  console.log(
    `- latencia ms: min ${summary.latency.minMs} | avg ${summary.latency.avgMs} | p95 ${summary.latency.p95Ms} | p99 ${summary.latency.p99Ms} | max ${summary.latency.maxMs}`,
  );
  console.log(`- status HTTP: ${formatStatusCodes(summary.statusCodes)}`);

  if (summary.timeoutErrors || summary.networkErrors || summary.httpErrors) {
    console.log(
      `- erros: http ${summary.httpErrors} | timeout ${summary.timeoutErrors} | rede ${summary.networkErrors}`,
    );
  }
}

function buildOverallSummary(stageResults) {
  const allLatencies = stageResults.flatMap((stageResult) => stageResult._rawLatencies || []);
  const mergedMetrics = {
    startedAt: stageResults[0]?.startedAt || new Date().toISOString(),
    completedRequests: stageResults.reduce((sum, item) => sum + item.completedRequests, 0),
    successfulResponses: stageResults.reduce((sum, item) => sum + item.successfulResponses, 0),
    failedResponses: stageResults.reduce((sum, item) => sum + item.failedResponses, 0),
    httpErrors: stageResults.reduce((sum, item) => sum + item.httpErrors, 0),
    networkErrors: stageResults.reduce((sum, item) => sum + item.networkErrors, 0),
    timeoutErrors: stageResults.reduce((sum, item) => sum + item.timeoutErrors, 0),
    totalBytes: stageResults.reduce((sum, item) => sum + item.totalBytes, 0),
    statusCodes: mergeStatusCodes(stageResults),
    latenciesMs: allLatencies,
    samples: mergeSamples(stageResults),
  };
  const totalElapsedMs = stageResults.reduce((sum, item) => sum + item.elapsedMs, 0);

  return summarizeMetrics(mergedMetrics, totalElapsedMs);
}

function printOverallSummary(summary) {
  console.log("");
  console.log("Resumo geral:");
  console.log(`- requests concluidas: ${summary.completedRequests}`);
  console.log(`- sucesso: ${summary.successfulResponses} (${summary.successRate}%)`);
  console.log(`- falhas: ${summary.failedResponses}`);
  console.log(`- req/s medio: ${summary.requestsPerSecond}`);
  console.log(
    `- latencia ms: min ${summary.latency.minMs} | avg ${summary.latency.avgMs} | p50 ${summary.latency.p50Ms} | p90 ${summary.latency.p90Ms} | p95 ${summary.latency.p95Ms} | p99 ${summary.latency.p99Ms} | max ${summary.latency.maxMs}`,
  );
  console.log(`- status HTTP: ${formatStatusCodes(summary.statusCodes)}`);

  if (summary.timeoutErrors || summary.networkErrors || summary.httpErrors) {
    console.log(
      `- erros: http ${summary.httpErrors} | timeout ${summary.timeoutErrors} | rede ${summary.networkErrors}`,
    );
  }

  if (summary.samples.length > 0) {
    console.log("- amostras de falha:");

    for (const sample of summary.samples) {
      console.log(
        `  * query="${sample.label}" | status=${sample.status ?? "sem resposta"} | latencia=${sample.latencyMs}ms | erro=${sample.error || "HTTP nao-2xx"}`,
      );
    }
  }
}

function printHelp() {
  console.log("Uso:");
  console.log("  npm run benchmark:load -- --base-url=https://sua-vps --scenario=health --stages=10x15,50x15,100x15");
  console.log("  npm run benchmark:load -- --base-url=https://sua-vps --scenario=search --stages=1x30,5x30,10x30");
  console.log("");
  console.log("Opcoes principais:");
  console.log("  --base-url        URL base da API. Ex.: https://unicocontato.tech/banco-unico");
  console.log("  --scenario        health ou search. Padrao: search");
  console.log("  --stages          Lista de stages no formato concorrenciaxduracao. Ex.: 5x30,10x30,25x30");
  console.log("  --concurrency     Concorrencia fixa quando --stages nao for informado. Padrao: 5");
  console.log("  --duration        Duracao fixa em segundos quando --stages nao for informado. Padrao: 30");
  console.log("  --timeout-ms      Timeout de cada request. Padrao: 15000");
  console.log("  --header          Cabecalho extra. Pode repetir. Ex.: --header='Authorization: Bearer token'");
  console.log("  --output          Caminho para salvar o resumo em JSON");
  console.log("");
  console.log("Opcoes do cenario search:");
  console.log("  --query           Usa uma query unica em todas as requisicoes");
  console.log("  --request-limit   Sobrescreve o limit enviado para /api/products/search");
  console.log("  --file            Arquivo de casos de benchmark. Padrao: benchmarks/search-quality.cases.json");
  console.log("  --category        Filtra uma categoria do benchmark");
  console.log("  --limit-cases     Usa apenas os primeiros N casos do benchmark");
  console.log("  --offset          Offset enviado nas buscas. Padrao: 0");
}

async function main() {
  if (hasCliFlag("help")) {
    printHelp();
    return;
  }

  const baseUrl = resolveBaseUrl();
  const timeoutMs = readIntegerOption("timeout-ms", 15000);
  const stages = parseStages();
  const extraHeaders = parseHeaders();
  const progressIntervalMs = readNonNegativeIntegerOption("progress-interval-ms", 5000);
  const outputFile = readStringOption("output", null);
  const scenario = buildScenario();
  const stageResults = [];

  console.log(`Iniciando teste de carga em ${baseUrl}`);
  console.log(`- cenario: ${scenario.scenario}`);
  console.log(`- alvo: ${scenario.targetDescription}`);
  console.log(`- timeout por request: ${timeoutMs}ms`);
  console.log(`- stages: ${stages.map((stage) => `${stage.concurrency}x${stage.durationSeconds}s`).join(", ")}`);

  if (scenario.scenario === "search") {
    console.log("- observacao: esse cenario inclui a latencia e os limites da OpenAI, alem da sua VPS.");
  }

  for (const [stageIndex, stage] of stages.entries()) {
    console.log("");
    console.log(`Rodando stage ${stageIndex + 1}/${stages.length}: ${stage.concurrency} clientes por ${stage.durationSeconds}s`);

    const summary = await runStage(
      baseUrl,
      stage,
      scenario,
      timeoutMs,
      extraHeaders,
      progressIntervalMs,
    );

    stageResults.push({
      ...summary,
      stage,
    });

    printStageSummary(stageIndex, stages.length, stage, summary);
  }

  const overallSummary = buildOverallSummary(stageResults);
  printOverallSummary(overallSummary);

  if (outputFile) {
    const outputPath = path.resolve(process.cwd(), outputFile);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify({
      baseUrl,
      scenario: scenario.scenario,
      timeoutMs,
      stages,
      stageResults: stageResults.map(({ _rawLatencies, ...stageResult }) => stageResult),
      overallSummary,
      generatedAt: new Date().toISOString(),
    }, null, 2));
    console.log("");
    console.log(`Resumo salvo em ${outputPath}`);
  }

  if (overallSummary.failedResponses > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Falha ao rodar teste de carga:", error.message);
  process.exitCode = 1;
});
