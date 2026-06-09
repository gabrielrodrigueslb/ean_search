import { describe, expect, jest, test } from "@jest/globals";
import { ConsultaRemediosLookupSource } from "../src/providers/enrichment/consulta-remedios-lookup.source.js";

function createDocument() {
  return {
    url: "https://consultaremedios.com.br/cialis-diario/p",
    $(selectorOrElement) {
      if (typeof selectorOrElement === "string") {
        if (selectorOrElement === "h1") {
          return { first() { return { text() { return "7896382706066"; } }; } };
        }
        if (selectorOrElement === "h2") {
          return { first() { return { text() { return "Cialis Diário 5mg, caixa com 28 comprimidos revestidos"; } }; } };
        }
        if (selectorOrElement === '.text-xs') {
          return { toArray() { return ["Eli Lilly", "Tadalafila"]; } };
        }
        if (selectorOrElement === 'meta[name="description"]') {
          return { attr() { return "Descricao"; } };
        }
        if (selectorOrElement === 'meta[property="og:description"]') {
          return { attr() { return null; } };
        }
      }

      return {
        text() {
          return String(selectorOrElement);
        },
      };
    },
  };
}

describe("ConsultaRemediosLookupSource", () => {
  test("retorna resultado quando a pagina do EAN existe", async () => {
    const client = {
      fetchDocument: jest.fn().mockResolvedValue(createDocument()),
    };
    const source = new ConsultaRemediosLookupSource({ client });

    const lookup = await source.lookupByEan("7896382706066");

    expect(lookup.result.nome).toContain("Cialis Diário 5mg");
    expect(lookup.detail.info.laboratorio).toBeNull();
    expect(lookup.detail.info.farmacos).toEqual([]);
    expect(lookup.error).toBeNull();
  });
});
