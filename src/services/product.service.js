const { classifyProductType } = require("../utils/classifyProductType");
const { uniquePreservingOrder, buildSearchArtifacts } = require("../utils/catalogItem");

const EMBEDDING_DIMENSIONS = 512;

function pickFirstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function isTrustedNameSource(source) {
  return source === "convertize"
    || source === "pt_product_search"
    || source === "farmaindex"
    || source === "barcode_lookup"
    || source === "pt_product_search_browser"
    || source === "barcode_lookup_browser";
}

class ProductService {
  buildSnapshot(item) {
    const raw = item.dados_brutos || item;
    const trustedNameSource = isTrustedNameSource(raw.origem_nome);
    const nomeSocial = pickFirstString(
      trustedNameSource ? raw.nome_produto : null,
      trustedNameSource ? raw.produto : null,
      trustedNameSource ? raw.nome : null,
      trustedNameSource ? item.nome_recebido : null,
    );

    if (!nomeSocial) {
      const error = new Error("Nome do produto nao foi validado por Convertize, FarmaIndex, BarcodeLookup ou browser fallback.");
      error.status = 400;
      throw error;
    }

    const descricaoProduto = pickFirstString(
      trustedNameSource ? raw.nome_exibicao : null,
      trustedNameSource ? raw.nome_venda : null,
      trustedNameSource ? raw.display_name : null,
      trustedNameSource ? item.nome_recebido : null,
      nomeSocial,
    );

    const activeIngredients = Array.isArray(raw.farmacos)
      ? raw.farmacos
        .map((farmaco) => pickFirstString(farmaco?.nome, farmaco?.farmaco))
        .filter(Boolean)
      : [];

    const principioAtivo = activeIngredients.length
      ? uniquePreservingOrder(activeIngredients).join(", ")
      : null;

    const classificacao = pickFirstString(
      raw.categoria,
      raw.departamento,
      raw.grupo,
      raw.classe,
      classifyProductType({ raw }),
    );

    const fabricante = pickFirstString(raw.laboratorio, raw.fabricante, raw.marca);

    const detalhesPayload = {
      ean: String(item.ean),
      dose: pickFirstString(raw.dose),
      unidade: pickFirstString(raw.unidade),
      forma_farmaceutica: pickFirstString(raw.forma_farmaceutica, raw.forma),
      via_administracao: pickFirstString(raw.via_administracao),
      quantidade: pickFirstString(raw.quantidade),
      volume: pickFirstString(raw.volume),
      registro_ms: pickFirstString(raw.registro_ms, raw.registro),
      tarja: pickFirstString(raw.tarja),
      origem_nome: pickFirstString(raw.origem_nome, item.fonte) || "importacao",
      origem_dados: pickFirstString(raw.origem_dados, item.fonte) || "importacao",
      farmacos: activeIngredients.length ? uniquePreservingOrder(activeIngredients) : null,
    };

    const detalhes = JSON.stringify(detalhesPayload);

    const searchArtifacts = buildSearchArtifacts([
      descricaoProduto,
      nomeSocial,
      principioAtivo,
      classificacao,
      fabricante,
      detalhesPayload.dose,
      detalhesPayload.unidade,
      detalhesPayload.forma_farmaceutica,
      detalhesPayload.via_administracao,
      detalhesPayload.quantidade,
      detalhesPayload.volume,
      detalhesPayload.registro_ms,
      detalhesPayload.tarja,
    ]);

    return {
      ean: String(item.ean),
      descricaoProduto,
      principioAtivo,
      classificacao,
      nomeSocial,
      fabricante,
      detalhes,
      debug_searchable_text: searchArtifacts.searchable_text,
      debug_normalized_searchable_text: searchArtifacts.normalized_searchable_text,
      debug_tokens: searchArtifacts.tokens,
      debug_token_count: searchArtifacts.token_count,
      debug_embedding_dimensions: EMBEDDING_DIMENSIONS,
    };
  }
}

module.exports = { ProductService, EMBEDDING_DIMENSIONS };
