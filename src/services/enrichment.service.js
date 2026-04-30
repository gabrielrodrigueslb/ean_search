const { PtProductSearchClient } = require("../integrations/pt-product-search.client");
const { FarmaIndexClient } = require("../integrations/farmaindex.client");
const { normalizeText } = require("../utils/normalizeText");
const { slugify } = require("../utils/slugify");
const { logger } = require("../utils/logger");

class EnrichmentService {
  constructor() {
    this.ptClient = new PtProductSearchClient();
    this.farmaIndexClient = new FarmaIndexClient();
  }

  inferTipo({ farmaIndexSearch, nomePt }) {
    if (farmaIndexSearch) {
      return "medicamento";
    }

    if (nomePt) {
      return "perfumaria";
    }

    return "outro";
  }

  extractFarmacos(detail) {
    const candidates = [];
    const seo = detail?.info?.seoDescription || detail?.info?.seoFullDescription || "";
    const text = String(seo);
    const segments = text.split(".").map((part) => part.trim()).filter(Boolean);

    if (segments.length > 1) {
      const potential = segments[1]
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      for (const item of potential) {
        candidates.push({
          nome: item,
          nome_normalizado: normalizeText(item),
          slug: slugify(item),
        });
      }
    }

    return candidates.filter((item) => item.nome_normalizado);
  }

  buildNomeExibicao({ nomeProduto, descricao, ptNome }) {
    if (ptNome) {
      return ptNome;
    }

    if (!nomeProduto && !descricao) {
      return null;
    }

    if (!descricao) {
      return nomeProduto;
    }

    const normalizedNome = normalizeText(nomeProduto);
    const normalizedDescricao = normalizeText(descricao);

    if (normalizedDescricao.includes(normalizedNome)) {
      return descricao;
    }

    return `${nomeProduto} ${descricao}`.replace(/\s+/g, " ").trim();
  }

  buildSnapshot({ ean, nomeRecebido, ptResult, farmaIndexSearch, farmaIndexDetail }) {
    const nomeProduto =
      farmaIndexSearch?.produto ||
      farmaIndexDetail?.info?.produto ||
      nomeRecebido ||
      ptResult?.nome;

    if (!nomeProduto) {
      return null;
    }

    const tipo = this.inferTipo({ farmaIndexSearch, nomePt: ptResult?.nome });
    const detailInfo = farmaIndexDetail?.info || {};

    const produto = {
      nome: nomeProduto,
      nome_normalizado: normalizeText(nomeProduto),
      slug: detailInfo.slug || slugify(nomeProduto),
      tipo,
      laboratorio: detailInfo.laboratorio || null,
      laboratorio_slug: detailInfo.laboratorioslug || null,
      classe: detailInfo.classe || null,
      classe_slug: detailInfo.classeslug || null,
      categoria: detailInfo.categoria || null,
      origem_nome: ptResult?.nome ? "pt_product_search" : farmaIndexSearch ? "farmaindex" : "manual",
    };

    const apresentacao = {
      ean,
      nome_exibicao: this.buildNomeExibicao({
        nomeProduto,
        descricao: detailInfo.apresentacao || farmaIndexSearch?.apresentacao || nomeRecebido || nomeProduto,
        ptNome: ptResult?.nome,
      }),
      descricao: detailInfo.apresentacao || farmaIndexSearch?.apresentacao || nomeRecebido || nomeProduto,
      dose: detailInfo.dose_total || null,
      unidade: detailInfo.unidade || null,
      forma_farmaceutica: detailInfo.forma_farmaceutica || null,
      via_administracao: detailInfo.via_adm || null,
      quantidade: detailInfo.qtde_fs || null,
      volume: null,
      registro_ms: detailInfo.registro || null,
      tarja: detailInfo.tarja || null,
      origem_dados: farmaIndexDetail ? "farmaindex" : ptResult ? "pt_product_search" : "manual",
    };

    return {
      encontrado: true,
      parcial: !farmaIndexDetail,
      produto,
      apresentacoes: [apresentacao],
      farmacos: farmaIndexDetail ? this.extractFarmacos(farmaIndexDetail) : [],
      fontes_tentadas: {
        pt_product_search: Boolean(ptResult),
        farmaindex_busca: Boolean(farmaIndexSearch),
        farmaindex_detalhe: Boolean(farmaIndexDetail),
      },
    };
  }

  async enrichByEan({ ean, nomeRecebido }) {
    let ptResult = null;
    let farmaIndexSearch = null;
    let farmaIndexDetail = null;

    const [ptResponse, farmaSearchResponse] = await Promise.allSettled([
      (async () => {
        logger.info("Consultando PT.ProductSearch", { ean });
        return this.ptClient.buscarNomePorEan(ean);
      })(),
      (async () => {
        logger.info("Consultando FarmaIndex busca", { ean });
        return this.farmaIndexClient.buscarPorEan(ean);
      })(),
    ]);

    if (ptResponse.status === "fulfilled") {
      ptResult = ptResponse.value;
    } else {
      logger.warn("Falha ao consultar PT.ProductSearch", {
        ean,
        error: ptResponse.reason?.message || String(ptResponse.reason),
      });
    }

    if (farmaSearchResponse.status === "fulfilled") {
      farmaIndexSearch = farmaSearchResponse.value;
    } else {
      logger.warn("Falha ao consultar FarmaIndex", {
        ean,
        error: farmaSearchResponse.reason?.message || String(farmaSearchResponse.reason),
      });
    }

    if (farmaIndexSearch?.slug && farmaIndexSearch?.medicamentoid) {
      try {
        logger.info("Consultando FarmaIndex detalhe", {
          ean,
          slug: farmaIndexSearch.slug,
          medicamentoid: farmaIndexSearch.medicamentoid,
        });
        farmaIndexDetail = await this.farmaIndexClient.buscarDetalhe({
          slug: farmaIndexSearch.slug,
          medicamentoid: farmaIndexSearch.medicamentoid,
        });
      } catch (error) {
        logger.warn("Falha ao consultar detalhe no FarmaIndex", {
          ean,
          error: error.message,
        });
        farmaIndexDetail = null;
      }
    }

    const snapshot = this.buildSnapshot({
      ean,
      nomeRecebido,
      ptResult,
      farmaIndexSearch,
      farmaIndexDetail,
    });

    if (!snapshot) {
      return {
        encontrado: false,
        parcial: false,
        produto: null,
        apresentacoes: [],
        farmacos: [],
        fontes_tentadas: {
          pt_product_search: Boolean(ptResult),
          farmaindex_busca: Boolean(farmaIndexSearch),
          farmaindex_detalhe: Boolean(farmaIndexDetail),
        },
      };
    }

    return snapshot;
  }
}

module.exports = { EnrichmentService };
