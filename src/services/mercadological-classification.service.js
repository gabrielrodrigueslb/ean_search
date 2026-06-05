import env from "../config/env.js";
import { OpenAiMercadologicalClient } from "../integrations/openai-mercadological.client.js";
import { normalizeText } from "../utils/normalizeText.js";
import { MercadologicalTreeService } from "./mercadological-tree.service.js";

function pickFirstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(String(value).trim());
  }

  return result;
}

function ingredientListFromRaw(raw = {}) {
  if (Array.isArray(raw.farmacos) && raw.farmacos.length) {
    return uniqueStrings(
      raw.farmacos
        .map((farmaco) => pickFirstString(farmaco?.nome, farmaco?.farmaco))
        .filter(Boolean),
    );
  }

  return uniqueStrings(
    String(raw.ingrediente_ativo || "")
      .split(/[,;/]| e /i)
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function buildSearchText(raw = {}, ingredients = []) {
  return [
    raw.nome_exibicao,
    raw.nome_produto,
    raw.nome,
    raw.descricao_original,
    raw.descricao,
    raw.departamento,
    raw.categoria,
    raw.subcategoria,
    raw.segmento,
    raw.subsegmento,
    raw.marca,
    raw.fabricante,
    raw.laboratorio,
    ingredients.join(" "),
  ].filter(Boolean).join(" ");
}

function buildFarmacos(ingredients = []) {
  return ingredients.map((name) => ({
    nome: name,
    farmaco: name,
  }));
}

class MercadologicalClassificationService {
  constructor({
    treeService,
    openAiClient,
    aiEnabled = env.mercadologicalAiEnabled,
    candidateLimit = env.mercadologicalAiCandidateLimit,
  } = {}) {
    this.treeService = treeService || new MercadologicalTreeService();
    this.openAiClient = openAiClient || new OpenAiMercadologicalClient();
    this.aiEnabled = aiEnabled;
    this.candidateLimit = candidateLimit;
  }

  isEnabled() {
    return this.treeService.isConfigured();
  }

  async classifyItem(item) {
    const raw = item?.dados_brutos || item || {};
    const existingIngredients = ingredientListFromRaw(raw);
    const productContext = {
      ean: String(item?.ean || raw?.ean || ""),
      descricao_original: pickFirstString(raw.descricao_original, raw.nome_exibicao, raw.nome_produto, raw.nome),
      descricao_normalizada: pickFirstString(raw.descricao_normalizada),
      marca: pickFirstString(raw.marca),
      fabricante: pickFirstString(raw.fabricante, raw.laboratorio, raw.marca),
      departamento: pickFirstString(raw.departamento),
      categoria: pickFirstString(raw.categoria),
      subcategoria: pickFirstString(raw.subcategoria),
      segmento: pickFirstString(raw.segmento),
      subsegmento: pickFirstString(raw.subsegmento),
      principio_ativo: existingIngredients,
    };

    if (!this.isEnabled()) {
      return this.buildClassifiedItem(item, productContext, {
        source: "disabled",
        confidence: 0,
        candidateCount: 0,
        rationale: "Classificacao mercadologica desabilitada ou CSV nao configurado.",
      });
    }

    const exactEntry = this.treeService.findExactPath(productContext);
    if (exactEntry) {
      return this.buildClassifiedItem(item, {
        ...productContext,
        ...exactEntry,
      }, {
        source: "existing_exact_match",
        confidence: 1,
        candidateCount: 1,
        rationale: "Classificacao ja existente e validada na arvore mercadologica.",
      });
    }

    const candidates = this.treeService.findCandidates({
      ...productContext,
      searchText: buildSearchText(raw, existingIngredients),
    }, this.candidateLimit);

    if (!candidates.length) {
      return this.buildClassifiedItem(item, productContext, {
        source: "no_candidates",
        confidence: 0,
        candidateCount: 0,
        rationale: "Nenhum candidato mercadologico foi encontrado para o produto.",
      });
    }

    if (this.aiEnabled && this.openAiClient.isConfigured()) {
      try {
        const aiResult = await this.openAiClient.classifyProduct({
          product: productContext,
          candidates: candidates.map((candidate) => ({
            id: candidate.id,
            departamento: candidate.departamento,
            categoria: candidate.categoria,
            subcategoria: candidate.subcategoria,
            segmento: candidate.segmento,
            subsegmento: candidate.subsegmento,
            path: candidate.path,
          })),
        });
        const selected = candidates.find((candidate) => candidate.id === aiResult.candidate_id) || candidates[0];

        return this.buildClassifiedItem(item, {
          ...productContext,
          ...selected,
          principio_ativo: uniqueStrings([
            ...existingIngredients,
            ...(Array.isArray(aiResult.principio_ativo) ? aiResult.principio_ativo : []),
          ]),
        }, {
          source: "openai",
          confidence: Number(aiResult.confidence || 0),
          candidateCount: candidates.length,
          rationale: aiResult.rationale || null,
          selectedCandidateId: selected.id,
        });
      } catch (error) {
        return this.buildHeuristicFallback(item, productContext, candidates, error.message);
      }
    }

    return this.buildHeuristicFallback(item, productContext, candidates, null);
  }

  buildHeuristicFallback(item, productContext, candidates, errorMessage = null) {
    const selected = candidates[0];

    return this.buildClassifiedItem(item, {
      ...productContext,
      ...selected,
    }, {
      source: errorMessage ? "heuristic_after_openai_error" : "heuristic",
      confidence: 0.35,
      candidateCount: candidates.length,
      rationale: errorMessage
        ? `Fallback heuristico apos falha da OpenAI: ${errorMessage}`
        : "Melhor candidato escolhido por score lexical e sinais ja presentes no produto.",
      selectedCandidateId: selected.id,
    });
  }

  buildClassifiedItem(item, classified, metadata) {
    const ingredients = uniqueStrings(classified.principio_ativo || []);
    const baseRaw = item?.dados_brutos || item || {};
    const finalStructure = {
      ean: String(item?.ean || baseRaw?.ean || ""),
      descricao_original: pickFirstString(
        classified.descricao_original,
        baseRaw.descricao_original,
        baseRaw.nome_exibicao,
        baseRaw.nome_produto,
        baseRaw.nome,
      ),
      descricao_normalizada: pickFirstString(
        classified.descricao_normalizada,
        baseRaw.descricao_normalizada,
      ),
      marca: pickFirstString(classified.marca, baseRaw.marca),
      fabricante: pickFirstString(classified.fabricante, baseRaw.fabricante, baseRaw.laboratorio, baseRaw.marca),
      departamento: pickFirstString(classified.departamento),
      categoria: pickFirstString(classified.categoria),
      subcategoria: pickFirstString(classified.subcategoria),
      segmento: pickFirstString(classified.segmento),
      subsegmento: pickFirstString(classified.subsegmento),
      principio_ativo: ingredients,
    };

    return {
      ...item,
      dados_brutos: {
        ...baseRaw,
        fabricante: finalStructure.fabricante,
        departamento: finalStructure.departamento,
        categoria: finalStructure.categoria,
        subcategoria: finalStructure.subcategoria,
        segmento: finalStructure.segmento,
        subsegmento: finalStructure.subsegmento,
        ingrediente_ativo: ingredients.join(", ") || pickFirstString(baseRaw.ingrediente_ativo),
        farmacos: ingredients.length ? buildFarmacos(ingredients) : baseRaw.farmacos,
        catalogo_normalizado: finalStructure,
        classificacao_mercadologica: metadata,
      },
    };
  }
}

export { MercadologicalClassificationService };
