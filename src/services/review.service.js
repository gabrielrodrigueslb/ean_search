const { SolicitacaoRevisaoRepository } = require("../repositories/solicitacao-revisao.repository");
const { ProdutoRepository } = require("../repositories/produto.repository");
const { HistoricoAlteracoesRepository } = require("../repositories/historico-alteracoes.repository");

class ReviewService {
  constructor() {
    this.reviewRepository = new SolicitacaoRevisaoRepository();
    this.produtoRepository = new ProdutoRepository();
    this.historicoRepository = new HistoricoAlteracoesRepository();
  }

  list(status) {
    return this.reviewRepository.listByStatus(status);
  }

  getById(id) {
    return this.reviewRepository.findById(id);
  }

  async createReview(data) {
    return this.reviewRepository.create(data);
  }

  async approve(id, reviewedBy) {
    const review = await this.reviewRepository.findById(id);
    if (!review) {
      const error = new Error("Solicitacao de revisao nao encontrada.");
      error.status = 404;
      throw error;
    }

    if (review.status !== "pending") {
      const error = new Error("A solicitacao de revisao ja foi processada.");
      error.status = 400;
      throw error;
    }

    let beforeAfter = null;
    if (review.entity_type === "produto_composto" && review.entity_id) {
      beforeAfter = await this.produtoRepository.updateProdutoComSnapshot(
        review.entity_id,
        review.dados_sugeridos,
      );
    }

    const updated = await this.reviewRepository.update(id, {
      status: "approved",
      reviewed_by: reviewedBy || "sistema",
      reviewed_at: new Date(),
    });

    await this.historicoRepository.create({
      solicitacao_revisao_id: updated.id,
      entity_type: updated.entity_type,
      entity_id: updated.entity_id,
      antes: review.dados_atuais,
      depois: review.dados_sugeridos,
      aplicado_por: reviewedBy || "sistema",
    });

    return { review: updated, changes: beforeAfter };
  }

  async reject(id, reviewedBy) {
    const review = await this.reviewRepository.findById(id);
    if (!review) {
      const error = new Error("Solicitacao de revisao nao encontrada.");
      error.status = 404;
      throw error;
    }

    if (review.status !== "pending") {
      const error = new Error("A solicitacao de revisao ja foi processada.");
      error.status = 400;
      throw error;
    }

    return this.reviewRepository.update(id, {
      status: "rejected",
      reviewed_by: reviewedBy || "sistema",
      reviewed_at: new Date(),
    });
  }
}

module.exports = { ReviewService };
