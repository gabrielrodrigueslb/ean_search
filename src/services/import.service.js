const { validateEAN } = require("../utils/validateEAN");
const { ProductService } = require("./product.service");
const { EnrichmentService } = require("./enrichment.service");
const { TrierService } = require("./trier.service");
const { VetorService } = require("./vetor.service");
const { ImportacaoRepository } = require("../repositories/importacao.repository");
const { importQueueService } = require("./import-queue.service");
const { TrierImportAdapter } = require("../adapters/trier-import.adapter");
const { VetorImportAdapter } = require("../adapters/vetor-import.adapter");
const { logger } = require("../utils/logger");

class ImportService {
  constructor() {
    this.importacaoRepository = new ImportacaoRepository();
    this.productService = new ProductService();
    this.enrichmentService = new EnrichmentService();
    this.trierService = new TrierService();
    this.vetorService = new VetorService();
    this.trierImportAdapter = new TrierImportAdapter();
    this.vetorImportAdapter = new VetorImportAdapter();
  }

  async enqueueItems({ fonte, items }) {
    const importacao = await this.createImportacao({ fonte, items });

    importQueueService.enqueue({
      importacaoId: importacao.id,
      handler: () => this.processItems({ importacaoId: importacao.id, fonte, items }),
    });

    return importacao;
  }

  async runItemsNow({ fonte, items }) {
    const importacao = await this.createImportacao({ fonte, items });
    await this.processItems({ importacaoId: importacao.id, fonte, items });
    return this.getImportacao(importacao.id);
  }

  async enqueueTrierImport({ baseUrl, bearerToken, filters = {} }) {
    const pageSize = this.trierService.normalizePageSize(filters.quantidadeRegistros, 999);

    const importacao = await this.importacaoRepository.createImportacao({
      fonte: "trier",
      status: "pending",
      total_itens: 0,
    });

    logger.info("Importacao Trier criada e aguardando processamento", {
      importacao_id: importacao.id,
      filtros: {
        codigo: filters.codigo || null,
        codigoBarras: filters.codigoBarras || null,
        nomeProduto: filters.nomeProduto || null,
        primeiroRegistro: filters.primeiroRegistro || 0,
        quantidadeRegistros: pageSize,
        ativo: filters.ativo ?? null,
        integracaoEcommerce: filters.integracaoEcommerce ?? null,
        processaCustoMedio: filters.processaCustoMedio ?? false,
      },
    });

    importQueueService.enqueue({
      importacaoId: importacao.id,
      handler: () => this.processTrierImport({
        importacaoId: importacao.id,
        baseUrl,
        bearerToken,
        filters: {
          ...filters,
          quantidadeRegistros: pageSize,
        },
      }),
    });

    return importacao;
  }

