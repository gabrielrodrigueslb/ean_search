import { describe, expect, jest, test } from "@jest/globals";
import { OpenAiWebLookupSource } from "../src/providers/enrichment/openai-web-lookup.source.js";

describe("OpenAiWebLookupSource", () => {
  test("retorna erro sem consultar quando cliente nao esta configurado", async () => {
    const client = {
      isConfigured: () => false,
      lookupProduct: jest.fn(),
    };
    const source = new OpenAiWebLookupSource({ client });

    const lookup = await source.lookupByEan("7891058017507");

    expect(client.lookupProduct).not.toHaveBeenCalled();
    expect(lookup).toEqual({
      key: "openai_web",
      result: null,
      detail: null,
      error: "OPENAI_API_KEY nao configurada.",
    });
  });

  test("normaliza resultado aceito em result e detail do enrichment", async () => {
    const client = {
      isConfigured: () => true,
      lookupProduct: jest.fn().mockResolvedValue({
        accepted: true,
        confidence: 0.92,
        produto: "Dorflex",
        nome_exibicao: "Dorflex 36 Comprimidos",
        apresentacao: "36 comprimidos",
        laboratorio: "Sanofi",
        categoria: "Medicamentos",
        registro_ms: "123456789",
        tarja: "Isento",
        forma_farmaceutica: "Comprimido",
        via_administracao: "Oral",
        quantidade: "36 comprimidos",
        principio_ativo: ["Dipirona", "Orfenadrina", "Cafeina"],
        evidence: [{
          title: "Pagina do produto",
          url: "https://example.com/produto",
          matched_ean: true,
          note: "Pagina menciona o EAN.",
        }],
        sources: [{
          title: "Pagina do produto",
          url: "https://example.com/produto",
        }],
        rationale: "EAN encontrado em pagina publica.",
      }),
    };
    const source = new OpenAiWebLookupSource({ client });

    const lookup = await source.lookupByEan("7891058017507", {
      rawName: "DORFLEX 36CP",
    });

    expect(client.lookupProduct).toHaveBeenCalledWith({
      ean: "7891058017507",
      rawName: "DORFLEX 36CP",
    });
    expect(lookup.result.nome_exibicao).toBe("Dorflex 36 Comprimidos");
    expect(lookup.result.origem).toBe("openai_web");
    expect(lookup.detail.info.farmacos).toEqual([
      { farmaco: "Dipirona" },
      { farmaco: "Orfenadrina" },
      { farmaco: "Cafeina" },
    ]);
    expect(lookup.error).toBeNull();
  });

  test("nao aceita resposta com evidencia insuficiente", async () => {
    const client = {
      isConfigured: () => true,
      lookupProduct: jest.fn().mockResolvedValue({
        accepted: false,
        rationale: "Sem correspondencia clara de EAN.",
      }),
    };
    const source = new OpenAiWebLookupSource({ client });

    const lookup = await source.lookupByEan("7891058017507");

    expect(lookup).toEqual({
      key: "openai_web",
      result: null,
      detail: null,
      error: "OpenAI Web sem evidencia suficiente.",
    });
  });
});
