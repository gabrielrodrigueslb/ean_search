const { EnrichmentService } = require("../src/services/enrichment.service");

describe("EnrichmentService session cache", () => {
  test("reaproveita consultas externas para o mesmo EAN dentro da mesma importacao", async () => {
    const service = new EnrichmentService();
    const session = service.createSession();

    service.convertizeClient = {
      buscarPorEan: jest.fn().mockResolvedValue({
        nome: "Suplemento Alimentar Zafolat Plus 90 Capsulas",
        origem: "convertize",
        categoria: "Suplementos",
      }),
    };
    service.farmaIndexClient = {
      buscarPorEan: jest.fn().mockResolvedValue(null),
      buscarDetalhe: jest.fn(),
    };

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

    expect(service.convertizeClient.buscarPorEan).toHaveBeenCalledTimes(1);
    expect(service.farmaIndexClient.buscarPorEan).toHaveBeenCalledTimes(1);
    expect(first.fontes_consultadas.cache_hit).toBe(false);
    expect(second.fontes_consultadas.cache_hit).toBe(true);
    expect(second.item.nome_recebido).toBe("Suplemento Alimentar Zafolat Plus 90 Capsulas");
    expect(second.item.dados_brutos.origem_nome).toBe("convertize");
  });
});
