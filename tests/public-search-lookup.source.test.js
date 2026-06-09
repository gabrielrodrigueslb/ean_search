import { describe, expect, jest, test } from "@jest/globals";
import { PublicSearchLookupSource } from "../src/providers/enrichment/public-search-lookup.source.js";

function createPageDocument() {
  return {
    $(selector) {
      if (selector === "title") {
        return { first() { return { text() { return "Cialis Diario 5mg 28 comprimidos"; } }; } };
      }
      if (selector === "h1") {
        return { first() { return { text() { return "Cialis Diario 5mg 28 comprimidos"; } }; } };
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
        <div class="result__title">Cialis Diario 5mg 28 comprimidos</div>
        <div class="result__snippet">GTIN/EAN 7896382706066 produto Eli Lilly</div>
      </div>
    `;
    const searchHttp = {
      get: jest.fn().mockResolvedValue({ data: searchHtml }),
    };
    const source = new PublicSearchLookupSource({ client, searchHttp, maxCandidates: 3, maxFetches: 1 });

    const lookup = await source.lookupByEan("7896382706066");

    expect(lookup.result.nome).toContain("Cialis Diario 5 mg");
    expect(lookup.result.raw.evidence[0].ean_match).toBe(true);
    expect(lookup.error).toBeNull();
  });

  test("rejeita candidato promocional mesmo com match de EAN", async () => {
    const client = {
      fetchDocument: jest.fn().mockResolvedValue({
        $(selector) {
          if (selector === "title") {
            return { first() { return { text() { return "Achei BETAMETASONA mais barato. Confira precos, descontos e compre online!"; } }; } };
          }
          if (selector === "h1") {
            return { first() { return { text() { return "Achei BETAMETASONA mais barato. Confira precos, descontos e compre online!"; } }; } };
          }
          if (selector === 'meta[property="og:title"]' || selector === 'meta[name="description"]' || selector === 'meta[property="og:description"]') {
            return { attr() { return null; } };
          }

          return { first() { return { text() { return ""; }, attr() { return null; } }; }, attr() { return null; } };
        },
      }),
    };
    const searchHtml = `
      <div class="result">
        <a class="result__a" href="https://example.com/betametasona-7896004711263"></a>
        <div class="result__title">Achei BETAMETASONA mais barato. Confira precos, descontos e compre online!</div>
        <div class="result__snippet">GTIN/EAN 7896004711263 produto Germed</div>
      </div>
    `;
    const searchHttp = {
      get: jest.fn().mockResolvedValue({ data: searchHtml }),
    };
    const source = new PublicSearchLookupSource({ client, searchHttp, maxCandidates: 3, maxFetches: 1 });

    const lookup = await source.lookupByEan("7896004711263", {
      rawName: "BETAMETASONA 2MG 10CPR GERMED",
    });

    expect(lookup.result).toBeNull();
    expect(lookup.error).toBeNull();
  });

  test("expande abreviacao clara do titulo encontrado", async () => {
    const client = {
      fetchDocument: jest.fn().mockResolvedValue({
        $(selector) {
          if (selector === "title") {
            return { first() { return { text() { return "PO DESC.LUMINOUS 50G GTIN/EAN: 7896009159879"; } }; } };
          }
          if (selector === "h1") {
            return { first() { return { text() { return "PO DESC.LUMINOUS 50G"; } }; } };
          }
          if (selector === 'meta[property="og:title"]' || selector === 'meta[name="description"]' || selector === 'meta[property="og:description"]') {
            return { attr() { return null; } };
          }

          return { first() { return { text() { return ""; }, attr() { return null; } }; }, attr() { return null; } };
        },
      }),
    };
    const searchHtml = `
      <div class="result">
        <a class="result__a" href="https://example.com/descolorante-7896009159879"></a>
        <div class="result__title">PO DESC.LUMINOUS 50G GTIN/EAN: 7896009159879</div>
        <div class="result__snippet">GTIN/EAN 7896009159879</div>
      </div>
    `;
    const searchHttp = {
      get: jest.fn().mockResolvedValue({ data: searchHtml }),
    };
    const source = new PublicSearchLookupSource({ client, searchHttp, maxCandidates: 3, maxFetches: 1 });

    const lookup = await source.lookupByEan("7896009159879", {
      rawName: "DESCOL.LUMINOUS 50G CAMOMILA /",
    });

    expect(lookup.result.nome).toBe("Pó Descolorante Luminous 50 g");
    expect(lookup.error).toBeNull();
  });

  test("preserva sigla comercial legitima como DS no nome final", async () => {
    const client = {
      fetchDocument: jest.fn().mockResolvedValue({
        $(selector) {
          if (selector === "title") {
            return { first() { return { text() { return "Shampoo Anticaspa Kerium DS Ação Intensiva - La Roche-Posay - 125ml"; } }; } };
          }
          if (selector === "h1") {
            return { first() { return { text() { return "Shampoo Anticaspa Kerium DS Ação Intensiva"; } }; } };
          }
          if (selector === 'meta[property="og:title"]' || selector === 'meta[name="description"]' || selector === 'meta[property="og:description"]') {
            return { attr() { return null; } };
          }

          return { first() { return { text() { return ""; }, attr() { return null; } }; }, attr() { return null; } };
        },
      }),
    };
    const searchHtml = `
      <div class="result">
        <a class="result__a" href="https://example.com/kerium-ds-7896014171194"></a>
        <div class="result__title">Shampoo Anticaspa Kerium DS Ação Intensiva - La Roche-Posay - 125ml</div>
        <div class="result__snippet">GTIN/EAN 7896014171194</div>
      </div>
    `;
    const searchHttp = {
      get: jest.fn().mockResolvedValue({ data: searchHtml }),
    };
    const source = new PublicSearchLookupSource({ client, searchHttp, maxCandidates: 3, maxFetches: 1 });

    const lookup = await source.lookupByEan("7896014171194", {
      rawName: "KERIUM DS SHAMPOO A CASP INT 125ML",
    });

    expect(lookup.result.nome).toContain("Kerium DS");
    expect(lookup.error).toBeNull();
  });
});
