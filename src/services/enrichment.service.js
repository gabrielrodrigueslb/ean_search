const { FarmaIndexClient } = require("../integrations/farmaindex.client");
const { ConvertizeClient } = require("../integrations/convertize.client");
const { classifyProductType } = require("../utils/classifyProductType");
const { normalizeText } = require("../utils/normalizeText");

function pickFirstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function slugify(value) {
  return normalizeText(value).replace(/\s+/g, "-");
}

function isTrustedNameSource(source) {
  return source === "convertize"
    || source === "pt_product_search"
    || source === "farmaindex"
    || source === "barcode_lookup"
    || source === "pt_product_search_browser"
    || source === "barcode_lookup_browser";
}

class EnrichmentService {
  constructor() {
    this.farmaIndexClient = new FarmaIndexClient();
    this.convertizeClient = new ConvertizeClient();
  }

  createSession() {
    return {
      lookupCache: new Map(),
    };
  }

  async enrichImportedItem(item, session = null) {
    const ean = String(item.ean || "");
    const { resolution, cacheHit } = await this.getResolutionForEan(ean, session);
    const {
      convertizeLookup,
      convertizeResult,
      searchLookup,
      searchResult,
      detail,
    } = resolution;

    if (!searchResult && !convertizeResult) {
      const approvalReason = this.buildApprovalReason({
        convertizeLookup,
        searchLookup,
      });

      return {
        item: {
          ...item,
          dados_brutos: {
            ...(item.dados_brutos || item),
            origem_nome: null,
            origem_dados: item?.dados_brutos?.origem_dados || item?.fonte || "importacao",
          },
        },
        enriched: false,
        requiresApproval: true,
        approvalReason,
        fontes_consultadas: {
          convertize_busca: Boolean(convertizeResult),
          convertize_busca_error: convertizeLookup.error,
          farmaindex_busca: Boolean(searchResult),
          farmaindex_busca_error: searchLookup.error,
          farmaindex_detalhe: false,
          pt_product_search: false,
          pt_product_search_error: null,
          barcode_lookup: false,
          barcode_lookup_error: null,
          browser_lookup: false,
          browser_lookup_error: null,
          browser_lookup_trail: null,
          cache_hit: cacheHit,
          encontrado: false,
        },
      };
    }

    const snapshot = this.buildSnapshot({
      item,
      convertizeResult,
      searchResult,
      detail,
    });

    return {
      item: {
        ...item,
        nome_recebido: snapshot.nome_recebido,
        dados_brutos: {
          ...(item.dados_brutos || item),
          ...snapshot.dados_brutos,
        },
      },
      enriched: true,
      requiresApproval: !isTrustedNameSource(snapshot.dados_brutos.origem_nome),
      approvalReason: isTrustedNameSource(snapshot.dados_brutos.origem_nome)
        ? null
        : "Nome nao resolvido por Convertize ou FarmaIndex.",
      fontes_consultadas: {
        convertize_busca: Boolean(convertizeResult),
        convertize_busca_error: convertizeLookup.error,
        farmaindex_busca: Boolean(searchResult),
        farmaindex_busca_error: searchLookup.error,
        farmaindex_detalhe: Boolean(detail),
        pt_product_search: false,
        pt_product_search_error: null,
        barcode_lookup: false,
        barcode_lookup_error: null,
        browser_lookup: false,
        browser_lookup_error: null,
        browser_lookup_trail: null,
        cache_hit: cacheHit,
        encontrado: true,
      },
    };
  }

  async getResolutionForEan(ean, session = null) {
    const cache = session?.lookupCache;
    if (!cache) {
      return {
        resolution: await this.resolveExternalSources(ean),
        cacheHit: false,
      };
    }

    if (cache.has(ean)) {
      return {
        resolution: this.cloneValue(await cache.get(ean)),
        cacheHit: true,
      };
    }

    const pendingResolution = this.resolveExternalSources(ean);
    cache.set(ean, pendingResolution);

    try {
      const resolution = await pendingResolution;
      return {
        resolution: this.cloneValue(resolution),
        cacheHit: false,
      };
    } catch (error) {
      cache.delete(ean);
      throw error;
    }
  }

  async resolveExternalSources(ean) {
    const [convertizeLookup, searchLookup] = await Promise.all([
      this.tryConvertizeLookup(ean),
      this.tryFarmaLookup(ean),
    ]);
    const convertizeResult = convertizeLookup.result;
    const searchResult = searchLookup.result;
    const detail = searchResult
      ? await this.farmaIndexClient.buscarDetalhe({
        slug: searchResult.slug,
        medicamentoid: searchResult.medicamentoid,
      })
      : null;

    return {
      convertizeLookup,
      convertizeResult,
      searchLookup,
      searchResult,
      detail,
    };
  }

  cloneValue(value) {
    if (value === undefined) {
      return undefined;
    }

    return JSON.parse(JSON.stringify(value));
  }

