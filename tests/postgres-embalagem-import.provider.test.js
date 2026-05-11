import { describe, expect, test } from "@jest/globals";
import { PostgresEmbalagemImportProvider } from "../src/providers/import/postgres-embalagem-import.provider.js";

describe("PostgresEmbalagemImportProvider", () => {
  test("normaliza e deduplica itens vindos da tabela embalagem", async () => {
    const client = {
      fetchEmbalagens: async () => ({
        items: [
          { ean: "7893736007527", nome: "ACETICIL 100MG ENV 10CP" },
          { ean: "7898100243792", nome: "SALICETIL 100MG ENV 10CP" },
        ],
        total: 2,
        endpoint: "public.embalagem",
      }),
    };

    const provider = new PostgresEmbalagemImportProvider({ client });
    const result = await provider.fetchPage({
      skip: 0,
      top: 100,
    }, {
      schema: "public",
    }, {});

    expect(result.items).toEqual([
      expect.objectContaining({
        ean: "7893736007527",
        nome_recebido: "ACETICIL 100MG ENV 10CP",
        skip_enrichment: true,
      }),
      expect.objectContaining({
        ean: "7898100243792",
        nome_recebido: "SALICETIL 100MG ENV 10CP",
        skip_enrichment: true,
      }),
    ]);
    expect(result.hasMore).toBe(false);
    expect(result.endpoint).toBe("public.embalagem");
  });
});
