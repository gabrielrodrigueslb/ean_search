import { describe, expect, test } from "@jest/globals";
import { EnrichmentService } from "../src/services/enrichment.service.js";

describe("Drogasil snapshot normalization", () => {
  test("mantem hierarquia comercial e evita classificar preservativo como medicamento", () => {
    const service = new EnrichmentService();

    const snapshot = service.buildSnapshot({
      item: {
        ean: "7898079001416",
        nome_recebido: null,
        dados_brutos: {},
      },
      nameLookup: {
        key: "drogasil",
        result: {
          nome: "Camisinha Prudence Super Sensitive 8 unidades",
        },
        detail: null,
        error: null,
      },
      dataLookup: {
        key: "drogasil",
        result: {
          categoria: "Saúde Sexual",
          subcategoria: "Preservativos",
          segmento: "Saúde",
        },
        detail: {
          info: {
            gtin: "7898079001416",
            produto: "Camisinha Prudence Super Sensitive 8 unidades",
            apresentacao: "O que é a Camisinha Prudence Super Sensitive? Produto lubrificado e mais fino.",
            descricao: "O que é a Camisinha Prudence Super Sensitive? Produto lubrificado e mais fino.",
            laboratorio: "Prudence",
            departamento: "Saúde",
            categoria: "Saúde Sexual",
            subcategoria: "Preservativos",
            classe: null,
            segmento: "PERFUMARIA",
            subsegmento: "HIGIENE",
            qtde_fs: "8",
            unidade: "unidades",
            tarja: "PRODUTO SEM TARJA",
          },
        },
        error: null,
      },
    });

    expect(snapshot.nome_recebido).toBe("Camisinha Prudence Super Sensitive 8 unidades");
    expect(snapshot.dados_brutos.categoria).toBe("Saúde Sexual");
    expect(snapshot.dados_brutos.subcategoria).toBe("Preservativos");
    expect(snapshot.dados_brutos.segmento).toBe("PERFUMARIA");
    expect(snapshot.dados_brutos.subsegmento).toBe("HIGIENE");
    expect(snapshot.dados_brutos.quantidade).toBe("8");
    expect(snapshot.dados_brutos.unidade).toBe("unidades");
    expect(snapshot.dados_brutos.tarja).toBe("PRODUTO SEM TARJA");
    expect(snapshot.dados_brutos.dose).toBeNull();
    expect(snapshot.dados_brutos.tipo).toBe("perfumaria");
  });
});
