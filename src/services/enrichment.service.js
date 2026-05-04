const { FarmaIndexClient } = require("../integrations/farmaindex.client");
const { BarcodeLookupClient } = require("../integrations/barcode-lookup.client");
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
  return source === "pt_product_search" || source === "farmaindex" || source === "barcode_lookup";
}

class EnrichmentService {
  constructor() {
    this.farmaIndexClient = new FarmaIndexClient();
    this.barcodeLookupClient = new BarcodeLookupClient();
    this.ptProductSearchClient = new PtProductSearchClient();
  }

  async enrichImportedItem(item) {
    const ean = String(item.ean || "");
    const ptLookup = await this.tryPtLookup(ean);
    const ptResult = ptLookup.result;
    const searchLookup = await this.tryFarmaLookup(ean);
    const searchResult = searchLookup.result;
    const barcodeLookup = !searchResult && !ptResult
      ? await this.tryBarcodeLookup(ean)
      : null;
    const barcodeLookupResult = barcodeLookup?.result || null;

    if (!searchResult && !ptResult && !barcodeLookupResult) {
      const approvalReason = this.buildApprovalReason({
        ptLookup,
        searchLookup,
        barcodeLookup,
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
          encontrado: false,
        },
      };
    }

    const detail = searchResult
      ? await this.farmaIndexClient.buscarDetalhe({
        slug: searchResult.slug,
        medicamentoid: searchResult.medicamentoid,
      })
      : null;

    const snapshot = this.buildSnapshot({ item, ptResult, searchResult, detail, barcodeLookupResult });

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
        encontrado: true,
      },
    };
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

  buildApprovalReason({ ptLookup, searchLookup, barcodeLookup }) {
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

    return reasons.join(" ");
  }

  buildSnapshot({ item, ptResult, searchResult, detail, barcodeLookupResult }) {
    const info = detail?.info || {};
    const raw = item.dados_brutos || item;
    const tipoFallback = this.resolveTipo({ raw, ptResult, searchResult, detail });

    const produtoNome = pickFirstString(
      info.produto,
      searchResult?.produto,
      ptResult?.nome,
      barcodeLookupResult?.nome,
    );

    const nomeExibicao = pickFirstString(
      ptResult?.nome,
      [info.produto, info.apresentacao].filter(Boolean).join(" ").trim(),
      [searchResult?.produto, searchResult?.apresentacao].filter(Boolean).join(" ").trim(),
      barcodeLookupResult?.nome,
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
        origem_nome: ptResult ? "pt_product_search" : searchResult ? "farmaindex" : barcodeLookupResult ? "barcode_lookup" : null,
        origem_dados: searchResult ? "farmaindex" : ptResult ? "pt_product_search" : barcodeLookupResult ? "barcode_lookup" : raw.origem_dados,
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
