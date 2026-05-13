import { validateEAN } from "../utils/validateEAN.js";
import { ProductService } from "./product.service.js";
import { BancoUnicoService } from "./banco-unico.service.js";
import { EnrichmentService } from "./enrichment.service.js";
import { ImportacaoRepository } from "../repositories/importacao.repository.js";
import { importQueueService } from "./import-queue.service.js";
import { logger } from "../utils/logger.js";
import env from "../config/env.js";
import { createDefaultImportProviderRegistry } from "../providers/default-registries.js";
class ImportService {
  constructor({
    importacaoRepository,
    productService,
    bancoUnicoService,
    enrichmentService,
    importProviderRegistry,
  } = {}) {
    this.importacaoRepository = importacaoRepository || new ImportacaoRepository();
    this.productService = productService || new ProductService();
    this.bancoUnicoService = bancoUnicoService || new BancoUnicoService();
    this.enrichmentService = enrichmentService || new EnrichmentService();
    this.importProviderRegistry = importProviderRegistry || createDefaultImportProviderRegistry();
  }

  buildApiErrorDetails(error) {
    if (!error) {
      return null;
    }

    return {
      message: error.message,
      status: error.status || error.response?.status || null,
      details: error.details || error.response?.data || null,
    };
  }

  isVtexItem(item) {
    return String(item?.fonte || item?.dados_brutos?.origem_dados || "").toLowerCase() === "vtex";
  }

  async storeVtexFallback({
    importacaoId,
    importItem,
    item,
    ean,
    statusProcessamento,
    enrichedItem = null,
    productPayload = null,
    fontesConsultadas = null,
  }) {
    if (!this.isVtexItem(item)) {
      return null;
    }

    return this.importacaoRepository.createProdutoFallbackVtex({
      importacao_id: importacaoId,
      item_importacao_id: importItem.id,
      ean: String(ean || item?.ean || ""),
      nome_recebido: enrichedItem?.nome_recebido || item?.nome_recebido || importItem?.nome_recebido || null,
      status_processamento: statusProcessamento,
      payload_origem: item?.dados_brutos || item,
      payload_enriquecido: enrichedItem?.dados_brutos || enrichedItem || null,
      produto_payload: productPayload,
      fontes_consultadas: fontesConsultadas,
    });
  }

  async enqueueItems({ fonte, items, productApi }) {
    const importacao = await this.createImportacao({ fonte, items });

    importQueueService.enqueue({
      importacaoId: importacao.id,
      handler: () => this.processItems({ importacaoId: importacao.id, fonte, items, productApi }),
    });

    return importacao;
  }

  async runItemsNow({ fonte, items, productApi }) {
    const importacao = await this.createImportacao({ fonte, items });
    await this.processItems({ importacaoId: importacao.id, fonte, items, productApi });
    return this.getImportacao(importacao.id);
  }

  async enqueueTrierImport({ baseUrl, bearerToken, filters = {}, productApi }) {
    return this.enqueueProviderImport({
      sourceName: "trier",
      credentials: { baseUrl, bearerToken },
      filters,
      productApi,
    });
  }

  async enqueueVetorImport({ baseUrl, apiKey, filters = {}, productApi }) {
    return this.enqueueProviderImport({
      sourceName: "vetor",
      credentials: { baseUrl, apiKey },
      filters,
      productApi,
    });
  }

  async enqueuePostgresEmbalagensImport({ db = {}, filters = {}, productApi }) {
    return this.enqueueProviderImport({
      sourceName: "postgres-embalagens",
      credentials: db,
      filters,
      productApi,
    });
  }

  async enqueueVtexImport({ accountName, appKey, appToken, filters = {}, productApi }) {
    return this.enqueueProviderImport({
      sourceName: "vtex",
      credentials: {
        accountName,
        appKey,
        appToken,
      },
      filters,
      productApi,
    });
  }

