const prisma = require("../lib/prisma");
const { stringifyJson } = require("../utils/jsonField");

class EanNaoEncontradoRepository {
  upsertByEan(ean, data) {
    return prisma.eanNaoEncontrado.upsert({
      where: { ean },
      update: {
        ...data,
        dados_brutos: stringifyJson(data.dados_brutos),
        fontes_tentadas: stringifyJson(data.fontes_tentadas),
      },
      create: {
        ean,
        ...data,
        dados_brutos: stringifyJson(data.dados_brutos),
        fontes_tentadas: stringifyJson(data.fontes_tentadas),
      },
    });
  }
}

module.exports = { EanNaoEncontradoRepository };
