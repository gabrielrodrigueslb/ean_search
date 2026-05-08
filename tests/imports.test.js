import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import request from "supertest";

const enqueueItems = jest.fn();
const enqueueTrierImport = jest.fn();
const enqueueVetorImport = jest.fn();
const getImportacao = jest.fn();

jest.unstable_mockModule("../src/services/import.service.js", () => ({
  ImportService: jest.fn().mockImplementation(() => ({
    enqueueItems,
    enqueueTrierImport,
    enqueueVetorImport,
    getImportacao,
  })),
}));

const { createApp } = await import("../src/app.js");

describe("GET /imports/:id", () => {
  beforeEach(() => {
    enqueueItems.mockReset();
    enqueueTrierImport.mockReset();
    getImportacao.mockReset();
  });

  test("retorna 400 quando o id e invalido", async () => {
    const app = createApp();

    const response = await request(app).get("/imports/abc");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Id de importacao invalido.",
      details: null,
    });
    expect(getImportacao).not.toHaveBeenCalled();
  });

  test("retorna importacao com alias importacao_id", async () => {
    const app = createApp();
    getImportacao.mockResolvedValue({
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
    expect(getImportacao).toHaveBeenCalledWith(7);
  });
});

describe("POST /imports/json", () => {
  beforeEach(() => {
    enqueueItems.mockReset();
  });

  test("retorna id e importacao_id na resposta", async () => {
    const app = createApp();
    enqueueItems.mockResolvedValue({
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
    enqueueTrierImport.mockReset();
  });

  test("retorna id e importacao_id na resposta", async () => {
    const app = createApp();
    enqueueTrierImport.mockResolvedValue({
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
    expect(enqueueTrierImport).toHaveBeenCalledWith({
      baseUrl: "https://cliente.exemplo/",
      bearerToken: "token",
      productApi: {},
      filters: expect.objectContaining({
        codigoBarras: "7891058017507",
      }),
    });
  });
});

describe("POST /imports/vetor", () => {
  beforeEach(() => {
    enqueueVetorImport.mockReset();
  });

  test("retorna id e importacao_id na resposta", async () => {
    const app = createApp();
    enqueueVetorImport.mockResolvedValue({
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
    expect(enqueueVetorImport).toHaveBeenCalledWith({
      baseUrl: undefined,
      apiKey: "token-vetor",
      productApi: {},
      filters: expect.objectContaining({
        filter: "inativo eq false and qtdEstoque gt 0",
      }),
    });
  });
});
