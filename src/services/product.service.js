const { ProdutoRepository } = require("../repositories/produto.repository");
const { SolicitacaoRevisaoRepository } = require("../repositories/solicitacao-revisao.repository");
const { logger } = require("../utils/logger");
const { normalizeText } = require("../utils/normalizeText");

class ProductService {
  constructor() {
    this.produtoRepository = new ProdutoRepository();
    this.solicitacaoRevisaoRepository = new SolicitacaoRevisaoRepository();
  }

  resolveNomeExibicao(produtoNome, apresentacao) {
    if (apresentacao?.nome_exibicao) {
      return apresentacao.nome_exibicao;
    }

    const descricao = apresentacao?.descricao;
    if (!produtoNome && !descricao) {
      return null;
    }

    if (!descricao) {
      return produtoNome;
    }

    const normalizedNome = normalizeText(produtoNome || "");
    const normalizedDescricao = normalizeText(descricao);

    if (normalizedNome && normalizedDescricao.includes(normalizedNome)) {
      return descricao;
    }

    return [produtoNome, descricao].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
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
        nome_exibicao: this.resolveNomeExibicao(produto.nome, item),
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
        nome_exibicao: this.resolveNomeExibicao(produto.nome, item),
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

  mapPresentationSearchResult(aggregate, apresentacao) {
    const nomeExibicao = this.resolveNomeExibicao(aggregate.produto.nome, apresentacao);

    return {
      id: apresentacao.id,
      produto_id: aggregate.produto.id,
      nome: aggregate.produto.nome,
      nome_exibicao: nomeExibicao,
      nome_normalizado: aggregate.produto.nome_normalizado,
      slug: aggregate.produto.slug,
      tipo: aggregate.produto.tipo,
      laboratorio: aggregate.produto.laboratorio,
      laboratorio_slug: aggregate.produto.laboratorio_slug,
      classe: aggregate.produto.classe,
      classe_slug: aggregate.produto.classe_slug,
      categoria: aggregate.produto.categoria,
      origem_nome: aggregate.produto.origem_nome,
      ean: apresentacao.ean,
      nome_exibicao_apresentacao: nomeExibicao,
      descricao: apresentacao.descricao,
      dose: apresentacao.dose,
      unidade: apresentacao.unidade,
      forma_farmaceutica: apresentacao.forma_farmaceutica,
      via_administracao: apresentacao.via_administracao,
      quantidade: apresentacao.quantidade,
      volume: apresentacao.volume,
      registro_ms: apresentacao.registro_ms,
      tarja: apresentacao.tarja,
      origem_dados: apresentacao.origem_dados,
      farmacos: aggregate.farmacos,
      created_at: aggregate.produto.created_at,
      updated_at: aggregate.produto.updated_at,
    };
  }

  buildPresentationSearchText(apresentacao) {
    return normalizeText([
      apresentacao.nome_exibicao,
      apresentacao.descricao,
      apresentacao.forma_farmaceutica,
      apresentacao.quantidade,
      apresentacao.dose,
      apresentacao.unidade,
      apresentacao.via_administracao,
      apresentacao.tarja,
      apresentacao.ean,
    ].filter(Boolean).join(" "));
  }

  normalizeSearchTokens(value) {
    const synonymMap = {
      comp: "comprimido",
      comps: "comprimido",
      comprimidos: "comprimido",
      comprimido: "comprimido",
      cp: "comprimido",
      cps: "comprimido",
      caps: "capsula",
      capsula: "capsula",
      capsulas: "capsula",
      gota: "solucao",
      gotas: "solucao",
      solucao: "solucao",
      solucoes: "solucao",
      xarope: "xarope",
      xaropes: "xarope",
      efervescente: "efervescente",
      efervescentes: "efervescente",
      revestido: "revestido",
      revestidos: "revestido",
    };

    return [...new Set(
      normalizeText(value)
        .split(" ")
        .map((token) => token.trim())
        .filter(Boolean)
        .map((token) => synonymMap[token] || token)
    )];
  }

  tokenizeTextForSearch(value) {
    return this.normalizeSearchTokens(value);
  }

  scorePresentation(apresentacao, tokens) {
    const text = this.buildPresentationSearchText(apresentacao);
    let score = 0;

    for (const token of tokens) {
      if (!token) {
        continue;
      }

      if (text.includes(token)) {
        score += 3;
      }

      if (normalizeText(apresentacao.forma_farmaceutica || "").includes(token)) {
        score += 5;
      }

      if (normalizeText(apresentacao.descricao || "").includes(token)) {
        score += 4;
      }
    }

    return score;
  }

  tokensMatchCombinedText(tokens, productText, presentationText) {
    const combined = `${productText} ${presentationText}`.trim();
    return tokens.every((token) => combined.includes(token));
  }

  scoreProdutoAggregate(aggregate, tokens) {
    const nomeText = normalizeText([
      aggregate.produto.nome,
      aggregate.produto.nome_normalizado,
      aggregate.produto.slug,
      aggregate.produto.classe,
      aggregate.produto.categoria,
    ].filter(Boolean).join(" "));

    let score = 0;
    for (const token of tokens) {
      if (!token) {
        continue;
      }

      if (nomeText.includes(token)) {
        score += 6;
      }
    }

    const presentationsWithScore = aggregate.apresentacoes
      .map((apresentacao) => ({
        ...apresentacao,
        _searchText: this.buildPresentationSearchText(apresentacao),
        _score: this.scorePresentation(apresentacao, tokens),
      }))
      .sort((a, b) => b._score - a._score || a.id - b.id);

    const topPresentationScore = presentationsWithScore[0]?._score || 0;
    score += topPresentationScore;

    return {
      score,
      nomeText,
      apresentacoes: presentationsWithScore,
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
    const tokens = this.normalizeSearchTokens(`${nome || ""} ${slug || ""} ${q || ""}`);

    const records = await this.produtoRepository.searchProdutos({
      nome: nome || q || "",
      nome_normalizado: normalizedNome || normalizedQ,
      slug: slug || q || "",
      tokens,
      limit: limit ? Number(limit) : 20,
    });

    const ranked = records
      .map((record) => {
        const aggregate = this.mapProdutoFromRecord(record);
        const { score, apresentacoes, nomeText } = this.scoreProdutoAggregate(aggregate, tokens);

        const matchedApresentacoes = tokens.length
          ? apresentacoes.filter((item) =>
              this.tokensMatchCombinedText(tokens, nomeText, item._searchText || ""),
            )
          : apresentacoes;

        const finalApresentacoes = matchedApresentacoes.length
          ? matchedApresentacoes
          : (
              !aggregate.apresentacoes.length && this.tokensMatchCombinedText(tokens, nomeText, "")
                ? apresentacoes
                : []
            );

        return {
          ...aggregate,
          apresentacoes: finalApresentacoes.map(
            ({ _score, _searchText, ...rest }) => rest,
          ),
          _score: matchedApresentacoes.length ? score + 10 : score,
        };
      })
      .filter((item) => (tokens.length ? item.apresentacoes.length > 0 : item._score > 0 || !tokens.length))
      .sort((a, b) => b._score - a._score || a.produto.nome.localeCompare(b.produto.nome));

    return ranked.flatMap(({ _score, ...item }) =>
      item.apresentacoes.map((apresentacao) => this.mapPresentationSearchResult(item, apresentacao)),
    );
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
