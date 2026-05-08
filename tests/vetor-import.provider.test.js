import { describe, expect, test } from "@jest/globals";
import { VetorImportProvider } from "../src/providers/import/vetor-import.provider.js";

describe("VetorImportProvider", () => {
  test("reduz o tamanho da pagina e tenta novamente quando a Vetor estoura timeout", async () => {
    const service = {
      buscarProdutos: async (filters) => {
        if (filters.top === 100) {
          throw new Error("timeout of 60000ms exceeded");
        }

        return {
          raw: { data: [{ codigoBarras: "7891058009458", descricaoUsual: "Dorflex Gotas" }] },
          items: [{ codigoBarras: "7891058009458", descricaoUsual: "Dorflex Gotas" }],
          total: 1,
          endpoint: "/api/ecommerce/produtos/consulta",
        };
      },
    };

    const provider = new VetorImportProvider({ service });

    const result = await provider.fetchPage({
      skip: 0,
      top: 100,
    }, {
      filter: "codigoBarras ne null and codigoBarras ne ''",
    }, {});

    expect(result.items).toHaveLength(1);
    expect(result.nextState.top).toBe(50);
    expect(result.nextState.skip).toBe(1);
  });
});
