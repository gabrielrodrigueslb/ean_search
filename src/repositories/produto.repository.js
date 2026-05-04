const prisma = require("../lib/prisma");

class ProdutoRepository {
  findByEan(ean) {
    return prisma.apresentacao.findUnique({
      where: { ean },
      include: { produto: true },
    });
  }

  findProdutoByNormalizedName(nomeNormalizado, tipo) {
    return prisma.produto.findFirst({
      where: {
        nome_normalizado: nomeNormalizado,
        tipo,
      },
      orderBy: { id: "asc" },
    });
  }

  createProduto(data) {
    return prisma.produto.create({ data });
  }

  updateProduto(id, data) {
    return prisma.produto.update({
      where: { id },
      data,
    });
  }

  createApresentacao(data) {
    return prisma.apresentacao.create({ data });
  }

  updateApresentacao(id, data) {
    return prisma.apresentacao.update({
      where: { id },
      data,
    });
  }

  upsertFarmaco(data) {
    return prisma.farmaco.upsert({
      where: { nome_normalizado: data.nome_normalizado },
      update: {
        nome: data.nome,
        slug: data.slug,
      },
      create: data,
    });
  }

  attachFarmaco(produtoId, farmacoId) {
    return prisma.produtoFarmaco.upsert({
      where: {
        produto_id_farmaco_id: {
          produto_id: produtoId,
          farmaco_id: farmacoId,
        },
      },
      update: {},
      create: {
        produto_id: produtoId,
        farmaco_id: farmacoId,
      },
    });
  }
}

module.exports = { ProdutoRepository };