  async enqueueProviderImport({ sourceName, credentials = {}, filters = {}, productApi }) {
    const provider = this.importProviderRegistry.get(sourceName);
    const normalizedFilters = provider.normalizeFilters(filters);

    const importacao = await this.importacaoRepository.createImportacao({
      fonte: sourceName,
      status: "pending",
      total_itens: 0,
    });

    logger.info(`Importacao ${sourceName} criada e aguardando processamento`, {
      importacao_id: importacao.id,
      filtros: provider.describePendingFilters(normalizedFilters),
    });

    importQueueService.enqueue({
      importacaoId: importacao.id,
      handler: () => this.processProviderImport({
        importacaoId: importacao.id,
        sourceName,
        credentials,
        filters: normalizedFilters,
        productApi,
      }),
    });

    return importacao;
  }

  async createImportacao({ fonte, items }) {
    const importacao = await this.importacaoRepository.createImportacao({
      fonte,
      status: "pending",
      total_itens: items.length,
    });

    logger.info("Importacao criada e aguardando processamento", {
      importacao_id: importacao.id,
      fonte,
      total_itens: items.length,
    });

    return importacao;
  }

  async processItems({ importacaoId, fonte, items, productApi }) {
    const enrichmentSession = this.enrichmentService.createSession();

    await this.importacaoRepository.updateImportacao(importacaoId, {
      status: "processing",
      total_itens: items.length,
    });

    logger.info("Processamento da importacao iniciado", {
      importacao_id: importacaoId,
      fonte,
      total_itens: items.length,
      item_concurrency: this.getItemConcurrency(items.length),
    });

    try {
      await this.processBatchItems(importacaoId, items, enrichmentSession, productApi);

      return this.finalizeImportacao(importacaoId, items.length);
    } catch (error) {
      await this.importacaoRepository.updateImportacao(importacaoId, {
        status: "failed",
        finished_at: new Date(),
      });

      logger.error("Falha geral da importacao", {
        importacao_id: importacaoId,
        fonte,
        error: error.message,
      });

      throw error;
    }
  }

