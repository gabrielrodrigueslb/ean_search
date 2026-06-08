import env from "../config/env.js";
import { EnrichmentService } from "../services/enrichment.service.js";
import { lookupQueueService } from "../services/lookup-queue.service.js";
import { MercadologicalClassificationService } from "../services/mercadological-classification.service.js";
import { ProductService } from "../services/product.service.js";
import { formatSourceLabel } from "../utils/productSourcePolicy.js";
import { validateEAN } from "../utils/validateEAN.js";

function parseLookupBatchInput(rawValue) {
  if (Array.isArray(rawValue)) {
    return rawValue
      .map((value) => String(value || "").trim())
      .filter(Boolean);
  }

  if (typeof rawValue === "string") {
    return rawValue
      .split(/[\n,;]+/)
      .map((value) => value.trim())
      .filter(Boolean);
  }

  return [];
}

function buildBatchSummary(results = []) {
  return results.reduce((acc, result) => {
    acc.total += 1;
    acc[result.status] = (acc[result.status] || 0) + 1;
    return acc;
  }, {
    total: 0,
    enriched: 0,
    review: 0,
    not_found: 0,
    invalid_ean: 0,
    error: 0,
  });
}

function extractAttemptedSources(fontesConsultadas = {}) {
  const groupedSources = new Map();

  for (const [metricKey, value] of Object.entries(fontesConsultadas || {})) {
    const match = metricKey.match(/^(.+?)_(busca|detalhe|busca_error|skipped|skip_reason)$/);
    if (!match) {
      continue;
    }

    const [, sourceKey, metricType] = match;
    const source = groupedSources.get(sourceKey) || {
      key: sourceKey,
      label: formatSourceLabel(sourceKey),
      busca: false,
      detalhe: false,
      erro: null,
      skipped: false,
      skip_reason: null,
    };

    if (metricType === "busca") {
      source.busca = Boolean(value);
    }

    if (metricType === "detalhe") {
      source.detalhe = Boolean(value);
    }

    if (metricType === "busca_error") {
      source.erro = value || null;
    }

    if (metricType === "skipped") {
      source.skipped = Boolean(value);
    }

    if (metricType === "skip_reason") {
      source.skip_reason = value || null;
    }

    groupedSources.set(sourceKey, source);
  }

  return Array.from(groupedSources.values());
}

class LookupController {
  constructor({
    enrichmentService,
    mercadologicalClassificationService,
    productService,
    queueService,
    maxBatchItems = env.lookupBatchMaxItems,
  } = {}) {
    this.enrichmentService = enrichmentService || new EnrichmentService();
    this.mercadologicalClassificationService =
      mercadologicalClassificationService || new MercadologicalClassificationService();
    this.productService = productService || new ProductService();
    this.queueService = queueService || lookupQueueService;
    this.maxBatchItems = Math.min(10, Math.max(1, Number(maxBatchItems || env.lookupBatchMaxItems || 10)));
  }

  async performLookup(ean, session = null) {
    const enriched = await this.enrichmentService.enrichImportedItem({
      ean,
      nome_recebido: null,
      dados_brutos: { ean },
      fonte: "lookup_api",
    }, session);

    if (!enriched.enriched) {
      const fontesConsultadas = enriched.fontes_consultadas || {};

      return {
        status: "not_found",
        ean,
        enriched: false,
        requiresApproval: Boolean(enriched.requiresApproval),
        approvalReason: enriched.approvalReason || null,
        fontes_consultadas: fontesConsultadas,
        item: enriched.item || null,
        product: null,
        error: null,
        fallback: this.buildNotFoundFallback({
          ean,
          fontesConsultadas,
        }),
      };
    }

    const classifiedItem = await this.mercadologicalClassificationService.classifyItem(enriched.item);
    const product = enriched.requiresApproval
      ? null
      : this.productService.buildSnapshot(classifiedItem);

    return {
      status: enriched.requiresApproval ? "review" : "enriched",
      ean,
      enriched: true,
      requiresApproval: Boolean(enriched.requiresApproval),
      approvalReason: enriched.approvalReason || null,
      fontes_consultadas: enriched.fontes_consultadas || {},
      item: classifiedItem,
      product,
      error: null,
      fallback: null,
    };
  }

