import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import request from "supertest";

const enqueueItems = jest.fn();
const enqueueTrierImport = jest.fn();
const enqueueVetorImport = jest.fn();
const enqueuePostgresEmbalagensImport = jest.fn();
const getImportacao = jest.fn();

jest.unstable_mockModule("../src/services/import.service.js", () => ({
  ImportService: jest.fn().mockImplementation(() => ({
    enqueueItems,
    enqueueTrierImport,
    enqueueVetorImport,
    enqueuePostgresEmbalagensImport,
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

  test("retorna importacao com resumo enxuto dos nao encontrados", async () => {
    const app = createApp();
    getImportacao.mockResolvedValue({
      id: 7,
      status: "processing",
      total_itens: 3,
      itens_sucesso: 1,
      itens: [
        {
          ean: "7890010000403",
          nome_recebido: "DES. AXE AERO APOLO 97G",
          status: "review",
          mensagem_erro: "Nome nao resolvido por fontes confiaveis.",
          dados_brutos: {
            nome_exibicao: "DES. AXE AERO APOLO 97G",
          },
          fontes_consultadas: {
            approval_required: true,
            encontrado: false,
          },
        },
        {
          ean: "7891058017507",
          nome_recebido: "Dorflex",
          status: "failed",
          mensagem_erro: "Fallback Postgres acionado apos falha na API: timeout",
          dados_brutos: {
            nome_exibicao: "Dorflex",
          },
          fontes_consultadas: {
            action: "stored_fallback",
            api_error: {
              message: "timeout",
            },
          },
        },
        {
          ean: "7891234567890",
          nome_recebido: "Produto ok",
          status: "enriched",
          dados_brutos: {
            nome_exibicao: "Produto ok",
          },
          fontes_consultadas: {
            encontrado: true,
          },
        },
      ],
    });

    const response = await request(app).get("/imports/7");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: 7,
      status: "processing",
    });
    expect(response.body.itens).toBeUndefined();
    expect(response.body.aprovacoes).toBeUndefined();
    expect(response.body.fallbacks).toBeUndefined();
    expect(response.body.fallbacks_vtex).toBeUndefined();
    expect(response.body.resumo).toEqual({
      total_produtos_nao_encontrados: 1,
      produtos_nao_encontrados: [
        {
          ean: "7890010000403",
          nome: "DES. AXE AERO APOLO 97G",
          motivo: "Nome nao resolvido por fontes confiaveis.",
          encontrado: false,
        },
      ],
      total_itens_com_problema: 2,
      itens_com_problema: [
        {
          ean: "7890010000403",
          nome: "DES. AXE AERO APOLO 97G",
          motivo: "Nome nao resolvido por fontes confiaveis.",
          encontrado: false,
        },
        {
          ean: "7891058017507",
          nome: "Dorflex",
          motivo: "Fallback Postgres acionado apos falha na API: timeout",
          encontrado: null,
        },
      ],
      total_itens_falha: 1,
      itens_falha: [
        {
          ean: "7891058017507",
          nome: "Dorflex",
          motivo: "Fallback Postgres acionado apos falha na API: timeout",
          encontrado: null,
        },
      ],
      total_itens_revisao: 1,
      itens_revisao: [
        {
          ean: "7890010000403",
          nome: "DES. AXE AERO APOLO 97G",
          motivo: "Nome nao resolvido por fontes confiaveis.",
          encontrado: false,
        },
      ],
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

describe("POST /imports/csv", () => {
  beforeEach(() => {
    enqueueItems.mockReset();
  });

  test("aceita upload no campo file", async () => {
    const app = createApp();
    enqueueItems.mockResolvedValue({
      id: 51,
      status: "pending",
      total_itens: 1,
    });

    const response = await request(app)
      .post("/imports/csv")
      .attach("file", Buffer.from("ean,descricao\n7891058003890,ANADOR 1G 10 COMPRIMIDOS\n"), "produtos.csv");

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({
      id: 51,
      importacao_id: 51,
      status: "pending",
      total_itens: 1,
    });
    expect(enqueueItems).toHaveBeenCalledWith(expect.objectContaining({
      fonte: "csv",
      items: [
        expect.objectContaining({
          ean: "7891058003890",
          nome_recebido: "ANADOR 1G 10 COMPRIMIDOS",
        }),
      ],
      productApi: {},
    }));
  });

  test("aceita upload no campo arquivo", async () => {
    const app = createApp();
    enqueueItems.mockResolvedValue({
      id: 52,
      status: "pending",
      total_itens: 1,
    });

    const response = await request(app)
      .post("/imports/csv")
      .attach("arquivo", Buffer.from("ean,descricao\n7891058009458,DORFLEX GOTAS\n"), "produtos.csv");

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({
      id: 52,
      importacao_id: 52,
      status: "pending",
      total_itens: 1,
    });
    expect(enqueueItems).toHaveBeenCalledWith(expect.objectContaining({
      fonte: "csv",
      items: [
        expect.objectContaining({
          ean: "7891058009458",
          nome_recebido: "DORFLEX GOTAS",
        }),
      ],
      productApi: {},
    }));
  });

  test("aceita csv enviado como corpo bruto", async () => {
    const app = createApp();
    enqueueItems.mockResolvedValue({
      id: 53,
      status: "pending",
      total_itens: 1,
    });

    const response = await request(app)
      .post("/imports/csv")
      .set("Content-Type", "text/csv")
      .set("X-File-Name", "produtos.csv")
      .send(Buffer.from("ean,descricao,principio_ativo\n7891058003890,ANADOR 1G 10 COMPRIMIDOS,Dipirona Monoidratada\n"));

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({
      id: 53,
      importacao_id: 53,
      status: "pending",
      total_itens: 1,
    });
    expect(enqueueItems).toHaveBeenCalledWith(expect.objectContaining({
      fonte: "csv",
      items: [
        expect.objectContaining({
          ean: "7891058003890",
          nome_recebido: "ANADOR 1G 10 COMPRIMIDOS",
          dados_brutos: expect.objectContaining({
            ingrediente_ativo: "Dipirona Monoidratada",
          }),
        }),
      ],
      productApi: {},
    }));
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
        filter: "(inativo eq false and qtdEstoque gt 0) and inativo eq false and codigoBarras ne null and codigoBarras ne ''",
      }),
    });
  });

  test("combina cdFilial com o filtro enviado", async () => {
    const app = createApp();
    enqueueVetorImport.mockResolvedValue({
      id: 32,
      status: "pending",
      total_itens: 0,
    });

    const response = await request(app)
      .post("/imports/vetor")
      .send({
        apiKey: "token-vetor",
        cdFilial: 7,
        filter: "controlado eq false",
      });

    expect(response.status).toBe(202);
    expect(enqueueVetorImport).toHaveBeenCalledWith({
      baseUrl: undefined,
      apiKey: "token-vetor",
      productApi: {},
      filters: expect.objectContaining({
        filter: "(controlado eq false) and inativo eq false and codigoBarras ne null and codigoBarras ne '' and cdFilial eq 7",
      }),
    });
  });

  test("usa so cdFilial quando nenhum filtro manual e enviado", async () => {
    const app = createApp();
    enqueueVetorImport.mockResolvedValue({
      id: 33,
      status: "pending",
      total_itens: 0,
    });

    const response = await request(app)
      .post("/imports/vetor")
      .send({
        apiKey: "token-vetor",
        cdFilial: 12,
      });

    expect(response.status).toBe(202);
    expect(enqueueVetorImport).toHaveBeenCalledWith({
      baseUrl: undefined,
      apiKey: "token-vetor",
      productApi: {},
      filters: expect.objectContaining({
        filter: "inativo eq false and codigoBarras ne null and codigoBarras ne '' and cdFilial eq 12",
      }),
    });
  });
});

describe("POST /imports/postgres-embalagens", () => {
  beforeEach(() => {
    enqueuePostgresEmbalagensImport.mockReset();
  });

  test("recebe configuracao de banco por request e aceita a importacao", async () => {
    const app = createApp();
    enqueuePostgresEmbalagensImport.mockResolvedValue({
      id: 41,
      status: "pending",
      total_itens: 0,
    });

    const response = await request(app)
      .post("/imports/postgres-embalagens")
      .send({
        db: {
          host: "167.234.236.103",
          port: 5432,
          database: "farmaciasbigfort_esc_20241008",
          user: "unicocontato",
          password: "segredo",
        },
        schema: "public",
        top: 250,
        skip: 0,
      });

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({
      id: 41,
      importacao_id: 41,
      status: "pending",
    });
    expect(enqueuePostgresEmbalagensImport).toHaveBeenCalledWith({
      db: {
        host: "167.234.236.103",
        port: 5432,
        database: "farmaciasbigfort_esc_20241008",
        user: "unicocontato",
        password: "segredo",
      },
      productApi: {},
      filters: {
        top: 250,
        skip: 0,
        schema: "public",
      },
    });
  });
});

describe("POST /imports/banco-alpha", () => {
  beforeEach(() => {
    enqueuePostgresEmbalagensImport.mockReset();
  });

  test("aceita a mesma configuracao do endpoint legado", async () => {
    const app = createApp();
    enqueuePostgresEmbalagensImport.mockResolvedValue({
      id: 42,
      status: "pending",
      total_itens: 0,
    });

    const response = await request(app)
      .post("/imports/banco-alpha")
      .send({
        db: {
          host: "167.234.236.103",
          port: 5432,
          database: "farmaciasbigfort_esc_20241008",
          user: "unicocontato",
          password: "segredo",
        },
        top: 500,
        skip: 0,
      });

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({
      id: 42,
      importacao_id: 42,
      status: "pending",
    });
    expect(enqueuePostgresEmbalagensImport).toHaveBeenCalledWith({
      db: {
        host: "167.234.236.103",
        port: 5432,
        database: "farmaciasbigfort_esc_20241008",
        user: "unicocontato",
        password: "segredo",
      },
      productApi: {},
      filters: {
        top: 500,
        skip: 0,
        schema: undefined,
      },
    });
  });
});
