const { ProdutoRepository } = require("../repositories/produto.repository");
const { SolicitacaoRevisaoRepository } = require("../repositories/solicitacao-revisao.repository");
const { logger } = require("../utils/logger");
const { normalizeText } = require("../utils/normalizeText");

class ProductService {
  constructor() {
    this.produtoRepository = new ProdutoRepository();
    this.solicitacaoRevisaoRepository = new SolicitacaoRevisaoRepository();
  }

  mapProdutoAggregate(apresentacaoRecord) {
    if (!apresentacaoRecord) {
      return null;
    }

    const produto = apresentacaoRecord.produto;

    return {
      produto: {
        id: produto.id,
        nome: produto.nome,
        nome_normalizado: produto.nome_normalizado,
        slug: produto.slug,
        tipo: produto.tipo,
        laboratorio: produto.laboratorio,
        laboratorio_slug: produto.laboratorio_slug,
        classe: produto.classe,
        classe_slug: produto.classe_slug,
        categoria: produto.categoria,
        origem_nome: produto.origem_nome,
        created_at: produto.created_at,
        updated_at: produto.updated_at,
      },
      apresentacoes: produto.apresentacoes.map((item) => ({
        id: item.id,
        ean: item.ean,
        descricao: item.descricao,
        dose: item.dose,
        unidade: item.unidade,
        forma_farmaceutica: item.forma_farmaceutica,
        via_administracao: item.via_administracao,
        quantidade: item.quantidade,
        volume: item.volume,
        registro_ms: item.registro_ms,
        tarja: item.tarja,
        origem_dados: item.origem_dados,
      })),
      farmacos: produto.produto_farmacos.map((item) => ({
        id: item.farmaco.id,
        nome: item.farmaco.nome,
        nome_normalizado: item.farmaco.nome_normalizado,
        slug: item.farmaco.slug,
      })),
    };
  }

  mapProdutoFromRecord(produto) {
    return {
      produto: {
        id: produto.id,
        nome: produto.nome,
        nome_normalizado: produto.nome_normalizado,
        slug: produto.slug,
        tipo: produto.tipo,
        laboratorio: produto.laboratorio,
        laboratorio_slug: produto.laboratorio_slug,
        classe: produto.classe,
        classe_slug: produto.classe_slug,
        categoria: produto.categoria,
        origem_nome: produto.origem_nome,
        created_at: produto.created_at,
        updated_at: produto.updated_at,
      },
      apresentacoes: produto.apresentacoes.map((item) => ({
        id: item.id,
        ean: item.ean,
        descricao: item.descricao,
        dose: item.dose,
        unidade: item.unidade,
        forma_farmaceutica: item.forma_farmaceutica,
        via_administracao: item.via_administracao,
        quantidade: item.quantidade,
        volume: item.volume,
        registro_ms: item.registro_ms,
        tarja: item.tarja,
        origem_dados: item.origem_dados,
      })),
      farmacos: produto.produto_farmacos.map((item) => ({
        id: item.farmaco.id,
        nome: item.farmaco.nome,
        nome_normalizado: item.farmaco.nome_normalizado,
        slug: item.farmaco.slug,
      })),
    };
  }

  async findByEan(ean) {
    const record = await this.produtoRepository.findByEan(ean);
    if (!record) {
      return null;
    }

    const aggregate = this.mapProdutoAggregate(record);
    const pendingReviews = await this.solicitacaoRevisaoRepository.listPendingByEan(ean);

    return {
      ...aggregate,
      pendingReviews,
    };
  }

  async search({ nome, slug, q, limit }) {
    const normalizedQ = q ? normalizeText(q) : "";
    const normalizedNome = nome ? normalizeText(nome) : "";

    const records = await this.produtoRepository.searchProdutos({
      nome: nome || q || "",
      nome_normalizado: normalizedNome || normalizedQ,
      slug: slug || q || "",
      limit: limit ? Number(limit) : 20,
    });

    return records.map((record) => this.mapProdutoFromRecord(record));
  }

  async createFromSnapshot(snapshot) {
    return this.produtoRepository.createProdutoComDependencias({
      produto: snapshot.produto,
      apresentacao: snapshot.apresentacoes[0],
      farmacos: snapshot.farmacos,
    });
  }

  buildFarmacoSignature(farmacos) {
    return (farmacos || [])
      .map((item) => item.nome_normalizado)
      .filter(Boolean)
      .sort()
      .join("|");
  }

  isSameProdutoFamily(candidate, snapshot) {
    if (!candidate || !snapshot?.produto) {
      return false;
    }

    if (candidate.nome_normalizado !== snapshot.produto.nome_normalizado) {
      return false;
    }

    if (candidate.tipo !== snapshot.produto.tipo) {
      return false;
    }

    if (snapshot.produto.slug && candidate.slug && snapshot.produto.slug === candidate.slug) {
      return true;
    }

    if (
      snapshot.produto.laboratorio_slug &&
      candidate.laboratorio_slug &&
      snapshot.produto.laboratorio_slug !== candidate.laboratorio_slug
    ) {
      return false;
    }

    if (snapshot.produto.tipo === "medicamento") {
      const candidateFarmacos = candidate.produto_farmacos.map((item) => item.farmaco);
      const candidateSignature = this.buildFarmacoSignature(candidateFarmacos);
      const snapshotSignature = this.buildFarmacoSignature(snapshot.farmacos);

      if (snapshotSignature && candidateSignature) {
        return snapshotSignature === candidateSignature;
      }

      if (snapshot.produto.classe_slug && candidate.classe_slug) {
        return snapshot.produto.classe_slug === candidate.classe_slug;
      }
    }

    if (snapshot.produto.tipo === "perfumaria") {
      if (
        snapshot.produto.laboratorio_slug &&
        candidate.laboratorio_slug &&
        snapshot.produto.laboratorio_slug === candidate.laboratorio_slug
      ) {
        return true;
      }

      return snapshot.produto.nome_normalizado === candidate.nome_normalizado;
    }

    return snapshot.produto.nome_normalizado === candidate.nome_normalizado;
  }

  async findProdutoPai(snapshot) {
    const candidates = await this.produtoRepository.findCandidatesByNormalizedName(
      snapshot.produto.nome_normalizado,
    );

    return candidates.find((candidate) => this.isSameProdutoFamily(candidate, snapshot)) || null;
  }

  async createOrAttachFromSnapshot(snapshot) {
    const produtoPai = await this.findProdutoPai(snapshot);

    if (!produtoPai) {
      logger.info("Nenhum produto pai compativel encontrado; criando novo produto", {
        nome_normalizado: snapshot.produto.nome_normalizado,
        tipo: snapshot.produto.tipo,
      });

      return this.createFromSnapshot(snapshot);
    }

    logger.info("Produto pai compativel encontrado; criando apenas nova apresentacao", {
      produto_id: produtoPai.id,
      nome_normalizado: produtoPai.nome_normalizado,
      ean: snapshot.apresentacoes?.[0]?.ean,
    });

    return this.produtoRepository.attachPresentationToProduto(produtoPai.id, {
      produto: snapshot.produto,
      apresentacao: snapshot.apresentacoes[0],
      farmacos: snapshot.farmacos,
    });
  }
}

module.exports = { ProductService };