  async performQueuedLookup(ean, session = null) {
    return this.queueService.enqueue({
      lookupKey: ean,
      handler: () => this.performLookup(ean, session),
    });
  }

  formatSingleResponse(result) {
    return {
      status: result.status,
      ean: result.ean,
      enriched: result.enriched,
      requiresApproval: result.requiresApproval,
      approvalReason: result.approvalReason,
      fontes_consultadas: result.fontes_consultadas,
      item: result.item,
      product: result.product,
      fallback: result.fallback || null,
    };
  }

  buildInvalidLookupResult(rawEan) {
    const validation = validateEAN(rawEan);

    return {
      input_ean: String(rawEan || "").trim(),
      ean: validation.ean,
      status: "invalid_ean",
      enriched: false,
      requiresApproval: false,
      approvalReason: validation.reason,
      fontes_consultadas: {},
      item: null,
      product: null,
      error: validation.reason,
      fallback: {
        code: "INVALID_EAN",
        message: "O valor enviado nao passou na validacao de EAN.",
        next_action: "corrigir_ean_e_tentar_novamente",
        attempted_sources: [],
      },
    };
  }

  buildNotFoundFallback({ ean, fontesConsultadas = {} }) {
    return {
      code: "LOOKUP_NOT_FOUND",
      message: `Nenhum dado foi encontrado para o EAN ${ean} em nenhum dos caminhos configurados.`,
      next_action: "validar_ean_ou_cadastrar_manual",
      attempted_sources: extractAttemptedSources(fontesConsultadas),
    };
  }

  buildErrorFallback({ ean, error }) {
    return {
      code: "LOOKUP_ERROR",
      message: `O lookup do EAN ${ean} falhou antes de concluir todas as consultas.`,
      next_action: "tentar_novamente",
      attempted_sources: [],
      details: error.message,
    };
  }

  async processBatchEntry(rawEan, session) {
    const validation = validateEAN(rawEan);

    if (!validation.isValid) {
      return this.buildInvalidLookupResult(rawEan);
    }

    try {
      const result = await this.performQueuedLookup(validation.ean, session);
      return {
        input_ean: String(rawEan || "").trim(),
        ...result,
      };
    } catch (error) {
      return {
        input_ean: String(rawEan || "").trim(),
        ean: validation.ean,
        status: "error",
        enriched: false,
        requiresApproval: false,
        approvalReason: null,
        fontes_consultadas: {},
        item: null,
        product: null,
        error: error.message,
        fallback: this.buildErrorFallback({
          ean: validation.ean,
          error,
        }),
      };
    }
  }

  lookupByEan = async (req, res) => {
    const validation = validateEAN(req.params.ean || req.query.ean || "");

    if (!validation.isValid) {
      return res.status(400).json({
        error: validation.reason,
        details: { ean: validation.ean },
        fallback: this.buildInvalidLookupResult(validation.ean).fallback,
      });
    }

    const result = await this.performQueuedLookup(validation.ean);

    if (result.status === "not_found") {
      return res.status(404).json(this.formatSingleResponse(result));
    }

    return res.status(200).json(this.formatSingleResponse(result));
  };

  lookupByEans = async (req, res) => {
    const eans = parseLookupBatchInput(req.body?.eans);

    if (!eans.length) {
      return res.status(400).json({
        error: "Envie de 1 a 10 EANs em req.body.eans.",
        details: {
          max_items: this.maxBatchItems,
        },
      });
    }

    if (eans.length > this.maxBatchItems) {
      return res.status(400).json({
        error: `O endpoint aceita no maximo ${this.maxBatchItems} EANs por requisicao.`,
        details: {
          received: eans.length,
          max_items: this.maxBatchItems,
        },
      });
    }

    const session = this.enrichmentService.createSession();
    const results = await Promise.all(
      eans.map((ean) => this.processBatchEntry(ean, session)),
    );

    return res.status(200).json({
      requested: eans.length,
      max_items: this.maxBatchItems,
      max_parallel: this.queueService.maxConcurrent || null,
      summary: buildBatchSummary(results),
      results,
    });
  };
}

export { LookupController };
