jest.mock("../src/integrations/trier.client", () => {
  const get = jest.fn();

  return {
    TrierClient: jest.fn().mockImplementation(() => ({
      get,
    })),
    __mock: {
      get,
    },
  };
});

const { TrierService } = require("../src/services/trier.service");
const { __mock } = require("../src/integrations/trier.client");

describe("TrierService.buscarProdutos", () => {
  beforeEach(() => {
    __mock.get.mockReset();
  });

  test("usa obter-todos-v1 quando a carga nao possui filtros", async () => {
    const service = new TrierService();
    __mock.get.mockResolvedValue([{ codigo: 1 }]);

    const result = await service.buscarProdutos({}, {
      baseUrl: "https://cliente.exemplo/sgfpod1/",
      bearerToken: "token",
    });

    expect(__mock.get).toHaveBeenCalledWith(
      "/rest/integracao/produto/obter-todos-v1",
      {
        primeiroRegistro: 0,
        quantidadeRegistros: 999,
        processaCustoMedio: false,
      },
    );
    expect(result.endpoint).toBe("/rest/integracao/produto/obter-todos-v1");
    expect(result.items).toHaveLength(1);
  });

  test("usa obter-v1 quando a carga possui filtros", async () => {
    const service = new TrierService();
    __mock.get.mockResolvedValue([{ codigo: 2 }]);

    const result = await service.buscarProdutos({
      codigoBarras: "7891058017507",
      processaCustoMedio: false,
    }, {
      baseUrl: "https://cliente.exemplo/sgfpod1/",
      bearerToken: "token",
    });

    expect(__mock.get).toHaveBeenCalledWith(
      "/rest/integracao/produto/obter-v1",
      {
        primeiroRegistro: 0,
        quantidadeRegistros: 999,
        processaCustoMedio: false,
        codigoBarras: "7891058017507",
      },
    );
    expect(result.endpoint).toBe("/rest/integracao/produto/obter-v1");
    expect(result.items).toHaveLength(1);
  });

  test("mantem filtros ativo e integracaoEcommerce no obter-v1", async () => {
    const service = new TrierService();
    __mock.get.mockResolvedValue([{ codigo: 3 }]);

    await service.buscarProdutos({
      ativo: true,
      integracaoEcommerce: true,
    }, {
      baseUrl: "https://cliente.exemplo/sgfpod1/",
      bearerToken: "token",
    });

    expect(__mock.get).toHaveBeenCalledWith(
      "/rest/integracao/produto/obter-v1",
      {
        primeiroRegistro: 0,
        quantidadeRegistros: 999,
        processaCustoMedio: false,
        ativo: true,
        integracaoEcommerce: true,
      },
    );
  });
});
