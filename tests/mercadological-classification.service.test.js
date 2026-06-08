import { describe, expect, test } from "@jest/globals";
import { MercadologicalClassificationService } from "../src/services/mercadological-classification.service.js";

describe("MercadologicalClassificationService", () => {
  test("usa classificacao da OpenAI para preencher a estrutura final", async () => {
    const treeService = {
      isConfigured: () => true,
      findExactPath: () => null,
      findCandidates: () => [
        {
          id: "taxonomy_1",
          departamento: "Medicamentos",
          categoria: "Dor e Febre",
          subcategoria: "Analgésicos",
          segmento: "Analgésicos",
          subsegmento: "Dipirona",
          path: "Medicamentos > Dor e Febre > Analgésicos > Analgésicos > Dipirona",
        },
      ],
    };

    const openAiClient = {
      isConfigured: () => true,
      classifyProduct: async () => ({
        candidate_id: "taxonomy_1",
        departamento: "Medicamentos",
        categoria: "Dor e Febre",
        subcategoria: "Analgésicos",
        segmento: "Analgésicos",
        subsegmento: "Dipirona",
        principio_ativo: ["Dipirona Monoidratada"],
        confidence: 0.94,
        rationale: "Nome, descricao e principio ativo apontam para dipirona.",
      }),
    };

    const service = new MercadologicalClassificationService({
      treeService,
      openAiClient,
    });

    const result = await service.classifyItem({
      ean: "7899547531213",
      dados_brutos: {
        nome_exibicao: "Dipirona Monoidratada 500mg 30 comprimidos",
        descricao_original: "Dipirona Monoidratada 500mg 30 comprimidos",
        descricao_normalizada: "dipirona monoidratada 500mg 30 comprimidos",
        marca: "Prati",
        laboratorio: "Prati",
      },
    });

    expect(result.dados_brutos.catalogo_normalizado).toEqual({
      ean: "7899547531213",
      descricao_original: "Dipirona Monoidratada 500mg 30 comprimidos",
      descricao_normalizada: "dipirona monoidratada 500mg 30 comprimidos",
      marca: "Prati",
      fabricante: "Prati",
      departamento: "Medicamentos",
      categoria: "Dor e Febre",
      subcategoria: "Analgésicos",
      segmento: "Analgésicos",
      subsegmento: "Dipirona",
      principio_ativo: ["Dipirona Monoidratada"],
    });
    expect(result.dados_brutos.classificacao_mercadologica).toEqual(expect.objectContaining({
      source: "openai",
      confidence: 0.94,
    }));
    expect(result.dados_brutos.farmacos).toEqual([
      { nome: "Dipirona Monoidratada", farmaco: "Dipirona Monoidratada" },
    ]);
  });
});
