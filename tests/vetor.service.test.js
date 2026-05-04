jest.mock("../src/integrations/vetor.client", () => {
  const get = jest.fn();

  return {
    VetorClient: jest.fn().mockImplementation(() => ({
      get,
    })),
    __mock: {
      get,
    },
  };
});

const { VetorService, DEFAULT_SELECT } = require("../src/services/vetor.service");
const { __mock } = require("../src/integrations/vetor.client");

describe("VetorService.buscarProdutos", () => {
  beforeEach(() => {
    __mock.get.mockReset();
  });

  test("usa defaults leves para evitar timeout", async () => {
    const service = new VetorService();
    __mock.get.mockResolvedValue({ data: [] });

    await service.buscarProdutos({}, {
      apiKey: "token",
    });

    expect(__mock.get).toHaveBeenCalledWith(
      "/api/ecommerce/produtos/consulta",
      {
        $top: 100,
        $skip: 0,
        $count: false,
        $select: DEFAULT_SELECT,
      },
    );
  });

  test("aceita sobreposicoes explicitas de pagina e consulta", async () => {
    const service = new VetorService();
    __mock.get.mockResolvedValue({ data: [] });

    await service.buscarProdutos({
      top: 300,
      skip: 200,
      count: true,
      filter: "inativo eq false and qtdEstoque gt 0",
      orderby: "descricao asc",
      select: "cdProduto,descricao",
    }, {
      apiKey: "token",
    });

    expect(__mock.get).toHaveBeenCalledWith(
      "/api/ecommerce/produtos/consulta",
      {
        $top: 300,
        $skip: 200,
        $count: true,
        $filter: "inativo eq false and qtdEstoque gt 0",
        $select: "cdProduto,descricao",
        $orderby: "descricao asc",
      },
    );
  });
});
