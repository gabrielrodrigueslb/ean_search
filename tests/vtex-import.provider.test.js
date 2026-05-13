import { describe, expect, test } from "@jest/globals";
import { VtexImportProvider } from "../src/providers/import/vtex-import.provider.js";

describe("VtexImportProvider", () => {
  test("pagina usando from/to e normaliza os itens retornados pela VTEX", async () => {
    const service = {
      normalizePageSize: (value, fallback) => Number.parseInt(value, 10) || fallback,
      normalizeFrom: (value) => Number.parseInt(value, 10) || 1,
      normalizeTo: (value, from, top) => Number.parseInt(value, 10) || (from + top - 1),
      buscarProdutos: async () => ({
        raw: {
          data: {
            20: [20],
          },
          range: {
            total: 250,
            from: 1,
            to: 100,
          },
        },
        items: [
          {
            Id: 20,
            ProductId: 20,
            NameComplete: "Acetilcisteina Eurofarma 100mg 16 envelopes",
            ProductName: "Acetilcisteina Eurofarma 100mg 16 envelopes",
            BrandName: "EUROFARMA GENERICO MIP",
            AlternateIds: {
              Ean: "7891317001056",
              RefId: "123",
            },
            ProductCategories: {
              5: "Medicamentos",
            },
          },
        ],
        total: 250,
        endpoint: "/api/catalog_system/pvt/products/GetProductAndSkuIds",
      }),
    };

    const provider = new VtexImportProvider({ service });

    const filters = provider.normalizeFilters({
      top: 100,
      from: 1,
    });

    const result = await provider.fetchPage({
      top: filters.top,
      from: filters.from,
      to: filters.to,
    }, filters, {
      accountName: "natusfarma",
      appKey: "key",
      appToken: "token",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      ean: "7891317001056",
      fonte: "vtex",
    });
    expect(result.total).toBe(250);
    expect(result.hasMore).toBe(true);
    expect(result.nextState).toMatchObject({
      from: 101,
      to: 200,
      top: 100,
    });
  });
});
