import { describe, expect, test } from "@jest/globals";
import { VtexImportAdapter } from "../src/adapters/vtex-import.adapter.js";

describe("VtexImportAdapter", () => {
  test("normaliza item da VTEX usando EAN e nome principal do SKU", () => {
    const adapter = new VtexImportAdapter();

    const batch = adapter.normalizeBatch([
      {
        Id: 20,
        ProductId: 20,
        NameComplete: "Acetilcisteina Eurofarma 100mg 16 envelopes",
        ProductName: "Acetilcisteina Eurofarma 100mg 16 envelopes",
        ProductDescription: "Acetilcisteina Eurofarma 100mg 16 envelopes",
        BrandName: "EUROFARMA GENERICO MIP",
        ProductCategories: {
          427: "Tosse Com Catarro",
          67: "Gripe e Resfriados",
          5: "Medicamentos",
        },
        AlternateIds: {
          Ean: "7891317001056",
          RefId: "123",
        },
        ProductSpecifications: [
          {
            FieldName: "Princípio Ativo",
            FieldValues: ["Acetilcisteina"],
          },
          {
            FieldName: "Código MS",
            FieldValues: ["1004307720010"],
          },
        ],
      },
    ]);

    expect(batch).toHaveLength(1);
    expect(batch[0]).toMatchObject({
      ean: "7891317001056",
      nome_recebido: "Acetilcisteina Eurofarma 100mg 16 envelopes",
      fonte: "vtex",
      dados_brutos: {
        skuId: 20,
        productId: 20,
        refId: "123",
        categoria: "Tosse Com Catarro",
        laboratorio: "EUROFARMA GENERICO MIP",
        registro_ms: "1004307720010",
        principio_ativo_informado: "Acetilcisteina",
        origem_nome: "vtex",
        origem_dados: "vtex",
      },
    });
  });

  test("descarta itens da VTEX sem EAN", () => {
    const adapter = new VtexImportAdapter();

    const batch = adapter.normalizeBatch([
      {
        Id: 21,
        ProductId: 20,
        NameComplete: "Produto sem EAN",
        AlternateIds: {
          Ean: "",
        },
      },
    ]);

    expect(batch).toHaveLength(0);
  });
});
