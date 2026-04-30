const prisma = require("../lib/prisma");
const { stringifyJson, parseJson } = require("../utils/jsonField");

class SolicitacaoRevisaoRepository {
  create(data) {
    return prisma.solicitacaoRevisao.create({
      data: {
        ...data,
        dados_atuais: stringifyJson(data.dados_atuais),
        dados_sugeridos: stringifyJson(data.dados_sugeridos),
        diff_campos: stringifyJson(data.diff_campos),
      },
    }).then(this.parseReview);
  }

  findById(id) {
    return prisma.solicitacaoRevisao.findUnique({ where: { id } }).then(this.parseReview);
  }

  listByStatus(status) {
    return prisma.solicitacaoRevisao.findMany({
      where: status ? { status } : undefined,
      orderBy: { created_at: "desc" },
    }).then((items) => items.map((item) => this.parseReview(item)));
  }

  update(id, data) {
    return prisma.solicitacaoRevisao.update({
      where: { id },
      data: {
        ...data,
        dados_atuais: data.dados_atuais === undefined ? undefined : stringifyJson(data.dados_atuais),
        dados_sugeridos:
          data.dados_sugeridos === undefined ? undefined : stringifyJson(data.dados_sugeridos),
        diff_campos: data.diff_campos === undefined ? undefined : stringifyJson(data.diff_campos),
      },
    }).then(this.parseReview);
  }

  listPendingByEan(ean) {
    return prisma.solicitacaoRevisao.findMany({
      where: {
        ean,
        status: "pending",
      },
    }).then((items) => items.map((item) => this.parseReview(item)));
  }

  parseReview(review) {
    if (!review) {
      return null;
    }

    return {
      ...review,
      dados_atuais: parseJson(review.dados_atuais),
      dados_sugeridos: parseJson(review.dados_sugeridos),
      diff_campos: parseJson(review.diff_campos),
    };
  }
}

module.exports = { SolicitacaoRevisaoRepository };