  async tryConvertizeLookup(ean) {
    try {
      return {
        result: await this.convertizeClient.buscarPorEan(ean),
        error: null,
      };
    } catch (error) {
      return {
        result: null,
        error: error.message,
      };
    }
  }

  async tryFarmaLookup(ean) {
    try {
      return {
        result: await this.farmaIndexClient.buscarPorEan(ean),
        error: null,
      };
    } catch (error) {
      return {
        result: null,
        error: error.message,
      };
    }
  }

  buildApprovalReason({ convertizeLookup, searchLookup }) {
    const reasons = [];

    if (convertizeLookup?.result) {
      reasons.push("Convertize encontrou resultado.");
    } else if (convertizeLookup?.error) {
      reasons.push(`Convertize falhou: ${convertizeLookup.error}`);
    } else {
      reasons.push("Convertize sem resultado.");
    }

    if (searchLookup?.result) {
      reasons.push("FarmaIndex encontrou resultado.");
    } else if (searchLookup?.error) {
      reasons.push(`FarmaIndex falhou: ${searchLookup.error}`);
    } else {
      reasons.push("FarmaIndex sem resultado.");
    }

    return reasons.join(" ");
  }

  buildSnapshot({
    item,
    convertizeResult = null,
    ptResult = null,
    searchResult = null,
    detail = null,
    barcodeLookupResult = null,
    browserLookupResult = null,
  }) {
    const info = detail?.info || {};
    const raw = item.dados_brutos || item;
    const tipoFallback = this.resolveTipo({ raw, ptResult, searchResult, detail });
    const trustedRawName = isTrustedNameSource(raw.origem_nome)
      ? pickFirstString(raw.nome, raw.nome_produto, raw.nome_exibicao, item.nome_recebido)
      : null;

    const produtoNome = pickFirstString(
      convertizeResult?.nome,
      info.produto,
      searchResult?.produto,
      ptResult?.nome,
      barcodeLookupResult?.nome,
      browserLookupResult?.nome,
      trustedRawName,
    );

    const nomeExibicao = pickFirstString(
      convertizeResult?.nome,
      ptResult?.nome,
      [info.produto, info.apresentacao].filter(Boolean).join(" ").trim(),
      [searchResult?.produto, searchResult?.apresentacao].filter(Boolean).join(" ").trim(),
      barcodeLookupResult?.nome,
      browserLookupResult?.nome,
      trustedRawName,
      produtoNome,
    );

    const farmacos = this.extractFarmacos(detail);

    return {
      nome_recebido: nomeExibicao,
      dados_brutos: {
        ean: String(item.ean || info.gtin || ""),
        nome: produtoNome,
        nome_produto: produtoNome,
        nome_exibicao: nomeExibicao,
        descricao: pickFirstString(info.apresentacao, searchResult?.apresentacao, raw.descricao),
        dose: pickFirstString(info.apresentacao, raw.dose),
        unidade: pickFirstString(info.unidade, raw.unidade),
        forma_farmaceutica: pickFirstString(info.forma_farmaceutica, raw.forma_farmaceutica, raw.forma),
        via_administracao: pickFirstString(info.via_adm, raw.via_administracao),
        quantidade: pickFirstString(info.qtde_fs, raw.quantidade),
        volume: pickFirstString(raw.volume),
        registro_ms: pickFirstString(info.registro, raw.registro_ms, raw.registro),
        tarja: pickFirstString(info.tarja, searchResult?.tarja, raw.tarja),
        laboratorio: pickFirstString(info.laboratorio, searchResult?.laboratorio, raw.laboratorio),
        categoria: pickFirstString(info.classe, info.categoria, raw.categoria),
        tipo: tipoFallback,
        origem_nome: convertizeResult
          ? "convertize"
          : ptResult
            ? "pt_product_search"
          : searchResult
            ? "farmaindex"
            : barcodeLookupResult
              ? "barcode_lookup"
              : browserLookupResult?.origem
                || raw.origem_nome
                || null
        ,
        origem_dados: searchResult
          ? "farmaindex"
          : convertizeResult
            ? "convertize"
            : ptResult
              ? "pt_product_search"
              : barcodeLookupResult
                ? "barcode_lookup"
                : browserLookupResult?.origem
                  || raw.origem_dados
        ,
        farmacos,
      },
    };
  }

  resolveTipo({ raw, ptResult, searchResult, detail }) {
    return classifyProductType({ raw, ptResult, searchResult, detail });
  }

  extractFarmacos(detail) {
    const farmacos = detail?.info?.farmacos;
    if (!Array.isArray(farmacos)) {
      return [];
    }

    return farmacos
      .map((farmaco) => {
        const nome = pickFirstString(farmaco.farmaco);
        if (!nome) {
          return null;
        }

        return {
          nome,
          nome_normalizado: normalizeText(nome),
          slug: farmaco.slug || slugify(nome),
        };
      })
      .filter(Boolean);
  }
}

module.exports = { EnrichmentService };
