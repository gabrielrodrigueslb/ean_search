import { classifyProductType } from "../utils/classifyProductType.js";
import env from "../config/env.js";
import { normalizeText } from "../utils/normalizeText.js";
import { createDefaultProductLookupSourceRegistry } from "../providers/default-registries.js";
import {
  formatSourceLabel,
  formatSourceList,
  isPassThroughSource,
  isTrustedNameSource,
  normalizeSourceKey,
  normalizeSourceKeys,
} from "../utils/productSourcePolicy.js";
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

function extractDoseFromText(value) {
  const text = pickFirstString(value);
  if (!text) {
    return null;
  }

  const compactText = text.replace(/\s+/g, " ").trim();
  if (compactText.length > 160) {
    return null;
  }

  const match = compactText.match(
    /\b\d+(?:[.,]\d+)?\s*(?:mg|mcg|g|kg|ml|l|ui|mui|meq|%)(?:\s*\/\s*\d+(?:[.,]\d+)?\s*(?:ml|g|l))?(?:\s*\+\s*\d+(?:[.,]\d+)?\s*(?:mg|mcg|g|kg|ml|l|ui|mui|meq|%)(?:\s*\/\s*\d+(?:[.,]\d+)?\s*(?:ml|g|l))?)*/i,
  );

  return pickFirstString(match?.[0]);
}

class EnrichmentService {
  constructor({
    lookupSourceRegistry,
    trustedNameSources = env.lookupTrustedNameSources,
    preferredNameSources = env.lookupPreferredNameSources,
    preferredDataSources = env.lookupPreferredDataSources,
    passThroughSources = env.lookupPassThroughSources,
  } = {}) {
    this.lookupSourceRegistry = lookupSourceRegistry || createDefaultProductLookupSourceRegistry();
    this.trustedNameSources = normalizeSourceKeys(trustedNameSources);
    this.preferredNameSources = normalizeSourceKeys([
      ...preferredNameSources,
      ...this.trustedNameSources,
    ]);
    this.preferredDataSources = normalizeSourceKeys([
      ...preferredDataSources,
      ...this.trustedNameSources,
    ]);
    this.passThroughSources = normalizeSourceKeys(passThroughSources);
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
      lookups,
      nameLookup,
      dataLookup,
      detail,
    } = resolution;
    const hasAnyLookupMatch = this.anyLookupMatched(lookups);
    const fontesConsultadas = {
      ...this.buildLookupStatus(lookups),
      cache_hit: cacheHit,
    };

