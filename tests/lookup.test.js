import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import request from "supertest";

const enrichImportedItem = jest.fn();
const buildSnapshot = jest.fn();
const enqueue = jest.fn();

jest.unstable_mockModule("../src/services/enrichment.service.js", () => ({
  EnrichmentService: jest.fn().mockImplementation(() => ({
    enrichImportedItem,
    createSession: () => ({ id: "lookup-session" }),
  })),
}));

jest.unstable_mockModule("../src/services/product.service.js", () => ({
  ProductService: jest.fn().mockImplementation(() => ({
    buildSnapshot,
  })),
}));

jest.unstable_mockModule("../src/services/lookup-queue.service.js", () => ({
  lookupQueueService: {
    maxConcurrent: 10,
    enqueue,
  },
}));

const { createApp } = await import("../src/app.js");

describe("GET /lookup/ean/:ean", () => {
  beforeEach(() => {
    enrichImportedItem.mockReset();
    buildSnapshot.mockReset();
    enqueue.mockReset();
    enqueue.mockImplementation(({ handler }) => handler());
  });

  test("retorna 400 quando o EAN e invalido", async () => {
    const app = createApp();

    const response = await request(app).get("/lookup/ean/123");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "EAN deve ter 8, 12, 13 ou 14 digitos.",
      details: { ean: "123" },
      fallback: {
        code: "INVALID_EAN",
        message: "O valor enviado nao passou na validacao de EAN.",
        next_action: "corrigir_ean_e_tentar_novamente",
        attempted_sources: [],
      },
    });
    expect(enrichImportedItem).not.toHaveBeenCalled();
  });

  test("retorna produto enriquecido quando a consulta encontra um resultado publicavel", async () => {
    const app = createApp();
    enrichImportedItem.mockResolvedValue({
      enriched: true,
      requiresApproval: false,
      approvalReason: null,
      fontes_consultadas: {
        drogasil_busca: true,
        drogasil_detalhe: true,
      },
      item: {
        ean: "7898593053571",
        nome_recebido: "Calcium Maxx D3 (60 Comp) - Padrão: Único",
        dados_brutos: {
          ean: "7898593053571",
          nome_produto: "Calcium Maxx D3 (60 Comp) - Padrão: Único",
          origem_nome: "drogasil",
        },
      },
    });
    buildSnapshot.mockReturnValue({
      ean: "7898593053571",
      nomeSocial: "Calcium Maxx D3 (60 Comp) - Padrão: Único",
    });

    const response = await request(app).get("/lookup/ean/7898593053571");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "enriched",
      ean: "7898593053571",
      enriched: true,
      requiresApproval: false,
      approvalReason: null,
      fontes_consultadas: {
        drogasil_busca: true,
        drogasil_detalhe: true,
      },
      item: {
        ean: "7898593053571",
        nome_recebido: "Calcium Maxx D3 (60 Comp) - Padrão: Único",
        dados_brutos: {
          ean: "7898593053571",
          nome_produto: "Calcium Maxx D3 (60 Comp) - Padrão: Único",
          origem_nome: "drogasil",
        },
      },
      product: {
        ean: "7898593053571",
        nomeSocial: "Calcium Maxx D3 (60 Comp) - Padrão: Único",
      },
      fallback: null,
    });
    expect(buildSnapshot).toHaveBeenCalledWith({
      ean: "7898593053571",
      nome_recebido: "Calcium Maxx D3 (60 Comp) - Padrão: Único",
      dados_brutos: {
        ean: "7898593053571",
        nome_produto: "Calcium Maxx D3 (60 Comp) - Padrão: Único",
        origem_nome: "drogasil",
      },
    });
  });

  test("retorna 404 quando nenhuma fonte encontra o EAN", async () => {
    const app = createApp();
    enrichImportedItem.mockResolvedValue({
      enriched: false,
      requiresApproval: true,
      approvalReason: "Convertize sem resultado. FarmaIndex sem resultado. Drogasil sem resultado.",
      fontes_consultadas: {
        convertize_busca: false,
        farmaindex_busca: false,
        drogasil_busca: false,
      },
      item: {
        ean: "7898593053571",
        nome_recebido: null,
        dados_brutos: {
          ean: "7898593053571",
        },
      },
    });

    const response = await request(app).get("/lookup/ean/7898593053571");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      status: "not_found",
      ean: "7898593053571",
      enriched: false,
      requiresApproval: true,
      approvalReason: "Convertize sem resultado. FarmaIndex sem resultado. Drogasil sem resultado.",
      fontes_consultadas: {
        convertize_busca: false,
        farmaindex_busca: false,
        drogasil_busca: false,
      },
      item: {
        ean: "7898593053571",
        nome_recebido: null,
        dados_brutos: {
          ean: "7898593053571",
        },
      },
      product: null,
      fallback: {
        code: "LOOKUP_NOT_FOUND",
        message: "Nenhum dado foi encontrado para o EAN 7898593053571 em nenhum dos caminhos configurados.",
        next_action: "validar_ean_ou_cadastrar_manual",
        attempted_sources: [
          {
            key: "convertize",
            label: "Convertize",
            busca: false,
            detalhe: false,
            erro: null,
          },
          {
            key: "farmaindex",
            label: "FarmaIndex",
            busca: false,
            detalhe: false,
            erro: null,
          },
          {
            key: "drogasil",
            label: "Drogasil",
            busca: false,
            detalhe: false,
            erro: null,
          },
        ],
      },
    });
    expect(buildSnapshot).not.toHaveBeenCalled();
  });
});

