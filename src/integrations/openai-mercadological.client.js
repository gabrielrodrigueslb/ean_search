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

class OpenAiMercadologicalClient {
  constructor({
    apiKey,
    baseUrl,
    model,
    timeoutMs,
  } = {}) {
    this.apiKey = String(apiKey || env.openAiApiKey || "").trim();
    this.baseUrl = trimTrailingSlash(baseUrl || env.openAiBaseUrl);
    this.model = model || env.mercadologicalAiModel;
    this.timeoutMs = timeoutMs || env.mercadologicalAiTimeoutMs;
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

  async classifyProduct({ product, candidates }) {
    if (!this.isConfigured()) {
      throw new Error("OPENAI_API_KEY nao configurada para classificacao mercadologica.");
    }

    const response = await this.http.post("/responses", {
      model: this.model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: [
                "Voce classifica produtos em uma arvore mercadologica fixa.",
                "Escolha apenas uma opcao da lista de candidatos.",
                "Nao invente categorias fora da arvore recebida.",
                "Normalize principio_ativo como lista curta de strings.",
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
                product,
                candidates,
              }),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "mercadological_classification",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              candidate_id: { type: "string" },
              departamento: { type: ["string", "null"] },
              categoria: { type: ["string", "null"] },
              subcategoria: { type: ["string", "null"] },
              segmento: { type: ["string", "null"] },
              subsegmento: { type: ["string", "null"] },
              principio_ativo: {
                type: "array",
                items: { type: "string" },
              },
              confidence: { type: "number" },
              rationale: { type: "string" },
            },
            required: [
              "candidate_id",
              "departamento",
              "categoria",
              "subcategoria",
              "segmento",
              "subsegmento",
              "principio_ativo",
              "confidence",
              "rationale",
            ],
          },
        },
      },
    });

    const text = extractStructuredText(response.data);
    if (!text) {
      throw new Error("A OpenAI nao retornou classificacao mercadologica em texto estruturado.");
    }

    return JSON.parse(text);
  }
}

export { OpenAiMercadologicalClient };
