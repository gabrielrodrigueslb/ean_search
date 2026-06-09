import axios from "axios";
import env from "../config/env.js";

let sharedOpenAiWebCooldownUntil = 0;

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return null;
  }

  const seconds = Number(normalized);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const retryAt = Date.parse(normalized);
  if (Number.isNaN(retryAt)) {
    return null;
  }

  return Math.max(0, retryAt - Date.now());
}

function extractStatusCode(error) {
  return Number(error?.response?.status || 0);
}

function isRetryableError(error) {
  const status = extractStatusCode(error);
  if (status === 408 || status === 409 || status === 425 || status === 429) {
    return true;
  }

  if (status >= 500 && status <= 599) {
    return true;
  }

  return [
    "ECONNABORTED",
    "ECONNRESET",
    "ETIMEDOUT",
    "ENOTFOUND",
    "EAI_AGAIN",
  ].includes(String(error?.code || "").toUpperCase());
}

function buildLookupVariants(rawName) {
  const value = String(rawName || "").trim();
  if (!value) {
    return [];
  }

  const replacements = [
    [/\bCPS?\b/gi, "comprimidos"],
    [/\bCOMP?\b/gi, "comprimidos"],
    [/\bCAPS?\b/gi, "capsulas"],
    [/\bENV\b/gi, "envelope"],
    [/\bEFERV\b/gi, "efervescente"],
    [/\bREV\b/gi, "revestidos"],
    [/\bHID\b/gi, "hidratacao"],
    [/\bPERF\b/gi, "perfuma"],
    [/\bINT\b/gi, "intensiva"],
    [/\bSEC RAP\b/gi, "secagem rapida"],
    [/\bANTI-RESIDUOS?\b/gi, "anti residuos"],
    [/\bCAB\.?\b/gi, "cabelos"],
    [/\bTINTOS\b/gi, "tingidos"],
    [/\bSH\.?\b/gi, "shampoo"],
    [/\bCOND\.?\b/gi, "condicionador"],
    [/\bDESOD\.?\b/gi, "desodorante"],
    [/\bAERO\b/gi, "aerosol"],
  ];

  const variants = new Set([value]);
  let expanded = value
    .replace(/[\/]+/g, " ")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();

  for (const [pattern, replacement] of replacements) {
    expanded = expanded.replace(pattern, replacement);
  }

  expanded = expanded.replace(/\s+/g, " ").trim();

  if (expanded && expanded !== value) {
    variants.add(expanded);
  }

  return [...variants].slice(0, 3);
}

function extractStructuredText(responseData = {}) {
  if (typeof responseData.output_text === "string" && responseData.output_text.trim()) {
    return responseData.output_text.trim();
  }

  const output = Array.isArray(responseData.output) ? responseData.output : [];

  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];

    for (const part of content) {
      if (typeof part?.text === "string" && part.text.trim()) {
        return part.text.trim();
      }
    }
  }

  return "";
}

function extractSources(responseData = {}) {
  const sources = [];
  const output = Array.isArray(responseData.output) ? responseData.output : [];

  for (const item of output) {
    const actionSources = Array.isArray(item?.action?.sources) ? item.action.sources : [];
    for (const source of actionSources) {
      sources.push({
        title: source?.title || null,
        url: source?.url || null,
      });
    }

    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      const annotations = Array.isArray(part?.annotations) ? part.annotations : [];
      for (const annotation of annotations) {
        if (annotation?.type === "url_citation") {
          sources.push({
            title: annotation.title || null,
            url: annotation.url || null,
          });
        }
      }
    }
  }

  return sources.filter((source, index, allSources) => (
    source.url
      && allSources.findIndex((candidate) => candidate.url === source.url) === index
  ));
}