  async enqueueVetorImport({ baseUrl, apiKey, filters = {} }) {
    const pageSize = this.vetorService.normalizePageSize(filters.top, 100);

    const importacao = await this.importacaoRepository.createImportacao({
      fonte: "vetor",
      status: "pending",
      total_itens: 0,
    });

    logger.info("Importacao Vetor criada e aguardando processamento", {
      importacao_id: importacao.id,
      filtros: {
        filter: filters.filter || null,
        select: filters.select || "default",
        orderby: filters.orderby || null,
        skip: filters.skip || 0,
        top: pageSize,
        count: filters.count ?? false,
      },
    });

    importQueueService.enqueue({
      importacaoId: importacao.id,
      handler: () => this.processVetorImport({
        importacaoId: importacao.id,
        baseUrl,
        apiKey,
        filters: {
          ...filters,
          top: pageSize,
        },
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

  async processItems({ importacaoId, fonte, items }) {
    const enrichmentSession = this.enrichmentService.createSession();

    await this.importacaoRepository.updateImportacao(importacaoId, {
      status: "processing",
      total_itens: items.length,
    });

    logger.info("Processamento da importacao iniciado", {
      importacao_id: importacaoId,
      fonte,
      total_itens: items.length,
    });

    try {
      await this.processBatchItems(importacaoId, items, enrichmentSession);

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

  async processBatchItems(importacaoId, items, enrichmentSession = null) {
    for (const [index, item] of items.entries()) {
      logger.info("Processando item", {
        importacao_id: importacaoId,
        item_index: index,
        ean_recebido: item.ean,
      });

      const status = await this.processSingleItem(importacaoId, item, enrichmentSession);
      await this.incrementImportCounters(importacaoId, status);
    }
  }

  async processTrierImport({ importacaoId, baseUrl, bearerToken, filters }) {
    const enrichmentSession = this.enrichmentService.createSession();
    const pageSize = this.trierService.normalizePageSize(filters.quantidadeRegistros, 999);
    let primeiroRegistro = Number.parseInt(filters.primeiroRegistro, 10) || 0;
    let totalItens = 0;
    let page = 0;

    await this.importacaoRepository.updateImportacao(importacaoId, {
      status: "processing",
      total_itens: 0,
    });

    logger.info("Processamento da importacao Trier iniciado", {
      importacao_id: importacaoId,
      quantidade_registros: pageSize,
      primeiro_registro: primeiroRegistro,
    });

    try {
      while (true) {
        page += 1;

        logger.info("Buscando pagina de produtos na Trier", {
          importacao_id: importacaoId,
          pagina: page,
          primeiro_registro: primeiroRegistro,
          quantidade_registros: pageSize,
          ativo: filters.ativo ?? null,
          integracao_ecommerce: filters.integracaoEcommerce ?? null,
          processa_custo_medio: filters.processaCustoMedio ?? false,
        });

        const result = await this.trierService.buscarProdutos({
          ...filters,
          primeiroRegistro,
          quantidadeRegistros: pageSize,
        }, {
          baseUrl,
          bearerToken,
        });

        logger.info("Pagina retornada pela Trier", {
          importacao_id: importacaoId,
          pagina: page,
          endpoint: result.endpoint,
          quantidade_itens: Array.isArray(result.items) ? result.items.length : 0,
        });

        const batch = this.trierImportAdapter.normalizeBatch(result.items || []);
        totalItens += batch.length;

        await this.importacaoRepository.updateImportacao(importacaoId, {
          total_itens: totalItens,
        });

        if (!batch.length) {
          break;
        }

        await this.processBatchItems(importacaoId, batch, enrichmentSession);

        if (batch.length < pageSize) {
          break;
        }

        primeiroRegistro += batch.length;
      }

      return this.finalizeImportacao(importacaoId, totalItens);
    } catch (error) {
      await this.importacaoRepository.updateImportacao(importacaoId, {
        status: "failed",
        finished_at: new Date(),
      });

      logger.error("Falha geral da importacao Trier", {
        importacao_id: importacaoId,
        error: error.message,
      });

      throw error;
    }
  }

  async processVetorImport({ importacaoId, baseUrl, apiKey, filters }) {
    const enrichmentSession = this.enrichmentService.createSession();
    const pageSize = this.vetorService.normalizePageSize(filters.top, 500);
    let skip = this.vetorService.normalizeSkip(filters.skip);
    let totalItens = 0;
    let page = 0;

    await this.importacaoRepository.updateImportacao(importacaoId, {
      status: "processing",
      total_itens: 0,
    });

    logger.info("Processamento da importacao Vetor iniciado", {
      importacao_id: importacaoId,
      top: pageSize,
      skip,
      filter: filters.filter || null,
    });

    try {
      while (true) {
        page += 1;

        logger.info("Buscando pagina de produtos na Vetor", {
          importacao_id: importacaoId,
          pagina: page,
          skip,
          top: pageSize,
          filter: filters.filter || null,
        });

        const result = await this.vetorService.buscarProdutos({
          ...filters,
          skip,
          top: pageSize,
        }, {
          baseUrl,
          apiKey,
        });

        logger.info("Pagina retornada pela Vetor", {
          importacao_id: importacaoId,
          pagina: page,
          endpoint: result.endpoint,
          quantidade_itens: Array.isArray(result.items) ? result.items.length : 0,
          total: result.total,
        });

        const batch = this.vetorImportAdapter.normalizeBatch(result.items || []);
        totalItens += batch.length;

        await this.importacaoRepository.updateImportacao(importacaoId, {
          total_itens: result.total || totalItens,
        });

        if (!batch.length) {
          break;
        }

        await this.processBatchItems(importacaoId, batch, enrichmentSession);

        if (batch.length < pageSize) {
          break;
        }

        skip += batch.length;
      }

      return this.finalizeImportacao(importacaoId, totalItens);
    } catch (error) {
      await this.importacaoRepository.updateImportacao(importacaoId, {
        status: "failed",
        finished_at: new Date(),
      });

      logger.error("Falha geral da importacao Vetor", {
        importacao_id: importacaoId,
        error: error.message,
      });

      throw error;
    }
  }

  async processSingleItem(importacaoId, item, enrichmentSession = null) {
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

      const result = await this.productService.upsertImportedItem(enriched.item);

      await this.importacaoRepository.updateItem(importItem.id, {
        status: "enriched",
        nome_recebido: enriched.item.nome_recebido || importItem.nome_recebido,
        fontes_consultadas: {
          source: item.fonte || "importacao",
          action: result.action,
          ...enriched.fontes_consultadas,
        },
      });

      return "enriched";
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
}

module.exports = { ImportService };
