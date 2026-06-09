import { classifyProductType } from "../utils/classifyProductType.js";
import env from "../config/env.js";
import { uniquePreservingOrder, buildSearchArtifacts } from "../utils/catalogItem.js";
import {
  formatSourceList,
  isPublishableNameSource,
  normalizeSourceKeys,
} from "../utils/productSourcePolicy.js";
const EMBEDDING_DIMENSIONS = 512;

function pickFirstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

class ProductService {
  constructor({
    trustedNameSources = env.lookupTrustedNameSources,
    passThroughSources = env.lookupPassThroughSources,
  } = {}) {
    this.trustedNameSources = normalizeSourceKeys(trustedNameSources);
    this.passThroughSources = normalizeSourceKeys(passThroughSources);
  }

  buildSnapshot(item) {
    const raw = item.dados_brutos || item;
    const trustedNameSource = isPublishableNameSource(raw.origem_nome, {
      trustedSources: this.trustedNameSources,
      passThroughSources: this.passThroughSources,
      allowFallbackRawName: raw.raw_name_fallback_approved === true,
    });
    const nomeSocial = pickFirstString(
      trustedNameSource ? raw.nome_produto : null,
      trustedNameSource ? raw.produto : null,
      trustedNameSource ? raw.nome : null,
      trustedNameSource ? item.nome_recebido : null,
    );

    if (!nomeSocial) {
      const error = new Error(
        `Nome do produto nao foi validado por ${formatSourceList([
          ...this.trustedNameSources,
          ...this.passThroughSources,
        ])}.`,
      );
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
      : String(raw.ingrediente_ativo || "")
        .split(/[,;/]| e /i)
        .map((item) => item.trim())
        .filter(Boolean);

    const principioAtivo = activeIngredients.length
      ? uniquePreservingOrder(activeIngredients).join(", ")
      : null;

    const classificacao = pickFirstString(
      raw.subcategoria,
      raw.categoria,
      raw.departamento,
      raw.segmento,
      raw.subsegmento,
      raw.departamento,
      raw.grupo,
      raw.classe,
      classifyProductType({ raw }),
    );

    const fabricante = pickFirstString(raw.laboratorio, raw.fabricante, raw.marca);
    const finalStructure = raw.catalogo_normalizado || {
      ean: String(item.ean),
      descricao_original: pickFirstString(raw.descricao_original),
      descricao_normalizada: pickFirstString(raw.descricao_normalizada),
      marca: pickFirstString(raw.marca),
      fabricante,
      departamento: pickFirstString(raw.departamento),
      categoria: pickFirstString(raw.categoria),
      subcategoria: pickFirstString(raw.subcategoria),
      segmento: pickFirstString(raw.segmento),
      subsegmento: pickFirstString(raw.subsegmento),
      principio_ativo: activeIngredients.length ? uniquePreservingOrder(activeIngredients) : [],
    };

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
      descricao_original: pickFirstString(raw.descricao_original),
      descricao_normalizada: pickFirstString(raw.descricao_normalizada),
      departamento: pickFirstString(raw.departamento),
      categoria: pickFirstString(raw.categoria),
      subcategoria: pickFirstString(raw.subcategoria),
      segmento: pickFirstString(raw.segmento),
      subsegmento: pickFirstString(raw.subsegmento),
      ingrediente_ativo: pickFirstString(raw.ingrediente_ativo),
      farmacos: activeIngredients.length ? uniquePreservingOrder(activeIngredients) : null,
      estrutura_final: finalStructure,
      classificacao_mercadologica: raw.classificacao_mercadologica || null,
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
      detalhesPayload.departamento,
      detalhesPayload.subcategoria,
      detalhesPayload.segmento,
      detalhesPayload.subsegmento,
      detalhesPayload.ingrediente_ativo,
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
      departamento: pickFirstString(finalStructure.departamento, raw.departamento),
      categoria: pickFirstString(finalStructure.categoria, raw.categoria),
      subcategoria: pickFirstString(finalStructure.subcategoria, raw.subcategoria),
      segmento: pickFirstString(finalStructure.segmento, raw.segmento),
      subsegmento: pickFirstString(finalStructure.subsegmento, raw.subsegmento),
      detalhes,
      debug_searchable_text: searchArtifacts.searchable_text,
      debug_normalized_searchable_text: searchArtifacts.normalized_searchable_text,
      debug_tokens: searchArtifacts.tokens,
      debug_token_count: searchArtifacts.token_count,
      debug_embedding_dimensions: EMBEDDING_DIMENSIONS,
    };
  }
}

export { ProductService, EMBEDDING_DIMENSIONS };