describe("POST /lookup", () => {
  beforeEach(() => {
    enrichImportedItem.mockReset();
    buildSnapshot.mockReset();
    enqueue.mockReset();
    enqueue.mockImplementation(({ handler }) => handler());
  });

  test("retorna 400 quando o lote vier vazio", async () => {
    const app = createApp();

    const response = await request(app)
      .post("/lookup")
      .send({ eans: [] });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Envie de 1 a 10 EANs em req.body.eans.",
      details: {
        max_items: 10,
      },
    });
  });

  test("retorna 400 quando o lote excede 10 EANs", async () => {
    const app = createApp();

    const response = await request(app)
      .post("/lookup")
      .send({
        eans: Array.from({ length: 11 }, (_value, index) => `78910580175${String(index).padStart(2, "0")}`),
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "O endpoint aceita no maximo 10 EANs por requisicao.",
      details: {
        received: 11,
        max_items: 10,
      },
    });
  });

  test("processa ate 10 EANs e retorna resultado individual por item", async () => {
    const app = createApp();
    enrichImportedItem
      .mockResolvedValueOnce({
        enriched: true,
        requiresApproval: false,
        approvalReason: null,
        fontes_consultadas: {
          drogasil_busca: true,
          drogasil_detalhe: true,
        },
        item: {
          ean: "7898593053571",
          nome_recebido: "Calcium Maxx D3 (60 Comp) - Padrão: Único",
          dados_brutos: {
            ean: "7898593053571",
            nome_produto: "Calcium Maxx D3 (60 Comp) - Padrão: Único",
            origem_nome: "drogasil",
          },
        },
      })
      .mockResolvedValueOnce({
        enriched: false,
        requiresApproval: true,
        approvalReason: "Convertize sem resultado. FarmaIndex sem resultado. Drogasil sem resultado.",
        fontes_consultadas: {
          convertize_busca: false,
          farmaindex_busca: false,
          drogasil_busca: false,
        },
        item: {
          ean: "7898079001416",
          nome_recebido: null,
          dados_brutos: {
            ean: "7898079001416",
          },
        },
      });
    buildSnapshot.mockReturnValue({
      ean: "7898593053571",
      nomeSocial: "Calcium Maxx D3 (60 Comp) - Padrão: Único",
    });

    const response = await request(app)
      .post("/lookup")
      .send({
        eans: ["7898593053571", "123", "7898079001416"],
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      requested: 3,
      max_items: 10,
      max_parallel: 10,
      summary: {
        total: 3,
        enriched: 1,
        review: 0,
        not_found: 1,
        invalid_ean: 1,
        error: 0,
      },
      results: [
        {
          input_ean: "7898593053571",
          status: "enriched",
          ean: "7898593053571",
          enriched: true,
          requiresApproval: false,
          approvalReason: null,
          fontes_consultadas: {
            drogasil_busca: true,
            drogasil_detalhe: true,
          },
          item: {
            ean: "7898593053571",
            nome_recebido: "Calcium Maxx D3 (60 Comp) - Padrão: Único",
            dados_brutos: {
              ean: "7898593053571",
              nome_produto: "Calcium Maxx D3 (60 Comp) - Padrão: Único",
              origem_nome: "drogasil",
            },
          },
          product: {
            ean: "7898593053571",
            nomeSocial: "Calcium Maxx D3 (60 Comp) - Padrão: Único",
          },
          error: null,
          fallback: null,
        },
        {
          input_ean: "123",
          ean: "123",
          status: "invalid_ean",
          enriched: false,
          requiresApproval: false,
          approvalReason: "EAN deve ter 8, 12, 13 ou 14 digitos.",
          fontes_consultadas: {},
          item: null,
          product: null,
          error: "EAN deve ter 8, 12, 13 ou 14 digitos.",
          fallback: {
            code: "INVALID_EAN",
            message: "O valor enviado nao passou na validacao de EAN.",
            next_action: "corrigir_ean_e_tentar_novamente",
            attempted_sources: [],
          },
        },
        {
          input_ean: "7898079001416",
          status: "not_found",
          ean: "7898079001416",
          enriched: false,
          requiresApproval: true,
          approvalReason: "Convertize sem resultado. FarmaIndex sem resultado. Drogasil sem resultado.",
          fontes_consultadas: {
            convertize_busca: false,
            farmaindex_busca: false,
            drogasil_busca: false,
          },
          item: {
            ean: "7898079001416",
            nome_recebido: null,
            dados_brutos: {
              ean: "7898079001416",
            },
          },
          product: null,
          error: null,
          fallback: {
            code: "LOOKUP_NOT_FOUND",
            message: "Nenhum dado foi encontrado para o EAN 7898079001416 em nenhum dos caminhos configurados.",
            next_action: "validar_ean_ou_cadastrar_manual",
            attempted_sources: [
              {
                key: "convertize",
                label: "Convertize",
                busca: false,
                detalhe: false,
                erro: null,
              },
              {
                key: "farmaindex",
                label: "FarmaIndex",
                busca: false,
                detalhe: false,
                erro: null,
              },
              {
                key: "drogasil",
                label: "Drogasil",
                busca: false,
                detalhe: false,
                erro: null,
              },
            ],
          },
        },
      ],
    });
    expect(enrichImportedItem).toHaveBeenCalledTimes(2);
  });
});
