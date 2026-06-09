import axios from "axios";
import env from "../config/env.js";

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
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
    allowedDomains,
    minConfidence,
  } = {}) {
    this.apiKey = String(apiKey || env.openAiApiKey || "").trim();
    this.baseUrl = trimTrailingSlash(baseUrl || env.openAiBaseUrl);
    this.model = model || env.openAiWebLookupModel;
    this.timeoutMs = timeoutMs || env.openAiWebLookupTimeoutMs;
    this.allowedDomains = Array.isArray(allowedDomains)
      ? allowedDomains
      : env.openAiWebLookupAllowedDomains;
    this.minConfidence = Number(minConfidence || env.openAiWebLookupMinConfidence || 0);
    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeoutMs,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });
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

  async lookupProduct({ ean, rawName = null } = {}) {
    if (!this.isConfigured()) {
      throw new Error("OPENAI_API_KEY nao configurada para fallback OpenAI Web.");
    }

    const response = await this.http.post("/responses", {
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
                instrucoes: [
                  "Pesquise pelo EAN e, se necessario, pelo EAN junto com o nome bruto.",
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
    });

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
