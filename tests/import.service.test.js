import { afterEach, describe, expect, jest, test } from "@jest/globals";

const ImportacaoRepositoryMock = jest.fn();
const EnrichmentServiceMock = jest.fn();
const BancoUnicoServiceMock = jest.fn();
const importQueueService = {
  enqueue: jest.fn(),
};

jest.unstable_mockModule("../src/repositories/importacao.repository.js", () => ({
  ImportacaoRepository: ImportacaoRepositoryMock,
}));

jest.unstable_mockModule("../src/services/enrichment.service.js", () => ({
  EnrichmentService: EnrichmentServiceMock,
}));

jest.unstable_mockModule("../src/services/banco-unico.service.js", () => ({
  BancoUnicoService: BancoUnicoServiceMock,
}));

jest.unstable_mockModule("../src/services/import-queue.service.js", () => ({
  importQueueService,
}));

const { ImportacaoRepository } = await import("../src/repositories/importacao.repository.js");
const { EnrichmentService } = await import("../src/services/enrichment.service.js");
const { BancoUnicoService } = await import("../src/services/banco-unico.service.js");
const { ImportService } = await import("../src/services/import.service.js");
const envModule = await import("../src/config/env.js");
const env = envModule.default;

describe("ImportService processSingleItem", () => {
  afterEach(() => {
    env.importItemConcurrency = 3;
  });

  test("salva fallback no Postgres quando a publicacao na API falha", async () => {
    const repository = {
      createItem: jest.fn().mockResolvedValue({
        id: 77,
        importacao_id: 12,
        ean: "7891058017507",
        nome_recebido: "Dorflex 36 Comprimidos",
      }),
      updateItem: jest.fn().mockResolvedValue({}),
      createProdutoAprovacao: jest.fn(),
      createProdutoFallbackApi: jest.fn().mockResolvedValue({ id: 900 }),
    };

    const enrichmentService = {
      enrichImportedItem: jest.fn().mockResolvedValue({
        enriched: true,
        requiresApproval: false,
        item: {
          ean: "7891058017507",
          nome_recebido: "Dorflex 36 Comprimidos",
          dados_brutos: {
            origem_nome: "convertize",
            nome: "Dorflex",
            nome_produto: "Dorflex",
            nome_exibicao: "Dorflex 36 Comprimidos",
            categoria: "Analgesico",
            laboratorio: "Opella",
            farmacos: [{ nome: "Dipirona" }],
          },
        },
        fontes_consultadas: {
          convertize_busca: true,
        },
      }),
      createSession: jest.fn(),
    };

    const bancoUnicoService = {
      publishProduct: jest.fn().mockRejectedValue(Object.assign(
        new Error("Falha ao publicar produto na Banco Unico API. Status 502."),
        { status: 502, details: { error: "bad gateway" } },
      )),
    };

    ImportacaoRepository.mockImplementation(() => repository);
    EnrichmentService.mockImplementation(() => enrichmentService);
    BancoUnicoService.mockImplementation(() => bancoUnicoService);

    const mercadologicalClassificationService = {
      classifyItem: jest.fn(async (item) => item),
    };
    const service = new ImportService({
      mercadologicalClassificationService,
    });

    const status = await service.processSingleItem(12, {
      ean: "7891058017507",
      nome_recebido: "Dorflex",
      fonte: "json",
      dados_brutos: {
        origem_nome: "json",
      },
    });

    expect(status).toBe("failed");
    expect(bancoUnicoService.publishProduct).toHaveBeenCalledTimes(1);
    expect(repository.createProdutoFallbackApi).toHaveBeenCalledWith(expect.objectContaining({
      importacao_id: 12,
      item_importacao_id: 77,
      ean: "7891058017507",
      motivo_falha: "Falha ao publicar produto na Banco Unico API. Status 502.",
      status: "pending_replay",
    }));
    expect(repository.updateItem).toHaveBeenLastCalledWith(77, expect.objectContaining({
      status: "failed",
      fontes_consultadas: expect.objectContaining({
        action: "stored_fallback",
        destination: "postgres_fallback_api",
        publish_status: "pending_replay",
      }),
    }));
  });

  test("contabiliza fallback da API como falha e nao como sucesso", async () => {
    const repository = {
      updateItem: jest.fn().mockResolvedValue({}),
      createProdutoFallbackApi: jest.fn().mockResolvedValue({ id: 901 }),
    };

    ImportacaoRepository.mockImplementation(() => repository);
    EnrichmentService.mockImplementation(() => ({
      createSession: jest.fn(),
      enrichImportedItem: jest.fn(),
    }));
    BancoUnicoService.mockImplementation(() => ({
      publishProduct: jest.fn().mockRejectedValue(new Error("Falha na API externa")),
    }));

    const service = new ImportService({
      mercadologicalClassificationService: {
        classifyItem: jest.fn(async (item) => item),
      },
    });
    service.incrementImportCounters = jest.fn().mockResolvedValue({});

    const result = await service.publishPreparedEntriesBatch(12, [{
      importItem: {
        id: 78,
        nome_recebido: "Dorflex 36 Comprimidos",
      },
      item: {
        fonte: "json",
      },
      validation: {
        ean: "7891058017507",
      },
      enriched: {
        item: {
          nome_recebido: "Dorflex 36 Comprimidos",
        },
        fontes_consultadas: {
          convertize_busca: true,
        },
      },
      productPayload: {
        ean: "7891058017507",
      },
    }]);

    expect(result).toEqual({
      status: "failed",
      publishedCount: 0,
      fallbackCount: 1,
    });
    expect(service.incrementImportCounters).toHaveBeenCalledWith(12, "failed");
    expect(service.incrementImportCounters).not.toHaveBeenCalledWith(12, "enriched");
  });

  test("processa itens em paralelo com concorrencia configuravel", async () => {
    env.importItemConcurrency = 3;

    const repository = {
      createItem: jest.fn(),
      updateItem: jest.fn(),
      createProdutoAprovacao: jest.fn(),
      createProdutoFallbackApi: jest.fn(),
      incrementImportacaoCounters: jest.fn().mockResolvedValue({}),
    };

    ImportacaoRepository.mockImplementation(() => repository);
    EnrichmentService.mockImplementation(() => ({
      createSession: jest.fn(),
      enrichImportedItem: jest.fn(),
    }));
    BancoUnicoService.mockImplementation(() => ({
      publishProduct: jest.fn(),
    }));

    const service = new ImportService({
      mercadologicalClassificationService: {
        classifyItem: jest.fn(async (item) => item),
      },
    });
    const activeIndexes = new Set();
    let maxParallelism = 0;

    service.processSingleItem = jest.fn(async (_importacaoId, item) => {
      activeIndexes.add(item.idx);
      maxParallelism = Math.max(maxParallelism, activeIndexes.size);
      await new Promise((resolve) => setTimeout(resolve, 25));
      activeIndexes.delete(item.idx);
      return "enriched";
    });

    service.incrementImportCounters = jest.fn().mockResolvedValue({});

    const items = Array.from({ length: 6 }, (_, idx) => ({
      idx,
      ean: `789000000000${idx}`,
    }));

    await service.processBatchItems(12, items, null, null);

    expect(service.processSingleItem).toHaveBeenCalledTimes(6);
    expect(service.incrementImportCounters).toHaveBeenCalledTimes(6);
    expect(maxParallelism).toBeGreaterThan(1);
    expect(maxParallelism).toBeLessThanOrEqual(3);
  });

  test("item vindo do banco do cliente ainda passa pelo enriquecimento externo", async () => {
    const repository = {
      createItem: jest.fn().mockResolvedValue({
        id: 88,
        importacao_id: 13,
        ean: "7893736007527",
        nome_recebido: "ACETICIL 100MG ENV 10CP",
      }),
      updateItem: jest.fn().mockResolvedValue({}),
      createProdutoAprovacao: jest.fn(),
      createProdutoFallbackApi: jest.fn(),
    };

    const enrichmentService = {
      enrichImportedItem: jest.fn().mockResolvedValue({
        enriched: true,
        requiresApproval: false,
        item: {
          ean: "7893736007527",
          nome_recebido: "ACETICIL 100MG ENV 10CP",
          dados_brutos: {
            origem_nome: "convertize",
            origem_dados: "convertize",
            nome: "Aceticil",
            nome_produto: "Aceticil",
            nome_exibicao: "Aceticil 100mg 10 Comprimidos",
            farmacos: [{ nome: "Acido Acetilsalicilico" }],
          },
        },
        fontes_consultadas: {
          convertize_busca: true,
          encontrado: true,
        },
      }),
      createSession: jest.fn(),
    };

    const bancoUnicoService = {
      publishProduct: jest.fn().mockResolvedValue({ ok: true }),
    };

    ImportacaoRepository.mockImplementation(() => repository);
    EnrichmentService.mockImplementation(() => enrichmentService);
    BancoUnicoService.mockImplementation(() => bancoUnicoService);

    const service = new ImportService({
      mercadologicalClassificationService: {
        classifyItem: jest.fn(async (item) => item),
      },
    });

    const status = await service.processSingleItem(13, {
      ean: "7893736007527",
      nome_recebido: "ACETICIL 100MG ENV 10CP",
      fonte: "cliente_postgres",
      dados_brutos: {
        origem_nome: "cliente_postgres",
        origem_dados: "cliente_postgres",
        nome: "ACETICIL 100MG ENV 10CP",
        nome_produto: "ACETICIL 100MG ENV 10CP",
        nome_exibicao: "ACETICIL 100MG ENV 10CP",
      },
    });

    expect(status).toBe("enriched");
    expect(enrichmentService.enrichImportedItem).toHaveBeenCalledTimes(1);
    expect(bancoUnicoService.publishProduct).toHaveBeenCalledTimes(1);
    expect(repository.updateItem).toHaveBeenLastCalledWith(88, expect.objectContaining({
      status: "enriched",
      fontes_consultadas: expect.objectContaining({
        action: "published",
        convertize_busca: true,
      }),
    }));
  });

  test("nao cai na IA quando uma fonte de enriquecimento falha", async () => {
    const repository = {
      createItem: jest.fn().mockResolvedValue({
        id: 188,
        importacao_id: 15,
        ean: "7893736007527",
        nome_recebido: "ACETICIL 100MG ENV 10CP",
      }),
      updateItem: jest.fn().mockResolvedValue({}),
      createProdutoAprovacao: jest.fn(),
      createProdutoFallbackApi: jest.fn(),
    };

    const enrichmentService = {
      enrichImportedItem: jest.fn().mockResolvedValue({
        enriched: true,
        requiresApproval: false,
        item: {
          ean: "7893736007527",
          nome_recebido: "ACETICIL 100MG ENV 10CP",
          dados_brutos: {
            origem_nome: "cliente_postgres",
            origem_dados: "cliente_postgres",
            nome: "ACETICIL 100MG ENV 10CP",
            nome_produto: "ACETICIL 100MG ENV 10CP",
            nome_exibicao: "ACETICIL 100MG ENV 10CP",
          },
        },
        fontes_consultadas: {
          convertize_busca: false,
          convertize_busca_error: "timeout",
          drogasil_busca: false,
          drogasil_busca_error: null,
          pass_through_source: "cliente_postgres",
          encontrado: true,
        },
      }),
      createSession: jest.fn(),
    };

    const bancoUnicoService = {
      publishProduct: jest.fn().mockResolvedValue({ ok: true }),
    };

    const mercadologicalClassificationService = {
      classifyItem: jest.fn(async (item) => ({
        ...item,
        dados_brutos: {
          ...(item.dados_brutos || {}),
          classificacao_mercadologica: {
            source: "heuristic_ai_disabled",
          },
        },
      })),
    };

    ImportacaoRepository.mockImplementation(() => repository);
    EnrichmentService.mockImplementation(() => enrichmentService);
    BancoUnicoService.mockImplementation(() => bancoUnicoService);

    const service = new ImportService({
      mercadologicalClassificationService,
    });

    const status = await service.processSingleItem(15, {
      ean: "7893736007527",
      nome_recebido: "ACETICIL 100MG ENV 10CP",
      fonte: "cliente_postgres",
      dados_brutos: {
        origem_nome: "cliente_postgres",
        origem_dados: "cliente_postgres",
        nome: "ACETICIL 100MG ENV 10CP",
      },
    });

    expect(status).toBe("enriched");
    expect(mercadologicalClassificationService.classifyItem).toHaveBeenCalledWith(
      expect.objectContaining({
        ean: "7893736007527",
      }),
      expect.objectContaining({
        disableAi: true,
        disableAiReason: "falha em uma ou mais fontes de enriquecimento",
      }),
    );
  });

  test("item vindo da vtex tambem e espelhado no fallback dedicado", async () => {
    const repository = {
      createItem: jest.fn().mockResolvedValue({
        id: 99,
        importacao_id: 14,
        ean: "7891317001056",
        nome_recebido: "Acetilcisteina Eurofarma 100mg 16 envelopes",
      }),
      updateItem: jest.fn().mockResolvedValue({}),
      createProdutoAprovacao: jest.fn(),
      createProdutoFallbackApi: jest.fn(),
      createProdutoFallbackVtex: jest.fn().mockResolvedValue({ id: 1001 }),
    };

    const enrichmentService = {
      enrichImportedItem: jest.fn().mockResolvedValue({
        enriched: true,
        requiresApproval: false,
        item: {
          ean: "7891317001056",
          nome_recebido: "Acetilcisteina Eurofarma 100mg 16 envelopes",
          dados_brutos: {
            origem_nome: "drogasil",
            origem_dados: "drogasil",
            nome: "Acetilcisteina Eurofarma",
            nome_produto: "Acetilcisteina Eurofarma",
            nome_exibicao: "Acetilcisteina Eurofarma 100mg 16 envelopes",
            categoria: "Tosse Com Catarro",
            laboratorio: "Eurofarma",
            farmacos: [{ nome: "Acetilcisteina" }],
          },
        },
        fontes_consultadas: {
          drogasil_busca: true,
          drogasil_detalhe: true,
          encontrado: true,
        },
      }),
      createSession: jest.fn(),
    };

    const bancoUnicoService = {
      publishProduct: jest.fn().mockResolvedValue({ ok: true }),
    };

    ImportacaoRepository.mockImplementation(() => repository);
    EnrichmentService.mockImplementation(() => enrichmentService);
    BancoUnicoService.mockImplementation(() => bancoUnicoService);

    const service = new ImportService({
      mercadologicalClassificationService: {
        classifyItem: jest.fn(async (item) => item),
      },
    });

    const status = await service.processSingleItem(14, {
      ean: "7891317001056",
      nome_recebido: "Acetilcisteina Eurofarma 100mg 16 envelopes",
      fonte: "vtex",
      dados_brutos: {
        origem_nome: "vtex",
        origem_dados: "vtex",
        skuId: 20,
        productId: 20,
        nome: "Acetilcisteina Eurofarma 100mg 16 envelopes",
      },
    });

    expect(status).toBe("enriched");
    expect(repository.createProdutoFallbackVtex).toHaveBeenCalledWith(expect.objectContaining({
      importacao_id: 14,
      item_importacao_id: 99,
      ean: "7891317001056",
      status_processamento: "enriched",
      payload_origem: expect.objectContaining({
        origem_nome: "vtex",
        origem_dados: "vtex",
        skuId: 20,
      }),
      payload_enriquecido: expect.objectContaining({
        origem_nome: "drogasil",
        origem_dados: "drogasil",
      }),
      produto_payload: expect.objectContaining({
        ean: "7891317001056",
        principioAtivo: "Acetilcisteina",
      }),
      fontes_consultadas: expect.objectContaining({
        source: "vtex",
        drogasil_busca: true,
      }),
    }));
  });

  test("descarta produtos ja existentes no Banco Unico antes do enriquecimento externo", async () => {
    const repository = {
      createItem: jest
        .fn()
        .mockResolvedValueOnce({
          id: 201,
          importacao_id: 20,
          ean: "7891058017507",
          nome_recebido: "Dorflex 36 comprimidos",
        })
        .mockResolvedValueOnce({
          id: 202,
          importacao_id: 20,
          ean: "7899547531213",
          nome_recebido: "Dipirona 500mg 30 comprimidos",
        }),
      updateItem: jest.fn().mockResolvedValue({}),
      createProdutoAprovacao: jest.fn(),
      createProdutoFallbackApi: jest.fn(),
      incrementImportacaoCounters: jest.fn().mockResolvedValue({}),
      updateImportacao: jest.fn().mockResolvedValue({}),
    };

    const enrichmentService = {
      enrichImportedItem: jest.fn().mockResolvedValue({
        enriched: true,
        requiresApproval: false,
        item: {
          ean: "7899547531213",
          nome_recebido: "Dipirona 500mg 30 comprimidos",
          dados_brutos: {
            origem_nome: "drogasil",
            origem_dados: "drogasil",
            nome: "Dipirona 500mg 30 comprimidos",
            nome_produto: "Dipirona 500mg 30 comprimidos",
            nome_exibicao: "Dipirona 500mg 30 comprimidos",
            categoria: "Dor e Febre",
            subcategoria: "Analgesicos",
            laboratorio: "Prati",
            farmacos: [{ nome: "Dipirona Monoidratada" }],
          },
        },
        fontes_consultadas: {
          drogasil_busca: true,
          drogasil_detalhe: true,
        },
      }),
      createSession: jest.fn(() => ({ lookupCache: new Map() })),
    };

    const bancoUnicoService = {
      searchProductsByEans: jest.fn().mockResolvedValue({
        requested: 2,
        returned: 1,
        missing: 1,
        products: [
          { ean: "7891058017507", descricaoProduto: "Dorflex 36 comprimidos" },
        ],
        missingEans: ["7899547531213"],
      }),
      publishProduct: jest.fn().mockResolvedValue({ ok: true }),
    };

    ImportacaoRepository.mockImplementation(() => repository);
    EnrichmentService.mockImplementation(() => enrichmentService);
    BancoUnicoService.mockImplementation(() => bancoUnicoService);

    const service = new ImportService({
      mercadologicalClassificationService: {
        classifyItem: jest.fn(async (item) => item),
      },
    });

    await service.processStagedProviderItems({
      importacaoId: 20,
      stagedEntries: [
        {
          item: { ean: "7891058017507", nome_recebido: "Dorflex 36 comprimidos", fonte: "trier" },
          importItem: { id: 201, importacao_id: 20, nome_recebido: "Dorflex 36 comprimidos" },
        },
        {
          item: { ean: "7899547531213", nome_recebido: "Dipirona 500mg 30 comprimidos", fonte: "trier" },
          importItem: { id: 202, importacao_id: 20, nome_recebido: "Dipirona 500mg 30 comprimidos" },
        },
      ],
      enrichmentSession: { lookupCache: new Map() },
      productApi: {},
    });

    expect(bancoUnicoService.searchProductsByEans).toHaveBeenCalledWith(
      ["7891058017507", "7899547531213"],
      {},
    );
    expect(enrichmentService.enrichImportedItem).toHaveBeenCalledTimes(1);
    expect(enrichmentService.enrichImportedItem).toHaveBeenCalledWith(expect.objectContaining({
      ean: "7899547531213",
    }), expect.anything());
    expect(bancoUnicoService.publishProduct).toHaveBeenCalledTimes(1);
    expect(repository.updateItem).toHaveBeenCalledWith(201, expect.objectContaining({
      status: "enriched",
      mensagem_erro: "Produto descartado porque o EAN 7891058017507 ja existe no Banco Unico.",
      fontes_consultadas: expect.objectContaining({
        action: "skipped_existing_in_banco_unico",
      }),
    }));
  });

  test("descarta EAN duplicado quando ele reaparece em lotes diferentes do pipeline", async () => {
    const repository = {
      createItem: jest.fn(),
      updateItem: jest.fn().mockImplementation(async (id, data) => ({
        id,
        ...data,
      })),
      createProdutoAprovacao: jest.fn(),
      createProdutoFallbackApi: jest.fn(),
      incrementImportacaoCounters: jest.fn().mockResolvedValue({}),
      updateImportacao: jest.fn().mockResolvedValue({}),
    };

    const enrichmentService = {
      enrichImportedItem: jest.fn().mockResolvedValue({
        enriched: true,
        requiresApproval: false,
        item: {
          ean: "7899547531213",
          nome_recebido: "Dipirona 500mg 30 comprimidos",
          dados_brutos: {
            origem_nome: "drogasil",
            origem_dados: "drogasil",
            nome: "Dipirona 500mg 30 comprimidos",
          },
        },
        fontes_consultadas: {
          drogasil_busca: true,
        },
      }),
      createSession: jest.fn(() => ({ lookupCache: new Map() })),
    };

    const bancoUnicoService = {
      searchProductsByEans: jest.fn().mockResolvedValue({
        requested: 1,
        returned: 0,
        missing: 1,
        products: [],
        missingEans: ["7899547531213"],
      }),
      publishProduct: jest.fn().mockResolvedValue({ ok: true }),
    };

    ImportacaoRepository.mockImplementation(() => repository);
    EnrichmentService.mockImplementation(() => enrichmentService);
    BancoUnicoService.mockImplementation(() => bancoUnicoService);

    const service = new ImportService({
      mercadologicalClassificationService: {
        classifyItem: jest.fn(async (item) => item),
      },
    });

    const sharedSeenEans = new Set();

    await service.processStagedProviderItems({
      importacaoId: 21,
      stagedEntries: [
        {
          item: { ean: "7899547531213", nome_recebido: "Dipirona 500mg 30 comprimidos", fonte: "trier" },
          importItem: { id: 301, importacao_id: 21, nome_recebido: "Dipirona 500mg 30 comprimidos" },
        },
      ],
      enrichmentSession: { lookupCache: new Map() },
      productApi: {},
      sharedSeenEans,
    });

    await service.processStagedProviderItems({
      importacaoId: 21,
      stagedEntries: [
        {
          item: { ean: "7899547531213", nome_recebido: "Dipirona 500mg 30 comprimidos", fonte: "trier" },
          importItem: { id: 302, importacao_id: 21, nome_recebido: "Dipirona 500mg 30 comprimidos" },
        },
      ],
      enrichmentSession: { lookupCache: new Map() },
      productApi: {},
      sharedSeenEans,
    });

    expect(enrichmentService.enrichImportedItem).toHaveBeenCalledTimes(1);
    expect(repository.updateItem).toHaveBeenCalledWith(302, expect.objectContaining({
      status: "enriched",
      mensagem_erro: "Produto descartado por EAN duplicado no lote do provedor: 7899547531213.",
      fontes_consultadas: expect.objectContaining({
        action: "skipped_duplicate_in_provider_batch",
      }),
    }));
  });
});
