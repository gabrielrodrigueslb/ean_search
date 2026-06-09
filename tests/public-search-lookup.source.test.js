import { describe, expect, jest, test } from "@jest/globals";
import { PublicSearchLookupSource } from "../src/providers/enrichment/public-search-lookup.source.js";

function createPageDocument() {
  return {
    $(selector) {
      if (selector === "title") {
        return { first() { return { text() { return "Cialis Diário 5mg 28 comprimidos"; } }; } };
      }
      if (selector === "h1") {
        return { first() { return { text() { return "Cialis Diário 5mg 28 comprimidos"; } }; } };
      }
      if (selector === 'meta[property="og:title"]') {
        return { attr() { return null; } };
      }
      if (selector === 'meta[name="description"]') {
        return { attr() { return "GTIN/EAN 7896382706066"; } };
      }
      if (selector === 'meta[property="og:description"]') {
        return { attr() { return null; } };
      }

      return { first() { return { text() { return ""; }, attr() { return null; } }; }, attr() { return null; } };
    },
  };
}

describe("PublicSearchLookupSource", () => {
  test("aceita candidato com EAN exato e forte similaridade de nome", async () => {
    const client = {
      fetchDocument: jest.fn().mockResolvedValue(createPageDocument()),
    };
    const searchHtml = `
      <div class="result">
        <a class="result__a" href="https://example.com/cialis-7896382706066"></a>
        <div class="result__title">Cialis Diário 5mg 28 comprimidos</div>
        <div class="result__snippet">GTIN/EAN 7896382706066 produto Eli Lilly</div>
      </div>
    `;
    const searchHttp = {
      get: jest.fn().mockResolvedValue({ data: searchHtml }),
    };
    const source = new PublicSearchLookupSource({ client, searchHttp, maxCandidates: 3, maxFetches: 1 });

    const lookup = await source.lookupByEan("7896382706066");

    expect(lookup.result.nome).toContain("Cialis Diário 5mg");
    expect(lookup.result.raw.evidence[0].ean_match).toBe(true);
    expect(lookup.error).toBeNull();
  });
});
