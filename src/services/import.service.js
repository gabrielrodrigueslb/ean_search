const { validateEAN } = require("../utils/validateEAN");
const { diffObjects } = require("../utils/diffObjects");
const { ProductService } = require("./product.service");
const { ReviewService } = require("./review.service");
const { EnrichmentService } = require("./enrichment.service");
const { AiService } = require("./ai.service");
const { ImportacaoRepository } = require("../repositories/importacao.repository");
const { EanNaoEncontradoRepository } = require("../repositories/ean-nao-encontrado.repository");
const { logger } = require("../utils/logger");

class ImportService {
  constructor() {
    this.importacaoRepository = new ImportacaoRepository();
    this.productService = new ProductService();
    this.reviewService = new ReviewService();
    this.enrichmentService = new EnrichmentService();
    this.aiService = new AiService();
    this.eanNaoEncontradoRepository = new EanNaoEncontradoRepository();
  }

  async processItems({ fonte, items }) {
    const importacao = await this.importacaoRepository.createImportacao({
      fonte,
      status: "processing",
      total_itens: items.length,
    });

    logger.info("Processamento da importacao iniciado", {
      importacao_id: importacao.id,
      fonte,
      total_itens: items.length,
    });

    try {
      for (const item of items) {
        await this.processSingleItem(importacao.id, item);
      }

      const finished = await this.importacaoRepository.findImportacaoById(importacao.id);
      const totals = finished.itens.reduce(
        (acc, item) => {
          acc.processed += 1;
          if (item.status === "enriched") acc.success += 1;
          if (item.status === "failed" || item.status === "not_found") acc.failed += 1;
          if (item.status === "review_required") acc.review += 1;
          return acc;
        },
        { processed: 0, success: 0, failed: 0, review: 0 },
      );

      const updated = await this.importacaoRepository.updateImportacao(importacao.id, {
        status: totals.failed === items.length ? "failed" : "completed",
        itens_processados: totals.processed,
        itens_sucesso: totals.success,
        itens_falha: totals.failed,
        itens_revisao: totals.review,
        finished_at: new Date(),
      });

      logger.info("Processamento da importacao finalizado", {
        importacao_id: importacao.id,
        status: updated.status,
        itens_processados: updated.itens_processados,
        itens_sucesso: updated.itens_sucesso,
        itens_falha: updated.itens_falha,
        itens_revisao: updated.itens_revisao,
      });

      return updated;
    } catch (error) {
      await this.importacaoRepository.updateImportacao(importacao.id, {
        status: "failed",
        finished_at: new Date(),
      });

      logger.error("Falha geral da importacao", {
        importacao_id: importacao.id,
        fonte,
        error: error.message,
      });

      throw error;
    }
  }

  async processSingleItem(importacaoId, item) {
    logger.info("Criando item de importacao", {
      importacao_id: importacaoId,
      ean_recebido: item.ean,
      nome_recebido: item.nome_recebido || null,
    });

    const importItem = await this.importacaoRepository.createItem({
      importacao_id: importacaoId,
      ean: String(item.ean || ""),
      nome_recebido: item.nome_recebido || null,
      dados_brutos: item.dados_brutos || item,
      status: "processing",
    });

    try {
      logger.info("Validando EAN", {
        importacao_id: importacaoId,
        item_id: importItem.id,
        ean_recebido: item.ean,
      });

      const { isValid, ean, reason } = validateEAN(item.ean);
      if (!isValid) {
        logger.warn("EAN invalido", {
          importacao_id: importacaoId,
          item_id: importItem.id,
          ean_recebido: item.ean,
          motivo: reason,
        });

        await this.importacaoRepository.updateItem(importItem.id, {
          status: "failed",
          mensagem_erro: reason,
        });
        return;
      }

      logger.info("Consultando produto local por EAN", {
        importacao_id: importacaoId,
        item_id: importItem.id,
        ean,
      });
      const existing = await this.productService.findByEan(ean);

      logger.info("Iniciando enriquecimento externo", {
        importacao_id: importacaoId,
        item_id: importItem.id,
        ean,
        produto_existente: Boolean(existing),
      });
      const enriched = await this.enrichmentService.enrichByEan({
        ean,
        nomeRecebido: item.nome_recebido,
      });

      logger.info("Enriquecimento concluido", {
        importacao_id: importacaoId,
        item_id: importItem.id,
        ean,
        encontrado: enriched.encontrado,
        parcial: enriched.parcial,
        fontes_tentadas: enriched.fontes_tentadas,
      });

      if (existing) {
        await this.handleExistingProduct({ importItem, ean, existing, enriched });
        return;
      }

      await this.handleNewProduct({ importItem, ean, item, enriched });
    } catch (error) {
      logger.error("Falha no processamento do item", {
        importacao_id: importacaoId,
        item_id: importItem.id,
        ean_recebido: item.ean,
        error: error.message,
      });

      await this.importacaoRepository.updateItem(importItem.id, {
        status: "failed",
        mensagem_erro: error.message,
      });
    }
  }

