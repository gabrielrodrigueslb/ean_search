const prisma = require("../lib/prisma");
const { stringifyJson, parseJson } = require("../utils/jsonField");

class ImportacaoRepository {
  createImportacao(data) {
    return prisma.importacao.create({ data });
  }

  updateImportacao(id, data) {
    return prisma.importacao.update({
      where: { id },
      data,
    });
  }

  findImportacaoById(id) {
    return prisma.importacao.findUnique({
      where: { id },
      include: { itens: true },
    }).then((result) => {
      if (!result) {
        return null;
      }

      return {
        ...result,
        itens: result.itens.map((item) => ({
          ...item,
          dados_brutos: parseJson(item.dados_brutos),
          fontes_consultadas: parseJson(item.fontes_consultadas),
        })),
      };
    });
  }

  async incrementImportacaoCounters(id, counters) {
    const data = {};

    if (counters.itens_processados) {
      data.itens_processados = { increment: counters.itens_processados };
    }

    if (counters.itens_sucesso) {
      data.itens_sucesso = { increment: counters.itens_sucesso };
    }

    if (counters.itens_falha) {
      data.itens_falha = { increment: counters.itens_falha };
    }

    if (counters.itens_revisao) {
      data.itens_revisao = { increment: counters.itens_revisao };
    }

    if (!Object.keys(data).length) {
      return prisma.importacao.findUnique({ where: { id } });
    }

    return prisma.importacao.update({
      where: { id },
      data,
    });
  }

  createItem(data) {
    return prisma.itemImportacao.create({
      data: {
        ...data,
        dados_brutos: stringifyJson(data.dados_brutos),
        fontes_consultadas: stringifyJson(data.fontes_consultadas),
      },
    }).then((item) => ({
      ...item,
      dados_brutos: parseJson(item.dados_brutos),
      fontes_consultadas: parseJson(item.fontes_consultadas),
    }));
  }

  updateItem(id, data) {
    return prisma.itemImportacao.update({
      where: { id },
      data: {
        ...data,
        dados_brutos: data.dados_brutos === undefined ? undefined : stringifyJson(data.dados_brutos),
        fontes_consultadas:
          data.fontes_consultadas === undefined ? undefined : stringifyJson(data.fontes_consultadas),
      },
    }).then((item) => ({
      ...item,
      dados_brutos: parseJson(item.dados_brutos),
      fontes_consultadas: parseJson(item.fontes_consultadas),
    }));
  }
}

module.exports = { ImportacaoRepository };
