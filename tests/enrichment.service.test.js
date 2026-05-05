const { EnrichmentService } = require("../src/services/enrichment.service");

describe("EnrichmentService session cache", () => {
  test("reaproveita consultas externas para o mesmo EAN dentro da mesma importacao", async () => {
    const service = new EnrichmentService();
    const session = service.createSession();

    service.ptProductSearchClient = {
      buscarNomePorEan: jest.fn().mockRejectedValue(new Error("PT.ProductSearch bloqueou a consulta automatizada.")),
    };
    service.farmaIndexClient = {
      buscarPorEan: jest.fn().mockResolvedValue(null),
      buscarDetalhe: jest.fn(),
    };
    service.barcodeLookupClient = {
      buscarNomePorEan: jest.fn().mockRejectedValue(new Error("Request failed with status code 403")),
    };
    service.browserNameLookupClient = {
      buscarNomePorEan: jest.fn().mockResolvedValue({
        result: {
          nome: "Suplemento Alimentar Zafolat Plus 90 Capsulas",
          origem: "barcode_lookup_browser",
        },
        trail: [
          {
            source: "pt_product_search_browser",
            nome: null,
            error: "PT.ProductSearch bloqueou a consulta automatizada no browser.",
          },
          {
            source: "barcode_lookup_browser",
            nome: "Suplemento Alimentar Zafolat Plus 90 Capsulas",
            error: null,
          },
        ],
      }),
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

    expect(service.ptProductSearchClient.buscarNomePorEan).toHaveBeenCalledTimes(1);
    expect(service.farmaIndexClient.buscarPorEan).toHaveBeenCalledTimes(1);
    expect(service.barcodeLookupClient.buscarNomePorEan).toHaveBeenCalledTimes(1);
    expect(service.browserNameLookupClient.buscarNomePorEan).toHaveBeenCalledTimes(1);
    expect(first.fontes_consultadas.cache_hit).toBe(false);
    expect(second.fontes_consultadas.cache_hit).toBe(true);
    expect(second.item.nome_recebido).toBe("Suplemento Alimentar Zafolat Plus 90 Capsulas");
    expect(second.item.dados_brutos.origem_nome).toBe("barcode_lookup_browser");
  });
});
