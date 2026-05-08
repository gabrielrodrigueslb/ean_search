import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const vetorClientGet = jest.fn();

jest.unstable_mockModule("../src/integrations/vetor.client.js", () => ({
  VetorClient: jest.fn().mockImplementation(() => ({
    get: vetorClientGet,
  })),
}));

const { DEFAULT_SELECT, VetorService } = await import("../src/services/vetor.service.js");

describe("VetorService.buscarProdutos", () => {
  beforeEach(() => {
    vetorClientGet.mockReset();
  });

  test("usa defaults leves para evitar timeout", async () => {
    const service = new VetorService();
    vetorClientGet.mockResolvedValue({ data: [] });

    await service.buscarProdutos({}, {
      apiKey: "token",
    });

    expect(vetorClientGet).toHaveBeenCalledWith(
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
    vetorClientGet.mockResolvedValue({ data: [] });

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

    expect(vetorClientGet).toHaveBeenCalledWith(
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
