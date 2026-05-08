import { describe, expect, test } from "@jest/globals";
import { VetorImportAdapter } from "../src/adapters/vetor-import.adapter.js";

describe("VetorImportAdapter", () => {
  test("descarta itens sem codigo de barras na normalizacao do lote", () => {
    const adapter = new VetorImportAdapter();

    const batch = adapter.normalizeBatch([
      {
        cdProduto: 1,
        codigoBarras: "7891058009458",
        descricaoUsual: "Dorflex Gotas",
      },
      {
        cdProduto: 2,
        codigoBarras: null,
        descricaoUsual: "Produto sem EAN",
      },
      {
        cdProduto: 3,
        codigoBarras: "",
        descricaoUsual: "Outro sem EAN",
      },
    ]);

    expect(batch).toHaveLength(1);
    expect(batch[0]).toMatchObject({
      ean: "7891058009458",
      nome_recebido: "Dorflex Gotas",
      fonte: "vetor",
    });
  });
});
