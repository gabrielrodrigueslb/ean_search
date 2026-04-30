const prisma = require("../lib/prisma");
const { stringifyJson } = require("../utils/jsonField");

class HistoricoAlteracoesRepository {
  create(data) {
    return prisma.historicoAlteracao.create({
      data: {
        ...data,
        antes: stringifyJson(data.antes),
        depois: stringifyJson(data.depois),
      },
    });
  }
}

module.exports = { HistoricoAlteracoesRepository };
