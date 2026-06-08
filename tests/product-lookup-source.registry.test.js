import { describe, expect, test } from "@jest/globals";
import { ProductLookupSourceRegistry } from "../src/providers/enrichment/product-lookup-source.registry.js";

function createSource(sourceKey, lookupResult) {
  return {
    getSourceKey() {
      return sourceKey;
    },
    async lookupByEan() {
      return lookupResult;
    },
  };
}

describe("ProductLookupSourceRegistry", () => {
  test("executa fallback sequencial e marca as fontes seguintes como skipped", async () => {
    const registry = new ProductLookupSourceRegistry([
      createSource("convertize", {
        key: "convertize",
        result: {
          nome: "Produto vindo da Convertize",
        },
        detail: null,
        error: null,
      }),
      createSource("drogasil", {
        key: "drogasil",
        result: {
          nome: "Produto vindo da Drogasil",
        },
        detail: null,
        error: null,
      }),
    ]);

    const lookups = await registry.lookupByEan("7891058017507");

    expect(lookups.convertize).toEqual({
      key: "convertize",
      result: {
        nome: "Produto vindo da Convertize",
      },
      detail: null,
      error: null,
    });
    expect(lookups.drogasil).toEqual({
      key: "drogasil",
      result: null,
      detail: null,
      error: null,
      skipped: true,
      skip_reason: "resolved_by_convertize",
    });
  });
});
