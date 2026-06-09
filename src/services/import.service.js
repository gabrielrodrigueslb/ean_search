import { validateEAN } from "../utils/validateEAN.js";
import { ProductService } from "./product.service.js";
import { BancoUnicoService } from "./banco-unico.service.js";
import { EnrichmentService } from "./enrichment.service.js";
import { ImportacaoRepository } from "../repositories/importacao.repository.js";
import { importQueueService } from "./import-queue.service.js";
import { logger } from "../utils/logger.js";
import env from "../config/env.js";
import { createDefaultImportProviderRegistry } from "../providers/default-registries.js";
import { MercadologicalClassificationService } from "./mercadological-classification.service.js";
import { hasLookupSourceErrors } from "../utils/enrichmentSourceStatus.js";
import { formatSourceList } from "../utils/productSourcePolicy.js";
class ImportService {
  constructor({
    importacaoRepository,
    productService,
    bancoUnicoService,
    enrichmentService,
    importProviderRegistry,
    mercadologicalClassificationService,
  } = {}) {
    this.importacaoRepository = importacaoRepository || new ImportacaoRepository();
    this.productService = productService || new ProductService();
    this.bancoUnicoService = bancoUnicoService || new BancoUnicoService();
    this.enrichmentService = enrichmentService || new EnrichmentService();
    this.importProviderRegistry = importProviderRegistry || createDefaultImportProviderRegistry();
    this.mercadologicalClassificationService =
      mercadologicalClassificationService || new MercadologicalClassificationService();
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

  chunk(items = [], batchSize = 100) {
    const batches = [];

    for (let index = 0; index < items.length; index += batchSize) {
      batches.push(items.slice(index, index + batchSize));
    }

    return batches;
  }

  summarizeEans(items = [], limit = 10) {
    return items
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .slice(0, limit);
  }

  sleep(ms = 50) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
    const streamState = {
      pendingEntries: [],
      eligibleEntries: [],
      publishQueue: [],
      producerFinished: false,
      triageFinished: false,
      enrichmentFinished: false,
      consumerError: null,
      seenEans: new Set(),
      stagedTotal: 0,
      triage: {
        invalidos: 0,
        duplicadosNoLote: 0,
        existentesNoBancoUnico: 0,
        elegiveisProcessamento: 0,
      },
    };
    const stagingBatchSize = Math.max(4, env.importProviderTriageBatchSize);

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

    const triagePromise = this.consumeProviderEntryStream({
      importacaoId,
      sourceName: fonte,
      streamState,
      productApi,
    });
    const enrichmentPromise = this.processEligibleEntryStream({
      importacaoId,
      sourceName: fonte,
      streamState,
      enrichmentSession,
      productApi,
    });
    const publishPromise = this.processPublishQueueStream({
      importacaoId,
      sourceName: fonte,
      streamState,
      productApi,
    });

    try {
      for (const stagedItems of this.chunk(items, stagingBatchSize)) {
        if (streamState.consumerError) {
          throw streamState.consumerError;
        }

        const stagedBatch = await this.stageProviderItems(importacaoId, stagedItems);
        streamState.pendingEntries.push(...stagedBatch);
        streamState.stagedTotal += stagedBatch.length;

        logger.info(`Lote armazenado em staging para ${fonte}`, {
          importacao_id: importacaoId,
          staged_itens_lote: stagedBatch.length,
          staged_itens_total: streamState.stagedTotal,
          itens_aguardando_consumidor: streamState.pendingEntries.length,
          sample_eans: this.summarizeEans(stagedBatch.map((entry) => entry.item?.ean)),
        });
      }

      streamState.producerFinished = true;
      await triagePromise;
      await enrichmentPromise;
      await publishPromise;

      return this.finalizeImportacao(importacaoId, items.length);
    } catch (error) {
      streamState.producerFinished = true;
      streamState.triageFinished = true;
      streamState.enrichmentFinished = true;

      try {
        await triagePromise;
        await enrichmentPromise;
        await publishPromise;
      } catch (consumerError) {
        if (!streamState.consumerError) {
          streamState.consumerError = consumerError;
        }
      }

      await this.importacaoRepository.updateImportacao(importacaoId, {
        status: "failed",
        finished_at: new Date(),
      });

      logger.error("Falha geral da importacao", {
        importacao_id: importacaoId,
        fonte,
        error: streamState.consumerError?.message || error.message,
      });

      throw streamState.consumerError || error;
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
    const streamState = {
      pendingEntries: [],
      eligibleEntries: [],
      publishQueue: [],
      producerFinished: false,
      triageFinished: false,
      enrichmentFinished: false,
      consumerError: null,
      seenEans: new Set(),
      stagedTotal: 0,
      triage: {
        invalidos: 0,
        duplicadosNoLote: 0,
        existentesNoBancoUnico: 0,
        elegiveisProcessamento: 0,
      },
    };
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

    const triagePromise = this.consumeProviderEntryStream({
      importacaoId,
      sourceName,
      streamState,
      productApi,
    });
    const enrichmentPromise = this.processEligibleEntryStream({
      importacaoId,
      sourceName,
      streamState,
      enrichmentSession,
      productApi,
    });
    const publishPromise = this.processPublishQueueStream({
      importacaoId,
      sourceName,
      streamState,
      productApi,
    });

    try {
      while (true) {
        if (streamState.consumerError) {
          throw streamState.consumerError;
        }

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
          total_itens: totalItens,
        });

        if (!result.items.length) {
          break;
        }
        const stagedBatch = await this.stageProviderItems(importacaoId, result.items);
        streamState.pendingEntries.push(...stagedBatch);
        streamState.stagedTotal += stagedBatch.length;

        logger.info(`Pagina armazenada em staging para ${sourceName}`, {
          importacao_id: importacaoId,
          pagina: page,
          staged_itens_pagina: stagedBatch.length,
          staged_itens_total: streamState.stagedTotal,
          itens_aguardando_consumidor: streamState.pendingEntries.length,
          sample_eans: this.summarizeEans(stagedBatch.map((entry) => entry.item?.ean)),
        });

        if (!result.hasMore) {
          break;
        }

        state = result.nextState;
      }

      streamState.producerFinished = true;
      await triagePromise;
      await enrichmentPromise;
      await publishPromise;

      return this.finalizeImportacao(importacaoId, totalItens);
    } catch (error) {
      streamState.producerFinished = true;
      streamState.triageFinished = true;
      streamState.enrichmentFinished = true;

      try {
        await triagePromise;
        await enrichmentPromise;
        await publishPromise;
      } catch (consumerError) {
        if (!streamState.consumerError) {
          streamState.consumerError = consumerError;
        }
      }

      await this.importacaoRepository.updateImportacao(importacaoId, {
        status: "failed",
        finished_at: new Date(),
      });

      logger.error(`Falha geral da importacao ${sourceName}`, {
        importacao_id: importacaoId,
        error: streamState.consumerError?.message || error.message,
      });

      throw streamState.consumerError || error;
    }
  }

  async stageProviderItems(importacaoId, items = []) {
    const stagedEntries = new Array(items.length);
    const concurrency = Math.min(
      items.length || 1,
      Math.max(1, Math.min(24, this.getItemConcurrency(items.length) * 4)),
    );
    let nextIndex = 0;

    const worker = async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;

        if (index >= items.length) {
          return;
        }

        const item = items[index];
        const importItem = await this.importacaoRepository.createItem({
          importacao_id: importacaoId,
          ean: String(item.ean || ""),
          nome_recebido: item.nome_recebido || null,
          dados_brutos: item.dados_brutos || item,
          status: "pending",
        });

        stagedEntries[index] = {
          item,
          importItem,
        };
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    return stagedEntries.filter(Boolean);
  }

  async consumeProviderEntryStream({
    importacaoId,
    sourceName,
    streamState,
    productApi,
  }) {
    const batchSize = Math.max(4, env.importProviderTriageBatchSize);

    logger.info(`Consumidor da importacao ${sourceName} iniciado`, {
      importacao_id: importacaoId,
      batch_size_triagem: batchSize,
    });

    while (true) {
      if (!streamState.pendingEntries.length) {
        if (streamState.producerFinished) {
          break;
        }

        await this.sleep(75);
        continue;
      }

      const stagedBatch = streamState.pendingEntries.splice(0, batchSize);

      logger.info(`Consumidor retirou lote do staging de ${sourceName}`, {
        importacao_id: importacaoId,
        staged_itens_lote: stagedBatch.length,
        staged_itens_restantes: streamState.pendingEntries.length,
        sample_eans: this.summarizeEans(stagedBatch.map((entry) => entry.item?.ean)),
      });

      try {
        const triageResult = await this.triageStagedProviderEntries({
          importacaoId,
          stagedEntries: stagedBatch,
          productApi,
          sharedSeenEans: streamState.seenEans,
          streamStats: streamState.triage,
        });

        if (triageResult.entriesToProcess.length) {
          streamState.eligibleEntries.push(...triageResult.entriesToProcess);

          logger.info(`Lote elegivel encaminhado para enriquecimento de ${sourceName}`, {
            importacao_id: importacaoId,
            itens_encaminhados: triageResult.entriesToProcess.length,
            fila_enriquecimento: streamState.eligibleEntries.length,
            sample_eans: this.summarizeEans(
              triageResult.entriesToProcess.map((entry) => entry.normalizedEan || entry.item?.ean),
            ),
          });
        }
      } catch (error) {
        streamState.consumerError = error;
        throw error;
      }
    }

    streamState.triageFinished = true;

    logger.info(`Consumidor da importacao ${sourceName} finalizado`, {
      importacao_id: importacaoId,
      staged_total: streamState.stagedTotal,
      invalidos: streamState.triage.invalidos,
      duplicados_no_lote: streamState.triage.duplicadosNoLote,
      existentes_no_banco_unico: streamState.triage.existentesNoBancoUnico,
      elegiveis_processamento: streamState.triage.elegiveisProcessamento,
    });
  }

  async processEligibleEntryStream({
    importacaoId,
    sourceName,
    streamState,
    enrichmentSession,
    productApi,
  }) {
    const concurrency = Math.max(1, this.getItemConcurrency(env.importItemConcurrency));

    logger.info(`Processador de enriquecimento da importacao ${sourceName} iniciado`, {
      importacao_id: importacaoId,
      workers_enriquecimento: concurrency,
    });

    const worker = async () => {
      while (true) {
        if (!streamState.eligibleEntries.length) {
          if (streamState.triageFinished) {
            return;
          }

          await this.sleep(75);
          continue;
        }

        const entry = streamState.eligibleEntries.shift();
        if (!entry) {
          continue;
        }

        const preparation = await this.prepareItemForPublish(
          importacaoId,
          entry.item,
          enrichmentSession,
          { importItem: entry.importItem },
        );

        if (preparation.status === "ready") {
          streamState.publishQueue.push(preparation);
          continue;
        }

        await this.incrementImportCounters(importacaoId, preparation.status);
      }
    };

    try {
      await Promise.all(Array.from({ length: concurrency }, () => worker()));
    } catch (error) {
      streamState.consumerError = error;
      throw error;
    }

    streamState.enrichmentFinished = true;

    logger.info(`Processador de enriquecimento da importacao ${sourceName} finalizado`, {
      importacao_id: importacaoId,
      fila_enriquecimento_restante: streamState.eligibleEntries.length,
      fila_publish_restante: streamState.publishQueue.length,
      workers_enriquecimento: concurrency,
    });
  }

  async processPublishQueueStream({
    importacaoId,
    sourceName,
    streamState,
    productApi,
  }) {
    const batchSize = Math.max(1, env.importPublishBatchSize);
    const flushMs = Math.max(50, env.importPublishFlushMs);
    let lastFlushAt = Date.now();

    logger.info(`Publicador em lote da importacao ${sourceName} iniciado`, {
      importacao_id: importacaoId,
      batch_size_publish: batchSize,
      flush_ms_publish: flushMs,
    });

    while (true) {
      const queueSize = streamState.publishQueue.length;
      const shouldFlushBySize = queueSize >= batchSize;
      const shouldFlushByTime = queueSize > 0 && (Date.now() - lastFlushAt) >= flushMs;
      const shouldFlushFinal = queueSize > 0 && streamState.enrichmentFinished;

      if (shouldFlushBySize || shouldFlushByTime || shouldFlushFinal) {
        const batch = streamState.publishQueue.splice(0, batchSize);
        lastFlushAt = Date.now();
        await this.publishPreparedEntriesBatch(importacaoId, batch, productApi);
        continue;
      }

      if (streamState.enrichmentFinished && queueSize === 0) {
        break;
      }

      await this.sleep(75);
    }

    logger.info(`Publicador em lote da importacao ${sourceName} finalizado`, {
      importacao_id: importacaoId,
      fila_publish_restante: streamState.publishQueue.length,
      batch_size_publish: batchSize,
    });
  }

  async processStagedProviderItems({
    importacaoId,
    stagedEntries,
    enrichmentSession,
    productApi,
    sharedSeenEans = null,
    streamStats = null,
  }) {
    const triageResult = await this.triageStagedProviderEntries({
      importacaoId,
      stagedEntries,
      productApi,
      sharedSeenEans,
      streamStats,
    });

    await this.processEligibleEntries({
      importacaoId,
      entriesToProcess: triageResult.entriesToProcess,
      enrichmentSession,
      productApi,
    });
  }

  async triageStagedProviderEntries({
    importacaoId,
    stagedEntries,
    productApi,
    sharedSeenEans = null,
    streamStats = null,
  }) {
    const seenEans = sharedSeenEans || new Set();
    const uniqueValidEntries = [];
    const entriesToProcess = [];
    let invalidCount = 0;
    let duplicateInProviderCount = 0;
    let existingInBancoCount = 0;

    for (const entry of stagedEntries) {
      const validation = validateEAN(entry.item?.ean);

      if (!validation.isValid) {
        invalidCount += 1;
        if (streamStats) {
          streamStats.invalidos += 1;
        }
        entriesToProcess.push(entry);
        continue;
      }

      entry.normalizedEan = validation.ean;

      if (seenEans.has(validation.ean)) {
        duplicateInProviderCount += 1;
        if (streamStats) {
          streamStats.duplicadosNoLote += 1;
        }
        await this.markEntryAsSkipped(entry, {
          message: `Produto descartado por EAN duplicado no lote do provedor: ${validation.ean}.`,
          fontesConsultadas: {
            source: entry.item?.fonte || "importacao",
            action: "skipped_duplicate_in_provider_batch",
            ean: validation.ean,
          },
        });
        continue;
      }

      seenEans.add(validation.ean);
      uniqueValidEntries.push(entry);
    }

    const existingEans = await this.lookupExistingBancoUnicoEans(
      uniqueValidEntries.map((entry) => entry.normalizedEan),
      productApi,
    );

    for (const entry of uniqueValidEntries) {
      if (existingEans.has(entry.normalizedEan)) {
        existingInBancoCount += 1;
        if (streamStats) {
          streamStats.existentesNoBancoUnico += 1;
        }
        await this.markEntryAsSkipped(entry, {
          message: `Produto descartado porque o EAN ${entry.normalizedEan} ja existe no Banco Unico.`,
          fontesConsultadas: {
            source: entry.item?.fonte || "importacao",
            action: "skipped_existing_in_banco_unico",
            ean: entry.normalizedEan,
          },
        });
        continue;
      }

      entriesToProcess.push(entry);
    }

    if (streamStats) {
      streamStats.elegiveisProcessamento += entriesToProcess.length;
    }

    logger.info("Resumo da triagem antes do enriquecimento", {
      importacao_id: importacaoId,
      staged_total: stagedEntries.length,
      validos_unicos: uniqueValidEntries.length,
      invalidos: invalidCount,
      duplicados_no_lote: duplicateInProviderCount,
      existentes_no_banco_unico: existingInBancoCount,
      elegiveis_enriquecimento: entriesToProcess.length,
      sample_eans_elegiveis: this.summarizeEans(
        entriesToProcess.map((entry) => entry.normalizedEan || entry.item?.ean),
      ),
      acumulado: streamStats ? {
        invalidos: streamStats.invalidos,
        duplicados_no_lote: streamStats.duplicadosNoLote,
        existentes_no_banco_unico: streamStats.existentesNoBancoUnico,
        elegiveis_processamento: streamStats.elegiveisProcessamento,
      } : null,
    });

    return {
      entriesToProcess,
      stats: {
        invalidCount,
        duplicateInProviderCount,
        existingInBancoCount,
      },
    };
  }

  async processEligibleEntries({
    importacaoId,
    entriesToProcess,
    enrichmentSession,
    productApi,
  }) {
    const concurrency = this.getItemConcurrency(entriesToProcess.length);
    let nextIndex = 0;

    const worker = async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;

        if (index >= entriesToProcess.length) {
          return;
        }

        const entry = entriesToProcess[index];
        const status = await this.processSingleItem(
          importacaoId,
          entry.item,
          enrichmentSession,
          productApi,
          { importItem: entry.importItem },
        );
        await this.incrementImportCounters(importacaoId, status);
      }
    };

    await Promise.all(
      Array.from({ length: Math.max(1, concurrency) }, () => worker()),
    );
  }

  async prepareItemForPublish(importacaoId, item, enrichmentSession = null, options = {}) {
    const importItem = options.importItem
      ? await this.importacaoRepository.updateItem(options.importItem.id, {
        status: "processing",
        nome_recebido: item.nome_recebido || options.importItem.nome_recebido || null,
        dados_brutos: item.dados_brutos || item,
      })
      : await this.importacaoRepository.createItem({
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
        return { status: "failed" };
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
          motivo: enriched.approvalReason || `Item sem nome validado por ${formatSourceList(env.lookupTrustedNameSources)}.`,
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

        return { status: "review" };
      }

      const disableAi = hasLookupSourceErrors(enriched.fontes_consultadas);
      const classifiedItem = await this.mercadologicalClassificationService.classifyItem(enriched.item, {
        disableAi,
        disableAiReason: disableAi
          ? "falha em uma ou mais fontes de enriquecimento"
          : null,
      });
      const productPayload = this.productService.buildSnapshot(classifiedItem);

      logger.info("Classificacao mercadologica concluida", {
        importacao_id: importacaoId,
        item_id: importItem.id,
        ean: validation.ean,
        classificacao_origem: classifiedItem?.dados_brutos?.classificacao_mercadologica?.source || null,
        departamento: productPayload.departamento || null,
        categoria: productPayload.categoria || null,
        subcategoria: productPayload.subcategoria || null,
        segmento: productPayload.segmento || null,
        subsegmento: productPayload.subsegmento || null,
      });

      await this.storeVtexFallback({
        importacaoId,
        importItem,
        item,
        ean: validation.ean,
        statusProcessamento: "enriched",
        enrichedItem: classifiedItem,
        productPayload,
        fontesConsultadas: {
          source: item.fonte || "importacao",
          ...enriched.fontes_consultadas,
        },
      });

      return {
        status: "ready",
        importacaoId,
        importItem,
        item,
        validation,
        enriched,
        classifiedItem,
        productPayload,
      };
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

      return { status: "failed" };
    }
  }

  async publishPreparedEntriesBatch(
    importacaoId,
    preparedEntries = [],
    productApi = null,
    options = {},
  ) {
    if (!preparedEntries.length) {
      return;
    }

    const shouldIncrementCounters = options.incrementCounters !== false;

    logger.info("Publicando lote de produtos no Banco Unico", {
      importacao_id: importacaoId,
      itens_no_lote: preparedEntries.length,
      sample_eans: this.summarizeEans(preparedEntries.map((entry) => entry.validation?.ean)),
    });

    try {
      const result = preparedEntries.length === 1
        ? await this.bancoUnicoService.publishProduct(preparedEntries[0].productPayload, productApi || {})
        : await this.bancoUnicoService.publishProducts(
          preparedEntries.map((entry) => entry.productPayload),
          productApi || {},
        );

      await Promise.all(preparedEntries.map(async (entry) => {
        logger.info("Produto publicado no Banco Unico com sucesso", {
          importacao_id: importacaoId,
          item_id: entry.importItem.id,
          ean: entry.validation.ean,
        });

        await this.importacaoRepository.updateItem(entry.importItem.id, {
          status: "enriched",
          nome_recebido: entry.enriched.item.nome_recebido || entry.importItem.nome_recebido,
          fontes_consultadas: {
            source: entry.item.fonte || "importacao",
            action: "published",
            destination: "banco_unico_api",
            api_response: result,
            ...entry.enriched.fontes_consultadas,
          },
        });

        if (shouldIncrementCounters) {
          await this.incrementImportCounters(importacaoId, "enriched");
        }
      }));

      return {
        status: "enriched",
        publishedCount: preparedEntries.length,
        fallbackCount: 0,
      };
    } catch (publishError) {
      const apiError = this.buildApiErrorDetails(publishError);

      await Promise.all(preparedEntries.map(async (entry) => {
        await this.importacaoRepository.createProdutoFallbackApi({
          importacao_id: importacaoId,
          item_importacao_id: entry.importItem.id,
          ean: entry.validation.ean,
          payload: entry.productPayload,
          api_config: productApi || {},
          motivo_falha: publishError.message,
          resposta_erro: apiError,
          status: "pending_replay",
        });

        await this.importacaoRepository.updateItem(entry.importItem.id, {
          status: "failed",
          nome_recebido: entry.enriched.item.nome_recebido || entry.importItem.nome_recebido,
          mensagem_erro: `Fallback Postgres acionado apos falha na API: ${publishError.message}`,
          fontes_consultadas: {
            source: entry.item.fonte || "importacao",
            action: "stored_fallback",
            destination: "postgres_fallback_api",
            publish_status: "pending_replay",
            api_error: apiError,
            ...entry.enriched.fontes_consultadas,
          },
        });

        logger.error("Falha ao publicar na Banco Unico API; produto salvo em fallback no Postgres", {
          importacao_id: importacaoId,
          item_id: entry.importItem.id,
          ean: entry.validation.ean,
          error: publishError.message,
          fallback: "produtos_fallback_api",
        });

        if (shouldIncrementCounters) {
          await this.incrementImportCounters(importacaoId, "failed");
        }
      }));

      return {
        status: "failed",
        publishedCount: 0,
        fallbackCount: preparedEntries.length,
      };
    }
  }

  async lookupExistingBancoUnicoEans(eans = [], productApi = {}) {
    const normalizedEans = [...new Set(
      eans
        .map((ean) => String(ean || "").trim())
        .filter(Boolean),
    )];

    if (!normalizedEans.length) {
      return new Set();
    }

    const existingEans = new Set();
    const batches = this.chunk(normalizedEans, env.bancoUnicoLookupBatchSize);

    logger.info("Iniciando checagem de existencia no Banco Unico", {
      total_eans_consulta: normalizedEans.length,
      batches: batches.length,
      batch_size: env.bancoUnicoLookupBatchSize,
      sample_eans: this.summarizeEans(normalizedEans),
    });

    for (const [index, batch] of batches.entries()) {
      logger.info("Consultando batch de EANs no Banco Unico", {
        batch_index: index + 1,
        batch_total: batches.length,
        eans_no_batch: batch.length,
        sample_eans: this.summarizeEans(batch),
      });

      const response = await this.bancoUnicoService.searchProductsByEans(batch, productApi || {});
      const products = Array.isArray(response?.products) ? response.products : [];

      logger.info("Resultado do batch consultado no Banco Unico", {
        batch_index: index + 1,
        encontrados: products.length,
        faltantes: batch.length - products.length,
        found_eans_sample: this.summarizeEans(products.map((product) => product?.ean)),
      });

      for (const product of products) {
        const ean = String(product?.ean || "").trim();
        if (ean) {
          existingEans.add(ean);
        }
      }
    }

    logger.info("Checagem de existencia no Banco Unico concluida", {
      total_consultados: normalizedEans.length,
      total_existentes: existingEans.size,
      total_ausentes: normalizedEans.length - existingEans.size,
      existing_eans_sample: this.summarizeEans(Array.from(existingEans)),
    });

    return existingEans;
  }

  async markEntryAsSkipped(entry, { message, fontesConsultadas }) {
    await this.importacaoRepository.updateItem(entry.importItem.id, {
      status: "enriched",
      nome_recebido: entry.item?.nome_recebido || entry.importItem?.nome_recebido || null,
      mensagem_erro: message,
      fontes_consultadas: fontesConsultadas,
    });

    await this.importacaoRepository.incrementImportacaoCounters(entry.importItem.importacao_id, {
      itens_processados: 1,
    });
  }

  async processSingleItem(importacaoId, item, enrichmentSession = null, productApi = null, options = {}) {
    const preparation = await this.prepareItemForPublish(
      importacaoId,
      item,
      enrichmentSession,
      options,
    );

    if (preparation.status !== "ready") {
      return preparation.status;
    }

    const publishResult = await this.publishPreparedEntriesBatch(
      importacaoId,
      [preparation],
      productApi,
      { incrementCounters: false },
    );
    return publishResult?.status || "failed";
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
