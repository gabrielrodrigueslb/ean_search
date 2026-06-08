import { ProductLookupSourceContract } from "../../contracts/product-lookup-source.contract.js";
import { OpenAiWebLookupClient } from "../../integrations/openai-web-lookup.client.js";

function pickFirstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

class OpenAiWebLookupSource extends ProductLookupSourceContract {
  constructor({ client, rawNameResolver } = {}) {
    super();
    this.client = client || new OpenAiWebLookupClient();
    this.rawNameResolver = rawNameResolver || (() => null);
  }

  getSourceKey() {
    return "openai_web";
  }

  async lookupByEan(ean, context = {}) {
    if (!this.client.isConfigured()) {
      return {
        key: this.getSourceKey(),
        result: null,
        detail: null,
        error: "OPENAI_API_KEY nao configurada.",
      };
    }

    try {
      const rawName = pickFirstString(
        context.rawName,
        this.rawNameResolver(ean, context),
      );
      const result = await this.client.lookupProduct({ ean, rawName });

      if (!result.accepted) {
        return {
          key: this.getSourceKey(),
          result: null,
          detail: null,
          error: "OpenAI Web sem evidencia suficiente.",
        };
      }

      const nome = pickFirstString(result.produto, result.nome_exibicao);

      return {
        key: this.getSourceKey(),
        result: {
          nome,
          nome_produto: nome,
          nome_exibicao: pickFirstString(result.nome_exibicao, [result.produto, result.apresentacao].filter(Boolean).join(" ").trim(), nome),
          produto: nome,
          apresentacao: result.apresentacao || null,
          laboratorio: result.laboratorio || null,
          categoria: result.categoria || null,
          registro_ms: result.registro_ms || null,
          tarja: result.tarja || null,
          origem: this.getSourceKey(),
          raw: {
            source: this.getSourceKey(),
            confidence: result.confidence,
            evidence: result.evidence,
            sources: result.sources,
            rationale: result.rationale,
          },
        },
        detail: {
          info: {
            produto: nome,
            apresentacao: result.apresentacao || null,
            laboratorio: result.laboratorio || null,
            classe: result.categoria || null,
            categoria: result.categoria || null,
            registro: result.registro_ms || null,
            tarja: result.tarja || null,
            forma_farmaceutica: result.forma_farmaceutica || null,
            via_adm: result.via_administracao || null,
            qtde_fs: result.quantidade || null,
            farmacos: Array.isArray(result.principio_ativo)
              ? result.principio_ativo.map((farmaco) => ({ farmaco }))
              : [],
          },
          raw: {
            source: this.getSourceKey(),
            confidence: result.confidence,
            evidence: result.evidence,
            sources: result.sources,
            rationale: result.rationale,
          },
        },
        error: null,
      };
    } catch (error) {
      const statusCode = Number(error?.response?.status || 0);
      const message = statusCode === 429
        ? "OpenAI Web indisponivel temporariamente por limite de consultas (429)."
        : error.message;

      return {
        key: this.getSourceKey(),
        result: null,
        detail: null,
        error: message,
      };
    }
  }
}

export { OpenAiWebLookupSource };
