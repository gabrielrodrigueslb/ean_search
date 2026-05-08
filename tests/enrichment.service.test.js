import { describe, expect, jest, test } from "@jest/globals";
import { EnrichmentService } from "../src/services/enrichment.service.js";

describe("EnrichmentService session cache", () => {
  test("reaproveita consultas externas para o mesmo EAN dentro da mesma importacao", async () => {
    const lookupByEan = jest.fn()
      .mockResolvedValueOnce({
        convertize: {
          key: "convertize",
          result: {
            nome: "Suplemento Alimentar Zafolat Plus 90 Capsulas",
            origem: "convertize",
            categoria: "Suplementos",
          },
          detail: null,
          error: null,
        },
        farmaindex: {
          key: "farmaindex",
          result: null,
          detail: null,
          error: null,
        },
      });

    const service = new EnrichmentService({
      lookupSourceRegistry: {
        lookupByEan,
      },
    });
    const session = service.createSession();

    const first = await service.enrichImportedItem({
      ean: "7891158106637",
      nome_recebido: "ZAFOLAT 90 CAPS",
      dados_brutos: {
        origem_nome: "vetor",
      },
    }, session);

    const second = await service.enrichImportedItem({
      ean: "7891158106637",
      nome_recebido: "ZAFOLAT PLUS 90 CAPS",
      dados_brutos: {
        origem_nome: "vetor",
      },
    }, session);

    expect(lookupByEan).toHaveBeenCalledTimes(1);
    expect(first.fontes_consultadas.cache_hit).toBe(false);
    expect(second.fontes_consultadas.cache_hit).toBe(true);
    expect(second.item.nome_recebido).toBe("Suplemento Alimentar Zafolat Plus 90 Capsulas");
    expect(second.item.dados_brutos.origem_nome).toBe("convertize");
  });
});