    if (!hasAnyLookupMatch) {
      const raw = item.dados_brutos || item;
      const source = raw?.origem_nome || raw?.origem_dados || item?.fonte || null;
      const fallbackName = pickFirstString(
        raw?.nome_exibicao,
        raw?.nome_produto,
        raw?.nome,
        item?.nome_recebido,
      );

      if (this.isPassThroughSource(source) && fallbackName) {
        const normalizedSource = normalizeSourceKey(source);

        return {
          item: {
            ...item,
            nome_recebido: fallbackName,
            dados_brutos: {
              ...raw,
              nome: pickFirstString(raw?.nome, fallbackName),
              nome_produto: pickFirstString(raw?.nome_produto, fallbackName),
              nome_exibicao: pickFirstString(raw?.nome_exibicao, fallbackName),
              origem_nome: normalizedSource,
              origem_dados: raw?.origem_dados || normalizedSource,
            },
          },
          enriched: true,
          requiresApproval: false,
          approvalReason: null,
          fontes_consultadas: {
            ...fontesConsultadas,
            encontrado: true,
            pass_through_source: normalizedSource,
          },
        };
      }

      const approvalReason = this.buildApprovalReason({ lookups });

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
          ...fontesConsultadas,
          encontrado: false,
        },
      };
    }

    const snapshot = this.buildSnapshot({
      item,
      nameLookup,
      dataLookup,
      detail,
    });
    const trustedNameResolved = this.isTrustedNameSource(snapshot.dados_brutos.origem_nome);

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
      requiresApproval: !trustedNameResolved,
      approvalReason: trustedNameResolved
        ? null
        : `Nome nao resolvido por ${formatSourceList(this.trustedNameSources)}.`,
      fontes_consultadas: {
        ...fontesConsultadas,
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
    const lookups = this.normalizeLookups(await this.lookupSourceRegistry.lookupByEan(ean));
    const nameLookup = this.pickPreferredLookup(
      lookups,
      this.preferredNameSources,
      (lookup) => Boolean(this.getLookupPrimaryName(lookup)),
    ) || this.pickFirstLookup(lookups, (lookup) => Boolean(this.getLookupPrimaryName(lookup)));
    const detailLookup = this.pickPreferredLookup(
      lookups,
      this.preferredDataSources,
      (lookup) => Boolean(lookup.detail),
    ) || this.pickFirstLookup(lookups, (lookup) => Boolean(lookup.detail));
    const fallbackDataLookup = this.pickPreferredLookup(
      lookups,
      this.preferredDataSources,
      (lookup) => this.lookupHasMatch(lookup),
    ) || this.pickFirstLookup(lookups, (lookup) => this.lookupHasMatch(lookup));
    const dataLookup = detailLookup || fallbackDataLookup || nameLookup || null;

    return {
      lookups,
      nameLookup: nameLookup || dataLookup || null,
      dataLookup,
      detail: dataLookup?.detail || null,
    };
  }

  emptyLookup() {
    return {
      result: null,
      detail: null,
      error: null,
      skipped: false,
      skip_reason: null,
    };
  }

  cloneValue(value) {
    if (value === undefined) {
      return undefined;
    }

    return JSON.parse(JSON.stringify(value));
  }

  normalizeLookups(lookups = {}) {
    return Object.fromEntries(
      Object.entries(lookups || {}).map(([sourceKey, lookup]) => [
        sourceKey,
        {
          key: lookup?.key || sourceKey,
          result: lookup?.result || null,
          detail: lookup?.detail || null,
          error: lookup?.error || null,
          skipped: lookup?.skipped === true,
          skip_reason: lookup?.skip_reason || null,
        },
      ]),
    );
  }

  getOrderedSourceKeys(lookups = {}) {
    const activeKeys = Object.keys(lookups);

    return normalizeSourceKeys([
      ...this.preferredNameSources,
      ...this.preferredDataSources,
      ...activeKeys,
    ]).filter((sourceKey) => activeKeys.includes(sourceKey));
  }

  pickPreferredLookup(lookups = {}, sourcePriority = [], predicate = null) {
    for (const sourceKey of normalizeSourceKeys(sourcePriority)) {
      const lookup = lookups[sourceKey];

      if (!lookup) {
        continue;
      }

      if (!predicate || predicate(lookup)) {
        return lookup;
      }
    }

    return null;
  }

  pickFirstLookup(lookups = {}, predicate = null) {
    for (const sourceKey of this.getOrderedSourceKeys(lookups)) {
      const lookup = lookups[sourceKey];

      if (!lookup) {
        continue;
      }

      if (!predicate || predicate(lookup)) {
        return lookup;
      }
    }

    return null;
  }

  lookupHasMatch(lookup) {
    return Boolean(lookup?.result || lookup?.detail);
  }

  anyLookupMatched(lookups = {}) {
    return Object.values(lookups).some((lookup) => this.lookupHasMatch(lookup));
  }

  getLookupPrimaryName(lookup) {
    if (!lookup) {
      return null;
    }

    return pickFirstString(
      lookup?.result?.nome,
      lookup?.result?.nome_produto,
      lookup?.result?.produto,
      lookup?.result?.title,
      lookup?.result?.name,
      lookup?.detail?.info?.produto,
    );
  }

  getLookupDisplayName(lookup) {
    if (!lookup) {
      return null;
    }

    return pickFirstString(
      lookup?.result?.nome_exibicao,
      lookup?.result?.display_name,
      lookup?.result?.nome,
      [lookup?.result?.produto, lookup?.result?.apresentacao].filter(Boolean).join(" ").trim(),
      [lookup?.detail?.info?.produto, lookup?.detail?.info?.apresentacao].filter(Boolean).join(" ").trim(),
    );
  }

  buildLookupMetricKey(sourceKey) {
    return normalizeSourceKey(sourceKey).replace(/[^a-z0-9]+/g, "_");
  }

  buildLookupStatus(lookups = {}) {
    return this.getOrderedSourceKeys(lookups).reduce((acc, sourceKey) => {
      const lookup = lookups[sourceKey];
      const metricKey = this.buildLookupMetricKey(sourceKey);

      acc[`${metricKey}_busca`] = Boolean(lookup?.result);
      acc[`${metricKey}_busca_error`] = lookup?.error || null;
      acc[`${metricKey}_detalhe`] = Boolean(lookup?.detail);
      acc[`${metricKey}_skipped`] = lookup?.skipped === true;
      acc[`${metricKey}_skip_reason`] = lookup?.skip_reason || null;

      return acc;
    }, {});
  }

  buildApprovalReason({ lookups }) {
    const reasons = [];

    for (const sourceKey of this.getOrderedSourceKeys(lookups)) {
      const lookup = lookups[sourceKey];
      const label = formatSourceLabel(sourceKey);

      if (this.lookupHasMatch(lookup)) {
        reasons.push(`${label} encontrou resultado.`);
      } else if (lookup?.skipped) {
        reasons.push(`${label} nao foi consultada porque uma fonte anterior resolveu o EAN.`);
      } else if (lookup?.error) {
        reasons.push(`${label} falhou: ${lookup.error}`);
      } else {
        reasons.push(`${label} sem resultado.`);
      }
    }

    return reasons.join(" ") || "Nenhuma fonte externa configurada.";
  }

  buildSnapshot({
    item,
    convertizeResult = null,
    searchResult = null,
    detail = null,
    nameLookup = null,
    dataLookup = null,
  }) {
    const raw = item.dados_brutos || item;
    const legacyConvertizeLookup = convertizeResult
      ? {
        key: "convertize",
        result: convertizeResult,
        detail: null,
        error: null,
      }
      : null;
    const legacyFarmaIndexLookup = (searchResult || detail)
      ? {
        key: "farmaindex",
        result: searchResult,
        detail,
        error: null,
      }
      : null;
    const resolvedNameLookup = nameLookup || legacyConvertizeLookup || legacyFarmaIndexLookup;
    const resolvedDataLookup = dataLookup || legacyFarmaIndexLookup || legacyConvertizeLookup;
    const effectiveDetail = resolvedDataLookup?.detail || detail || null;
    const structuredResult = resolvedDataLookup?.result || searchResult || null;
    const info = effectiveDetail?.info || {};
    const tipoFallback = this.resolveTipo({
      raw,
      ptResult: null,
      searchResult: structuredResult,
      detail: effectiveDetail,
    });
    const trustedRawName = this.isTrustedNameSource(raw.origem_nome)
      ? pickFirstString(raw.nome, raw.nome_produto, raw.nome_exibicao, item.nome_recebido)
      : null;

    const produtoNome = pickFirstString(
      this.getLookupPrimaryName(resolvedNameLookup),
      info.produto,
      this.getLookupPrimaryName(resolvedDataLookup),
      trustedRawName,
    );

    const nomeExibicao = pickFirstString(
      this.getLookupDisplayName(resolvedNameLookup),
      [info.produto, info.apresentacao].filter(Boolean).join(" ").trim(),
      this.getLookupDisplayName(resolvedDataLookup),
      trustedRawName,
      produtoNome,
    );

    const farmacos = this.extractFarmacos(effectiveDetail);
    const descricaoOriginal = pickFirstString(
      info.descricao_original,
      structuredResult?.descricao_original,
      raw.descricao_original,
      nomeExibicao,
      produtoNome,
    );
    const ingredienteAtivo = pickFirstString(
      info.ingrediente_ativo,
      structuredResult?.ingrediente_ativo,
      raw.ingrediente_ativo,
      farmacos.map((farmaco) => farmaco.nome).filter(Boolean).join(", "),
    );

    return {
      nome_recebido: nomeExibicao,
      dados_brutos: {
        ean: String(item.ean || info.gtin || ""),
        nome: produtoNome,
        nome_produto: produtoNome,
        nome_exibicao: nomeExibicao,
        descricao: pickFirstString(
          info.descricao,
          info.apresentacao,
          structuredResult?.descricao,
          structuredResult?.apresentacao,
          raw.descricao,
        ),
        descricao_original: descricaoOriginal,
        descricao_normalizada: pickFirstString(
          info.descricao_normalizada,
          structuredResult?.descricao_normalizada,
          raw.descricao_normalizada,
          descricaoOriginal ? normalizeText(descricaoOriginal) : null,
        ),
        dose: pickFirstString(
          info.dose,
          structuredResult?.dose,
          raw.dose,
          extractDoseFromText(info.apresentacao),
          extractDoseFromText(structuredResult?.apresentacao),
        ),
        unidade: pickFirstString(info.unidade, raw.unidade),
        forma_farmaceutica: pickFirstString(info.forma_farmaceutica, raw.forma_farmaceutica, raw.forma),
        via_administracao: pickFirstString(info.via_adm, raw.via_administracao),
        quantidade: pickFirstString(info.qtde_fs, structuredResult?.quantidade, raw.quantidade),
        volume: pickFirstString(raw.volume),
        registro_ms: pickFirstString(info.registro, raw.registro_ms, raw.registro),
        tarja: pickFirstString(info.tarja, structuredResult?.tarja, raw.tarja),
        laboratorio: pickFirstString(info.laboratorio, structuredResult?.laboratorio, raw.laboratorio),
        fabricante: pickFirstString(
          info.fabricante,
          structuredResult?.fabricante,
          raw.fabricante,
          info.laboratorio,
          structuredResult?.laboratorio,
        ),
        departamento: pickFirstString(info.departamento, structuredResult?.departamento, raw.departamento),
        categoria: pickFirstString(info.classe, info.categoria, raw.categoria),
        subcategoria: pickFirstString(info.subcategoria, structuredResult?.subcategoria, raw.subcategoria),
        segmento: pickFirstString(info.segmento, structuredResult?.segmento, raw.segmento),
        subsegmento: pickFirstString(info.subsegmento, structuredResult?.subsegmento, raw.subsegmento),
        ingrediente_ativo: ingredienteAtivo || null,
        tipo: tipoFallback,
        origem_nome: resolvedNameLookup?.key
          || resolvedDataLookup?.key
          || raw.origem_nome
          || null,
        origem_dados: resolvedDataLookup?.key
          || resolvedNameLookup?.key
          || raw.origem_dados,
        farmacos,
      },
    };
  }

  isTrustedNameSource(source) {
    return isTrustedNameSource(source, this.trustedNameSources);
  }

  isPassThroughSource(source) {
    return isPassThroughSource(source, this.passThroughSources);
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

export { EnrichmentService };