  async handleExistingProduct({ importItem, ean, existing, enriched }) {
    logger.info("Produto ja existe localmente", {
      importacao_id: importItem.importacao_id,
      item_id: importItem.id,
      ean,
      produto_id: existing.produto.id,
    });

    const atual = {
      produto: existing.produto,
      apresentacoes: existing.apresentacoes,
      farmacos: existing.farmacos,
    };

    if (!enriched.encontrado) {
      logger.info("Nenhum dado externo novo encontrado para produto existente", {
        importacao_id: importItem.importacao_id,
        item_id: importItem.id,
        ean,
      });
      await this.importacaoRepository.updateItem(importItem.id, {
        status: "enriched",
        fontes_consultadas: enriched.fontes_tentadas,
      });
      return;
    }

    logger.info("Enviando divergencia para analise de IA", {
      importacao_id: importItem.importacao_id,
      item_id: importItem.id,
      ean,
    });
    const aiAnalysis = await this.aiService.analisarDivergencia({
      atual,
      sugerido: enriched,
      contexto: { ean },
    });

    if (!aiAnalysis.sugerir_atualizacao) {
      logger.info("IA decidiu que nao vale atualizar o cadastro", {
        importacao_id: importItem.importacao_id,
        item_id: importItem.id,
        ean,
        confidence_score: aiAnalysis.confidence_score,
      });
      await this.importacaoRepository.updateItem(importItem.id, {
        status: "enriched",
        fontes_consultadas: enriched.fontes_tentadas,
      });
      return;
    }

    await this.reviewService.createReview({
      entity_type: "produto_composto",
      entity_id: existing.produto.id,
      ean,
      dados_atuais: atual,
      dados_sugeridos: aiAnalysis.dados_sugeridos || enriched,
      diff_campos: aiAnalysis.diff_campos || diffObjects(atual.produto, enriched.produto),
      motivo: "Divergencia detectada entre cadastro atual e dados enriquecidos.",
      resumo_ia: aiAnalysis.resumo,
      confidence_score: aiAnalysis.confidence_score,
      fonte: "ai",
    });

    logger.info("Solicitacao de revisao criada para produto existente", {
      importacao_id: importItem.importacao_id,
      item_id: importItem.id,
      ean,
      produto_id: existing.produto.id,
      confidence_score: aiAnalysis.confidence_score,
    });

    await this.importacaoRepository.updateItem(importItem.id, {
      status: "review_required",
      fontes_consultadas: enriched.fontes_tentadas,
    });
  }

  async handleNewProduct({ importItem, ean, item, enriched }) {
    if (!enriched.encontrado) {
      logger.warn("EAN nao encontrado em nenhuma fonte", {
        importacao_id: importItem.importacao_id,
        item_id: importItem.id,
        ean,
      });

      await this.eanNaoEncontradoRepository.upsertByEan(ean, {
        nome_recebido: item.nome_recebido || null,
        dados_brutos: item.dados_brutos || item,
        fontes_tentadas: enriched.fontes_tentadas,
        motivo_nao_encontrado: "Nenhuma fonte retornou dados para o EAN informado.",
      });

      await this.importacaoRepository.updateItem(importItem.id, {
        status: "not_found",
        fontes_consultadas: enriched.fontes_tentadas,
      });
      return;
    }

    logger.info("Criando novo produto a partir do enriquecimento", {
      importacao_id: importItem.importacao_id,
      item_id: importItem.id,
      ean,
      tipo: enriched.produto.tipo,
      parcial: enriched.parcial,
    });
    const created = await this.productService.createOrAttachFromSnapshot(enriched);

    if (enriched.parcial) {
      await this.reviewService.createReview({
        entity_type: "produto_composto",
        entity_id: created.produto.id,
        ean,
        dados_atuais: {
          produto: enriched.produto,
          apresentacoes: enriched.apresentacoes,
          farmacos: enriched.farmacos,
        },
        dados_sugeridos: {
          produto: enriched.produto,
          apresentacoes: enriched.apresentacoes,
          farmacos: enriched.farmacos,
        },
        diff_campos: [],
        motivo: "Cadastro parcial criado. Dados estruturados adicionais dependem de revisao humana.",
        resumo_ia: "Registro criado de forma parcial com base nas fontes disponiveis.",
        confidence_score: null,
        fonte: enriched.produto.tipo === "perfumaria" ? "pt_product_search" : "farmaindex",
      });

      logger.info("Cadastro parcial criado com revisao pendente", {
        importacao_id: importItem.importacao_id,
        item_id: importItem.id,
        ean,
        produto_id: created.produto.id,
      });

      await this.importacaoRepository.updateItem(importItem.id, {
        status: "review_required",
        fontes_consultadas: enriched.fontes_tentadas,
      });
      return;
    }

    logger.info("Novo produto enriquecido criado com sucesso", {
      importacao_id: importItem.importacao_id,
      item_id: importItem.id,
      ean,
      produto_id: created.produto.id,
      reaproveitou_produto_pai: Boolean(created.reused),
    });

    await this.importacaoRepository.updateItem(importItem.id, {
      status: "enriched",
      fontes_consultadas: enriched.fontes_tentadas,
    });
  }

  getImportacao(id) {
    return this.importacaoRepository.findImportacaoById(id);
  }
}

module.exports = { ImportService };