  async processBatchItems(importacaoId, items, enrichmentSession = null, productApi = null) {
    const concurrency = this.getItemConcurrency(items.length);
    let nextIndex = 0;

    const worker = async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;

        if (index >= items.length) {
          return;
        }

        const item = items[index];

        logger.info("Processando item", {
          importacao_id: importacaoId,
          item_index: index,
          ean_recebido: item.ean,
        });

        const status = await this.processSingleItem(importacaoId, item, enrichmentSession, productApi);
        await this.incrementImportCounters(importacaoId, status);
      }
    };

    await Promise.all(
      Array.from({ length: concurrency }, () => worker()),
    );
  }

  async processTrierImport({ importacaoId, baseUrl, bearerToken, filters, productApi }) {
    return this.processProviderImport({
      importacaoId,
      sourceName: "trier",
      credentials: { baseUrl, bearerToken },
      filters,
      productApi,
    });
  }

  async processVetorImport({ importacaoId, baseUrl, apiKey, filters, productApi }) {
    return this.processProviderImport({
      importacaoId,
      sourceName: "vetor",
      credentials: { baseUrl, apiKey },
      filters,
      productApi,
    });
  }

  async processProviderImport({ importacaoId, sourceName, credentials = {}, filters = {}, productApi }) {
    const provider = this.importProviderRegistry.get(sourceName);
    const enrichmentSession = this.enrichmentService.createSession();
    const normalizedFilters = provider.normalizeFilters(filters);
    let state = provider.getInitialState(normalizedFilters);
    let totalItens = 0;
    let page = 0;

    await this.importacaoRepository.updateImportacao(importacaoId, {
      status: "processing",
      total_itens: 0,
    });

    logger.info(`Processamento da importacao ${sourceName} iniciado`, {
      importacao_id: importacaoId,
      ...provider.describeProcessingStart(state, normalizedFilters),
      item_concurrency: this.getItemConcurrency(this.extractBatchSizeHint(state)),
    });

    try {
      while (true) {
        page += 1;

        logger.info(`Buscando pagina de produtos na ${sourceName}`, {
          importacao_id: importacaoId,
          pagina: page,
          ...provider.describePageRequest(state, normalizedFilters),
        });

        const result = await provider.fetchPage(state, normalizedFilters, credentials);

        logger.info(`Pagina retornada pela ${sourceName}`, {
          importacao_id: importacaoId,
          pagina: page,
          endpoint: result.endpoint,
          quantidade_itens: result.items.length,
          total: result.total,
        });

        totalItens += result.items.length;

        await this.importacaoRepository.updateImportacao(importacaoId, {
          total_itens: result.total || totalItens,
        });

        if (!result.items.length) {
          break;
        }

        await this.processBatchItems(importacaoId, result.items, enrichmentSession, productApi);

        if (!result.hasMore) {
          break;
        }

        state = result.nextState;
      }

      return this.finalizeImportacao(importacaoId, totalItens);
    } catch (error) {
      await this.importacaoRepository.updateImportacao(importacaoId, {
        status: "failed",
        finished_at: new Date(),
      });

      logger.error(`Falha geral da importacao ${sourceName}`, {
        importacao_id: importacaoId,
        error: error.message,
      });

      throw error;
    }
  }

  async processSingleItem(importacaoId, item, enrichmentSession = null, productApi = null) {
    const importItem = await this.importacaoRepository.createItem({
      importacao_id: importacaoId,
      ean: String(item.ean || ""),
      nome_recebido: item.nome_recebido || null,
      dados_brutos: item.dados_brutos || item,
      status: "processing",
    });

    try {
      const validation = validateEAN(item.ean);

      if (!validation.isValid) {
        await this.importacaoRepository.updateItem(importItem.id, {
          status: "failed",
          mensagem_erro: validation.reason,
        });
        return "failed";
      }

      logger.info("Iniciando enriquecimento externo", {
        importacao_id: importacaoId,
        item_id: importItem.id,
        ean: validation.ean,
      });

      const enriched = await this.enrichmentService.enrichImportedItem({
        ...item,
        ean: validation.ean,
      }, enrichmentSession);

      logger.info("Enriquecimento concluido", {
        importacao_id: importacaoId,
        item_id: importItem.id,
        ean: validation.ean,
        enriched: enriched.enriched,
        requires_approval: Boolean(enriched.requiresApproval),
        fontes_consultadas: enriched.fontes_consultadas,
      });

      if (enriched.requiresApproval) {
        await this.storeVtexFallback({
          importacaoId,
          importItem,
          item,
          ean: validation.ean,
          statusProcessamento: "review",
          enrichedItem: enriched.item,
          fontesConsultadas: {
            source: item.fonte || "importacao",
            approval_required: true,
            ...enriched.fontes_consultadas,
          },
        });

        await this.importacaoRepository.createProdutoAprovacao({
          importacao_id: importacaoId,
          item_importacao_id: importItem.id,
          ean: validation.ean,
          nome_sugerido: item.nome_recebido || null,
          motivo: enriched.approvalReason || "Item sem nome validado por PT.ProductSearch ou FarmaIndex.",
          fonte_origem: item.fonte || "importacao",
          dados_brutos: enriched.item.dados_brutos || enriched.item,
        });

        await this.importacaoRepository.updateItem(importItem.id, {
          status: "review",
          nome_recebido: enriched.item.nome_recebido || importItem.nome_recebido,
          mensagem_erro: enriched.approvalReason || null,
          fontes_consultadas: {
            source: item.fonte || "importacao",
            approval_required: true,
            ...enriched.fontes_consultadas,
          },
        });

        return "review";
      }

      const productPayload = this.productService.buildSnapshot(enriched.item);

      await this.storeVtexFallback({
        importacaoId,
        importItem,
        item,
        ean: validation.ean,
        statusProcessamento: "enriched",
        enrichedItem: enriched.item,
        productPayload,
        fontesConsultadas: {
          source: item.fonte || "importacao",
          ...enriched.fontes_consultadas,
        },
      });

      try {
        const result = await this.bancoUnicoService.publishProduct(productPayload, productApi || {});

        await this.importacaoRepository.updateItem(importItem.id, {
          status: "enriched",
          nome_recebido: enriched.item.nome_recebido || importItem.nome_recebido,
          fontes_consultadas: {
            source: item.fonte || "importacao",
            action: "published",
            destination: "banco_unico_api",
            api_response: result,
            ...enriched.fontes_consultadas,
          },
        });

        return "enriched";
      } catch (publishError) {
        const apiError = this.buildApiErrorDetails(publishError);

        await this.importacaoRepository.createProdutoFallbackApi({
          importacao_id: importacaoId,
          item_importacao_id: importItem.id,
          ean: validation.ean,
          payload: productPayload,
          api_config: productApi || {},
          motivo_falha: publishError.message,
          resposta_erro: apiError,
          status: "pending_replay",
        });

        await this.importacaoRepository.updateItem(importItem.id, {
          status: "enriched",
          nome_recebido: enriched.item.nome_recebido || importItem.nome_recebido,
          mensagem_erro: `Fallback Postgres acionado apos falha na API: ${publishError.message}`,
          fontes_consultadas: {
            source: item.fonte || "importacao",
            action: "stored_fallback",
            destination: "postgres_fallback_api",
            api_error: apiError,
            ...enriched.fontes_consultadas,
          },
        });

        logger.error("Falha ao publicar na Banco Unico API; produto salvo em fallback no Postgres", {
          importacao_id: importacaoId,
          item_id: importItem.id,
          ean: validation.ean,
          error: publishError.message,
          fallback: "produtos_fallback_api",
        });

        return "enriched";
      }
    } catch (error) {
      await this.importacaoRepository.updateItem(importItem.id, {
        status: "failed",
        mensagem_erro: error.message,
      });

      logger.error("Falha no processamento do item", {
        importacao_id: importacaoId,
        item_id: importItem.id,
        ean_recebido: item.ean,
        error: error.message,
      });

      return "failed";
    }
  }

  async incrementImportCounters(importacaoId, status) {
    await this.importacaoRepository.incrementImportacaoCounters(importacaoId, {
      itens_processados: 1,
      itens_sucesso: status === "enriched" ? 1 : 0,
      itens_falha: status === "failed" ? 1 : 0,
      itens_revisao: status === "review" ? 1 : 0,
    });
  }

  async finalizeImportacao(importacaoId, totalItens) {
    const current = await this.importacaoRepository.findImportacaoById(importacaoId);
    const allFailed = totalItens > 0 && current && current.itens_falha === totalItens;

    const updated = await this.importacaoRepository.updateImportacao(importacaoId, {
      status: allFailed ? "failed" : "completed",
      finished_at: new Date(),
    });

    logger.info("Processamento da importacao finalizado", {
      importacao_id: importacaoId,
      status: updated.status,
      itens_processados: updated.itens_processados,
      itens_sucesso: updated.itens_sucesso,
      itens_falha: updated.itens_falha,
      itens_revisao: updated.itens_revisao,
    });

    return updated;
  }

  getImportacao(id) {
    return this.importacaoRepository.findImportacaoById(id);
  }

  getItemConcurrency(batchSize = 0) {
    const configured = Number(env.importItemConcurrency || 1);
    const normalized = Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 1;

    if (!batchSize || batchSize < 1) {
      return normalized;
    }

    return Math.min(normalized, batchSize);
  }

  extractBatchSizeHint(state = {}) {
    if (Number.isInteger(state.quantidadeRegistros) && state.quantidadeRegistros > 0) {
      return state.quantidadeRegistros;
    }

    if (Number.isInteger(state.top) && state.top > 0) {
      return state.top;
    }

    return 0;
  }
}

export { ImportService };