class OpenAiWebLookupClient {
  constructor({
    apiKey,
    baseUrl,
    model,
    timeoutMs,
    maxRetries,
    retryBaseDelayMs,
    retryMaxDelayMs,
    allowedDomains,
    minConfidence,
    httpClient,
    sleepFn,
  } = {}) {
    this.apiKey = String(apiKey || env.openAiApiKey || "").trim();
    this.baseUrl = trimTrailingSlash(baseUrl || env.openAiBaseUrl);
    this.model = model || env.openAiWebLookupModel;
    this.timeoutMs = timeoutMs || env.openAiWebLookupTimeoutMs;
    this.maxRetries = Math.max(0, Number(maxRetries ?? env.openAiWebLookupMaxRetries ?? 3));
    this.retryBaseDelayMs = Math.max(250, Number(retryBaseDelayMs ?? env.openAiWebLookupRetryBaseDelayMs ?? 1500));
    this.retryMaxDelayMs = Math.max(this.retryBaseDelayMs, Number(retryMaxDelayMs ?? env.openAiWebLookupRetryMaxDelayMs ?? 15000));
    this.allowedDomains = Array.isArray(allowedDomains)
      ? allowedDomains
      : env.openAiWebLookupAllowedDomains;
    this.minConfidence = Number(minConfidence || env.openAiWebLookupMinConfidence || 0);
    this.http = httpClient || axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeoutMs,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });
    this.sleep = sleepFn || sleep;
  }

  isConfigured() {
    return Boolean(this.apiKey);
  }

  buildWebSearchTool() {
    const tool = {
      type: "web_search",
      user_location: {
        type: "approximate",
        country: "BR",
        timezone: "America/Sao_Paulo",
      },
    };

    if (this.allowedDomains.length) {
      tool.filters = {
        allowed_domains: this.allowedDomains,
      };
    }

    return tool;
  }

  async waitForCooldown() {
    const now = Date.now();
    if (sharedOpenAiWebCooldownUntil > now) {
      await this.sleep(sharedOpenAiWebCooldownUntil - now);
    }
  }

  computeRetryDelayMs(error, attempt) {
    const retryAfterMs = parseRetryAfterMs(error?.response?.headers?.["retry-after"]);
    if (retryAfterMs !== null) {
      return Math.min(this.retryMaxDelayMs, Math.max(this.retryBaseDelayMs, retryAfterMs));
    }

    const exponentialDelay = this.retryBaseDelayMs * (2 ** Math.max(0, attempt - 1));
    const jitter = Math.floor(Math.random() * 250);
    return Math.min(this.retryMaxDelayMs, exponentialDelay + jitter);
  }

  buildRequestPayload({ ean, rawName = null } = {}) {
    const queryVariants = buildLookupVariants(rawName);

    return {
      model: this.model,
      tools: [this.buildWebSearchTool()],
      tool_choice: "auto",
      include: ["web_search_call.action.sources"],
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: [
                "Voce enriquece cadastro de produtos por EAN/GTIN para farmacia no Brasil.",
                "Use busca na internet apenas para encontrar evidencias publicas.",
                "Retorne null quando nao houver evidencia suficiente de que o resultado corresponde ao EAN.",
                "Nao invente nome, laboratorio, registro, principio ativo ou categoria.",
                "Prefira paginas que mencionem explicitamente codigo de barras, EAN, GTIN ou o mesmo produto.",
                "Use o nome bruto e as variacoes de busca apenas como apoio para localizar o mesmo item do EAN.",
                "Se o nome bruto vier abreviado, trate as abreviacoes como pista de busca e expanda o nome final para uma forma comercial clara e completa sempre que a evidencia encontrada permitir.",
                "Nao devolva nome final abreviado ou truncado quando houver evidencia suficiente para corrigir abreviacoes comuns como SH, COND, CR, HIDR, DES, SAB, SAB LIQ, REF, ENV, PENT, TRAT, CP, CPS, CPD, UND, UNDS, C/100, C/50, P/ CAB, CAB, AERO, P/M, G/XG, XG e XXG.",
                "Quando houver contexto suficiente, prefira expandir abreviacoes operacionais como P/ para Para, CAB para Cabelo, SAB LIQ para Sabonete Liquido, REF para Refil,CR PENT para Creme para Pentear, TRAT para Tratamento e C/100 para Com 100 Unidades.",
                "Nao tente expandir siglas legitimas de formula, atributo, tamanho comercial, vitamina, linha ou codigo de modelo quando elas ja forem a melhor forma publica do produto, como FPS, UV, Q10, D3, B5, XL, UMD ou codigos internos.",
              ].join(" "),
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                ean: String(ean || ""),
                nome_bruto: rawName || null,
                query_variants: queryVariants,
                instrucoes: [
                  "Pesquise primeiro pelo EAN exato.",
                  "Se necessario, pesquise pelo EAN junto com o nome bruto e com query_variants.",
                  "Se encontrar o produto, extraia apenas campos vistos nas fontes.",
                  "confidence deve refletir a forca da evidencia entre 0 e 1.",
                ],
              }),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "openai_web_product_lookup",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              found: { type: "boolean" },
              confidence: { type: "number" },
              produto: { type: ["string", "null"] },
              nome_exibicao: { type: ["string", "null"] },
              apresentacao: { type: ["string", "null"] },
              laboratorio: { type: ["string", "null"] },
              categoria: { type: ["string", "null"] },
              registro_ms: { type: ["string", "null"] },
              tarja: { type: ["string", "null"] },
              forma_farmaceutica: { type: ["string", "null"] },
              via_administracao: { type: ["string", "null"] },
              quantidade: { type: ["string", "null"] },
              principio_ativo: {
                type: "array",
                items: { type: "string" },
              },
              evidence: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    title: { type: ["string", "null"] },
                    url: { type: ["string", "null"] },
                    matched_ean: { type: "boolean" },
                    note: { type: "string" },
                  },
                  required: ["title", "url", "matched_ean", "note"],
                },
              },
              rationale: { type: "string" },
            },
            required: [
              "found",
              "confidence",
              "produto",
              "nome_exibicao",
              "apresentacao",
              "laboratorio",
              "categoria",
              "registro_ms",
              "tarja",
              "forma_farmaceutica",
              "via_administracao",
              "quantidade",
              "principio_ativo",
              "evidence",
              "rationale",
            ],
          },
        },
      },
    };
  }

  async lookupProduct({ ean, rawName = null } = {}) {
    if (!this.isConfigured()) {
      throw new Error("OPENAI_API_KEY nao configurada para fallback OpenAI Web.");
    }

    const payload = this.buildRequestPayload({ ean, rawName });
    let response = null;
    let lastError = null;

    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt += 1) {
      await this.waitForCooldown();

      try {
        response = await this.http.post("/responses", payload);
        break;
      } catch (error) {
        lastError = error;
        if (!isRetryableError(error) || attempt > this.maxRetries) {
          throw error;
        }

        const delayMs = this.computeRetryDelayMs(error, attempt);
        if (extractStatusCode(error) === 429) {
          sharedOpenAiWebCooldownUntil = Math.max(sharedOpenAiWebCooldownUntil, Date.now() + delayMs);
        }
        await this.sleep(delayMs);
      }
    }

    if (!response && lastError) {
      throw lastError;
    }

    const text = extractStructuredText(response.data);
    if (!text) {
      throw new Error("A OpenAI nao retornou resultado estruturado para enriquecimento web.");
    }

    const parsed = JSON.parse(text);
    const evidence = Array.isArray(parsed.evidence) ? parsed.evidence : [];
    const hasEvidenceUrl = evidence.some((entry) => entry?.url);
    const hasMatchedEan = evidence.some((entry) => entry?.matched_ean === true);

    return {
      ...parsed,
      sources: extractSources(response.data),
      accepted: parsed.found === true
        && Number(parsed.confidence || 0) >= this.minConfidence
        && hasEvidenceUrl
        && (hasMatchedEan || Number(parsed.confidence || 0) >= 0.9),
    };
  }
}

export { OpenAiWebLookupClient };
