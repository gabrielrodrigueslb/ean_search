jest.mock("../src/services/import.service", () => {
  const enqueueItems = jest.fn();
  const enqueueTrierImport = jest.fn();
  const enqueueVetorImport = jest.fn();
  const getImportacao = jest.fn();

  return {
    ImportService: jest.fn().mockImplementation(() => ({
      enqueueItems,
      enqueueTrierImport,
      enqueueVetorImport,
      getImportacao,
    })),
    __mock: {
      enqueueItems,
      enqueueTrierImport,
      enqueueVetorImport,
      getImportacao,
    },
  };
});

const request = require("supertest");
const { createApp } = require("../src/app");
const { __mock } = require("../src/services/import.service");

describe("GET /imports/:id", () => {
  beforeEach(() => {
    __mock.enqueueItems.mockReset();
    __mock.enqueueTrierImport.mockReset();
    __mock.getImportacao.mockReset();
  });

  test("retorna 400 quando o id e invalido", async () => {
    const app = createApp();

    const response = await request(app).get("/imports/abc");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Id de importacao invalido.",
      details: null,
    });
    expect(__mock.getImportacao).not.toHaveBeenCalled();
  });

  test("retorna importacao com alias importacao_id", async () => {
    const app = createApp();
    __mock.getImportacao.mockResolvedValue({
      id: 7,
      status: "processing",
      itens: [],
    });

    const response = await request(app).get("/imports/7");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: 7,
      importacao_id: 7,
      status: "processing",
    });
    expect(__mock.getImportacao).toHaveBeenCalledWith(7);
  });
});

describe("POST /imports/json", () => {
  beforeEach(() => {
    __mock.enqueueItems.mockReset();
  });

  test("retorna id e importacao_id na resposta", async () => {
    const app = createApp();
    __mock.enqueueItems.mockResolvedValue({
      id: 11,
      status: "pending",
      total_itens: 1,
    });

    const response = await request(app)
      .post("/imports/json")
      .send({
        items: [{ ean: "7891058009458", nome: "Dorflex Gotas" }],
      });

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({
      id: 11,
      importacao_id: 11,
      status: "pending",
      total_itens: 1,
    });
  });

  test("retorna 400 quando items vier vazio", async () => {
    const app = createApp();

    const response = await request(app)
      .post("/imports/json")
      .send({ items: [] });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Nenhum item enviado para importacao JSON.",
      details: null,
    });
  });
});

describe("POST /imports/trier", () => {
  beforeEach(() => {
    __mock.enqueueTrierImport.mockReset();
  });

  test("retorna id e importacao_id na resposta", async () => {
    const app = createApp();
    __mock.enqueueTrierImport.mockResolvedValue({
      id: 21,
      status: "pending",
      total_itens: 0,
    });

    const response = await request(app)
      .post("/imports/trier")
      .send({
        baseUrl: "https://cliente.exemplo/",
        bearerToken: "token",
        ean: "7891058017507",
      });

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({
      id: 21,
      importacao_id: 21,
      status: "pending",
      total_itens: 0,
    });
    expect(__mock.enqueueTrierImport).toHaveBeenCalledWith({
      baseUrl: "https://cliente.exemplo/",
      bearerToken: "token",
      filters: expect.objectContaining({
        codigoBarras: "7891058017507",
      }),
    });
  });
});

describe("POST /imports/vetor", () => {
  beforeEach(() => {
    __mock.enqueueVetorImport.mockReset();
  });

  test("retorna id e importacao_id na resposta", async () => {
    const app = createApp();
    __mock.enqueueVetorImport.mockResolvedValue({
      id: 31,
      status: "pending",
      total_itens: 0,
    });

    const response = await request(app)
      .post("/imports/vetor")
      .send({
        apiKey: "token-vetor",
        filter: "inativo eq false and qtdEstoque gt 0",
      });

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({
      id: 31,
      importacao_id: 31,
      status: "pending",
      total_itens: 0,
    });
    expect(__mock.enqueueVetorImport).toHaveBeenCalledWith({
      baseUrl: undefined,
      apiKey: "token-vetor",
      filters: expect.objectContaining({
        filter: "inativo eq false and qtdEstoque gt 0",
      }),
    });
  });
});
