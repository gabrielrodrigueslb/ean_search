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
          farmaindex_busca: true,
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

    const service = new ImportService();

    const status = await service.processSingleItem(12, {
      ean: "7891058017507",
      nome_recebido: "Dorflex",
      fonte: "json",
      dados_brutos: {
        origem_nome: "json",
      },
    });

    expect(status).toBe("enriched");
    expect(bancoUnicoService.publishProduct).toHaveBeenCalledTimes(1);
    expect(repository.createProdutoFallbackApi).toHaveBeenCalledWith(expect.objectContaining({
      importacao_id: 12,
      item_importacao_id: 77,
      ean: "7891058017507",
      motivo_falha: "Falha ao publicar produto na Banco Unico API. Status 502.",
      status: "pending_replay",
    }));
    expect(repository.updateItem).toHaveBeenLastCalledWith(77, expect.objectContaining({
      status: "enriched",
      fontes_consultadas: expect.objectContaining({
        action: "stored_fallback",
        destination: "postgres_fallback_api",
      }),
    }));
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

    const service = new ImportService();
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
});
