const prisma = require("../lib/prisma");

class ProdutoRepository {
  async findByEan(ean) {
    return prisma.apresentacao.findUnique({
      where: { ean },
      include: {
        produto: {
          include: {
            apresentacoes: true,
            produto_farmacos: {
              include: {
                farmaco: true,
              },
            },
          },
        },
      },
    });
  }

  async createProdutoComDependencias(payload) {
    const { produto, apresentacao, farmacos = [] } = payload;

    return prisma.$transaction(async (tx) => {
      const createdProduto = await tx.produto.create({
        data: produto,
      });

      const createdApresentacao = await tx.apresentacao.create({
        data: {
          ...apresentacao,
          produto_id: createdProduto.id,
        },
      });

      for (const farmaco of farmacos) {
        const existingFarmaco = await tx.farmaco.upsert({
          where: { nome_normalizado: farmaco.nome_normalizado },
          update: {
            nome: farmaco.nome,
            slug: farmaco.slug,
          },
          create: farmaco,
        });

        await tx.produtoFarmaco.upsert({
          where: {
            produto_id_farmaco_id: {
              produto_id: createdProduto.id,
              farmaco_id: existingFarmaco.id,
            },
          },
          update: {},
          create: {
            produto_id: createdProduto.id,
            farmaco_id: existingFarmaco.id,
          },
        });
      }

      return {
        produto: createdProduto,
        apresentacao: createdApresentacao,
      };
    });
  }

  async findCandidatesByNormalizedName(nome_normalizado) {
    return prisma.produto.findMany({
      where: { nome_normalizado },
      include: {
        apresentacoes: true,
        produto_farmacos: {
          include: {
            farmaco: true,
          },
        },
      },
      orderBy: { id: "asc" },
    });
  }

  async searchProdutos({ nome, nome_normalizado, slug, limit = 20 }) {
    const filters = [];

    if (slug) {
      filters.push({
        slug: {
          contains: slug,
        },
      });
    }

    if (nome) {
      filters.push({
        nome: {
          contains: nome,
        },
      });
    }

    if (nome_normalizado) {
      filters.push({
        nome_normalizado: {
          contains: nome_normalizado,
        },
      });
    }

    return prisma.produto.findMany({
      where: filters.length ? { OR: filters } : undefined,
      include: {
        apresentacoes: true,
        produto_farmacos: {
          include: {
            farmaco: true,
          },
        },
      },
      orderBy: [
        { nome: "asc" },
        { id: "asc" },
      ],
      take: limit,
    });
  }

  async attachPresentationToProduto(produtoId, payload) {
    const { apresentacao, farmacos = [], produto } = payload;

    return prisma.$transaction(async (tx) => {
      const produtoAtual = await tx.produto.findUnique({
        where: { id: produtoId },
        include: {
          apresentacoes: true,
          produto_farmacos: {
            include: { farmaco: true },
          },
        },
      });

      const updatedProduto = await tx.produto.update({
        where: { id: produtoId },
        data: {
          slug: produtoAtual.slug || produto.slug,
          laboratorio: produtoAtual.laboratorio || produto.laboratorio,
          laboratorio_slug: produtoAtual.laboratorio_slug || produto.laboratorio_slug,
          classe: produtoAtual.classe || produto.classe,
          classe_slug: produtoAtual.classe_slug || produto.classe_slug,
          categoria: produtoAtual.categoria || produto.categoria,
          origem_nome: produtoAtual.origem_nome || produto.origem_nome,
        },
      });

      const createdApresentacao = await tx.apresentacao.create({
        data: {
          ...apresentacao,
          produto_id: produtoId,
        },
      });

      for (const farmaco of farmacos) {
        const existingFarmaco = await tx.farmaco.upsert({
          where: { nome_normalizado: farmaco.nome_normalizado },
          update: {
            nome: farmaco.nome,
            slug: farmaco.slug,
          },
          create: farmaco,
        });

        await tx.produtoFarmaco.upsert({
          where: {
            produto_id_farmaco_id: {
              produto_id: produtoId,
              farmaco_id: existingFarmaco.id,
            },
          },
          update: {},
          create: {
            produto_id: produtoId,
            farmaco_id: existingFarmaco.id,
          },
        });
      }

      return {
        produto: updatedProduto,
        apresentacao: createdApresentacao,
        reused: true,
      };
    });
  }

  async updateProdutoComSnapshot(produtoId, snapshot) {
    return prisma.$transaction(async (tx) => {
      const produtoAtual = await tx.produto.findUnique({
        where: { id: produtoId },
        include: {
          apresentacoes: true,
          produto_farmacos: {
            include: { farmaco: true },
          },
        },
      });

      const produto = await tx.produto.update({
        where: { id: produtoId },
        data: snapshot.produto,
      });

      const apresentacaoSugerida = snapshot.apresentacoes?.[0];
      let apresentacao = null;
      if (apresentacaoSugerida) {
        const currentPresentation = produtoAtual.apresentacoes[0];
        apresentacao = await tx.apresentacao.update({
          where: { id: currentPresentation.id },
          data: apresentacaoSugerida,
        });
      }

      if (Array.isArray(snapshot.farmacos)) {
        await tx.produtoFarmaco.deleteMany({ where: { produto_id: produtoId } });

        for (const farmaco of snapshot.farmacos) {
          const farmacoRecord = await tx.farmaco.upsert({
            where: { nome_normalizado: farmaco.nome_normalizado },
            update: {
              nome: farmaco.nome,
              slug: farmaco.slug,
            },
            create: farmaco,
          });

          await tx.produtoFarmaco.create({
            data: {
              produto_id: produtoId,
              farmaco_id: farmacoRecord.id,
            },
          });
        }
      }

      return { produto, apresentacao, antes: produtoAtual };
    });
  }
}

module.exports = { ProdutoRepository };
