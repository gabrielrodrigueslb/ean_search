const { FarmaIndexClient } = require("../integrations/farmaindex.client");
const { BarcodeLookupClient } = require("../integrations/barcode-lookup.client");
const { BrowserNameLookupClient } = require("../integrations/browser-name-lookup.client");
const { PtProductSearchClient } = require("../integrations/pt-product-search.client");
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
  return source === "pt_product_search"
    || source === "farmaindex"
    || source === "barcode_lookup"
    || source === "pt_product_search_browser"
    || source === "barcode_lookup_browser";
}

class EnrichmentService {
  constructor() {
    this.farmaIndexClient = new FarmaIndexClient();
    this.barcodeLookupClient = new BarcodeLookupClient();
    this.browserNameLookupClient = new BrowserNameLookupClient();
    this.ptProductSearchClient = new PtProductSearchClient();
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
      ptLookup,
      ptResult,
      searchLookup,
      searchResult,
      barcodeLookup,
      barcodeLookupResult,
      browserLookup,
      browserLookupResult,
      detail,
    } = resolution;

    if (!searchResult && !ptResult && !barcodeLookupResult && !browserLookupResult) {
      const approvalReason = this.buildApprovalReason({
        ptLookup,
        searchLookup,
        barcodeLookup,
        browserLookup,
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
          pt_product_search: Boolean(ptResult),
          pt_product_search_error: ptLookup.error,
          farmaindex_busca: Boolean(searchResult),
          farmaindex_busca_error: searchLookup.error,
          farmaindex_detalhe: false,
          barcode_lookup: Boolean(barcodeLookupResult),
          barcode_lookup_error: barcodeLookup?.error || null,
          browser_lookup: Boolean(browserLookupResult),
          browser_lookup_error: browserLookup?.error || null,
          browser_lookup_trail: browserLookup?.trail || null,
          cache_hit: cacheHit,
          encontrado: false,
        },
      };
    }

    const snapshot = this.buildSnapshot({
      item,
      ptResult,
      searchResult,
      detail,
      barcodeLookupResult,
      browserLookupResult,
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
        : "Nome nao resolvido por PT.ProductSearch ou FarmaIndex.",
      fontes_consultadas: {
        pt_product_search: Boolean(ptResult),
        pt_product_search_error: ptLookup.error,
        farmaindex_busca: Boolean(searchResult),
        farmaindex_busca_error: searchLookup.error,
        farmaindex_detalhe: Boolean(detail),
        barcode_lookup: Boolean(barcodeLookupResult),
        barcode_lookup_error: barcodeLookup?.error || null,
        browser_lookup: Boolean(browserLookupResult),
        browser_lookup_error: browserLookup?.error || null,
        browser_lookup_trail: browserLookup?.trail || null,
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
    const ptLookup = await this.tryPtLookup(ean);
    const ptResult = ptLookup.result;
    const searchLookup = await this.tryFarmaLookup(ean);
    const searchResult = searchLookup.result;
    const barcodeLookup = !searchResult && !ptResult
      ? await this.tryBarcodeLookup(ean)
      : null;
    const barcodeLookupResult = barcodeLookup?.result || null;
    const browserLookup = !searchResult && !ptResult && !barcodeLookupResult
      ? await this.tryBrowserLookup(ean)
      : null;
    const browserLookupResult = browserLookup?.result || null;
    const detail = searchResult
      ? await this.farmaIndexClient.buscarDetalhe({
        slug: searchResult.slug,
        medicamentoid: searchResult.medicamentoid,
      })
      : null;

    return {
      ptLookup,
      ptResult,
      searchLookup,
      searchResult,
      barcodeLookup,
      barcodeLookupResult,
      browserLookup,
      browserLookupResult,
      detail,
    };
  }

  cloneValue(value) {
    if (value === undefined) {
      return undefined;
    }

    return JSON.parse(JSON.stringify(value));
  }

  async tryPtLookup(ean) {
    try {
      return {
        result: await this.ptProductSearchClient.buscarNomePorEan(ean),
        error: null,
      };
    } catch (error) {
      return {
        result: null,
        error: error.message,
      };
    }
  }

  async tryBarcodeLookup(ean) {
    try {
      return {
        result: await this.barcodeLookupClient.buscarNomePorEan(ean),
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

  async tryBrowserLookup(ean) {
    try {
      const outcome = await this.browserNameLookupClient.buscarNomePorEan(ean);
      return {
        result: outcome.result,
        trail: outcome.trail || [],
        error: null,
      };
    } catch (error) {
      return {
        result: null,
        trail: [],
        error: error.message,
      };
    }
  }

  buildApprovalReason({ ptLookup, searchLookup, barcodeLookup, browserLookup }) {
    const reasons = [];

    if (ptLookup?.result) {
      reasons.push("PT.ProductSearch encontrou resultado.");
    } else if (ptLookup?.error) {
      reasons.push(`PT.ProductSearch falhou: ${ptLookup.error}`);
    } else {
      reasons.push("PT.ProductSearch sem resultado.");
    }

    if (searchLookup?.result) {
      reasons.push("FarmaIndex encontrou resultado.");
    } else if (searchLookup?.error) {
      reasons.push(`FarmaIndex falhou: ${searchLookup.error}`);
    } else {
      reasons.push("FarmaIndex sem resultado.");
    }

    if (barcodeLookup?.result) {
      reasons.push("BarcodeLookup encontrou resultado.");
    } else if (barcodeLookup?.error) {
      reasons.push(`BarcodeLookup falhou: ${barcodeLookup.error}`);
    } else {
      reasons.push("BarcodeLookup sem resultado.");
    }

    if (browserLookup?.result) {
      reasons.push(`Browser fallback encontrou resultado em ${browserLookup.result.origem}.`);
    } else if (browserLookup?.error) {
      reasons.push(`Browser fallback falhou: ${browserLookup.error}`);
    } else if (Array.isArray(browserLookup?.trail) && browserLookup.trail.length) {
      const trailSummary = browserLookup.trail
        .map((entry) => `${entry.source}: ${entry.nome ? "ok" : entry.error || "sem resultado"}`)
        .join("; ");
      reasons.push(`Browser fallback sem resultado. ${trailSummary}`);
    } else {
      reasons.push("Browser fallback nao executado.");
    }

    return reasons.join(" ");
  }

  buildSnapshot({ item, ptResult, searchResult, detail, barcodeLookupResult, browserLookupResult }) {
    const info = detail?.info || {};
    const raw = item.dados_brutos || item;
    const tipoFallback = this.resolveTipo({ raw, ptResult, searchResult, detail });

    const produtoNome = pickFirstString(
      info.produto,
      searchResult?.produto,
      ptResult?.nome,
      barcodeLookupResult?.nome,
      browserLookupResult?.nome,
    );

    const nomeExibicao = pickFirstString(
      ptResult?.nome,
      [info.produto, info.apresentacao].filter(Boolean).join(" ").trim(),
      [searchResult?.produto, searchResult?.apresentacao].filter(Boolean).join(" ").trim(),
      barcodeLookupResult?.nome,
      browserLookupResult?.nome,
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
        origem_nome: ptResult
          ? "pt_product_search"
          : searchResult
            ? "farmaindex"
            : barcodeLookupResult
              ? "barcode_lookup"
              : browserLookupResult?.origem || null,
        origem_dados: searchResult
          ? "farmaindex"
          : ptResult
            ? "pt_product_search"
            : barcodeLookupResult
              ? "barcode_lookup"
              : browserLookupResult?.origem || raw.origem_dados,
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
