const prisma = require("../lib/prisma");
const { stringifyJson, parseJson } = require("../utils/jsonField");

function normalizeImportacaoId(id) {
  const parsedId = Number.parseInt(id, 10);
  return Number.isInteger(parsedId) && parsedId > 0 ? parsedId : null;
}

class ImportacaoRepository {
  createImportacao(data) {
    return prisma.importacao.create({ data });
  }

  updateImportacao(id, data) {
    const importacaoId = normalizeImportacaoId(id);
    if (importacaoId === null) {
      return Promise.resolve(null);
    }

    return prisma.importacao.update({
      where: { id: importacaoId },
      data,
    });
  }

  findImportacaoById(id) {
    const importacaoId = normalizeImportacaoId(id);
    if (importacaoId === null) {
      return Promise.resolve(null);
    }

    return prisma.importacao.findUnique({
      where: { id: importacaoId },
      include: { itens: true, aprovacoes: true },
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
        aprovacoes: result.aprovacoes.map((aprovacao) => ({
          ...aprovacao,
          dados_brutos: parseJson(aprovacao.dados_brutos),
        })),
      };
    });
  }

  async incrementImportacaoCounters(id, counters) {
    const importacaoId = normalizeImportacaoId(id);
    if (importacaoId === null) {
      return null;
    }

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
      return prisma.importacao.findUnique({ where: { id: importacaoId } });
    }

    return prisma.importacao.update({
      where: { id: importacaoId },
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

  createProdutoAprovacao(data) {
    return prisma.produtoAprovacao.create({
      data: {
        ...data,
        dados_brutos: stringifyJson(data.dados_brutos),
      },
    }).then((aprovacao) => ({
      ...aprovacao,
      dados_brutos: parseJson(aprovacao.dados_brutos),
    }));
  }
}

module.exports = { ImportacaoRepository };
