import { describe, expect, jest, test } from "@jest/globals";
import { EnrichmentService } from "../src/services/enrichment.service.js";

describe("EnrichmentService session cache", () => {
  test("reaproveita consultas externas para o mesmo EAN dentro da mesma importacao", async () => {
    const lookupByEan = jest.fn()
      .mockResolvedValueOnce({
        convertize: {
          key: "convertize",
          result: {
            nome: "Suplemento Alimentar Zafolat Plus 90 Capsulas",
            origem: "convertize",
            categoria: "Suplementos",
          },
          detail: null,
          error: null,
        },
        drogasil: {
          key: "drogasil",
          result: null,
          detail: null,
          error: null,
        },
      });

    const service = new EnrichmentService({
      lookupSourceRegistry: {
        lookupByEan,
      },
    });
    const session = service.createSession();

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

    expect(lookupByEan).toHaveBeenCalledTimes(1);
    expect(first.fontes_consultadas.cache_hit).toBe(false);
    expect(second.fontes_consultadas.cache_hit).toBe(true);
    expect(second.item.nome_recebido).toBe("Suplemento Alimentar Zafolat Plus 90 Capsulas");
    expect(second.item.dados_brutos.origem_nome).toBe("convertize");
  });

  test("deixa item da vtex passar com dados brutos quando nao houver match externo", async () => {
    const lookupByEan = jest.fn().mockResolvedValueOnce({
      convertize: {
        key: "convertize",
        result: null,
        detail: null,
        error: null,
      },
      drogasil: {
        key: "drogasil",
        result: null,
        detail: null,
        error: null,
      },
    });

    const service = new EnrichmentService({
      lookupSourceRegistry: {
        lookupByEan,
      },
    });

    const result = await service.enrichImportedItem({
      ean: "7896226500416",
      nome_recebido: "Hidratante Corporal VTEX",
      fonte: "vtex",
      dados_brutos: {
        origem_nome: "vtex",
        origem_dados: "vtex",
        nome: "Hidratante Corporal VTEX",
        nome_produto: "Hidratante Corporal VTEX",
        nome_exibicao: "Hidratante Corporal VTEX",
        categoria: "Perfumaria",
      },
    });

    expect(result.enriched).toBe(true);
    expect(result.requiresApproval).toBe(false);
    expect(result.item.nome_recebido).toBe("Hidratante Corporal VTEX");
    expect(result.item.dados_brutos.origem_nome).toBe("vtex");
    expect(result.fontes_consultadas.pass_through_source).toBe("vtex");
  });

  test("deixa item do csv passar quando o nome bruto e estruturado e nao ha match externo", async () => {
    const lookupByEan = jest.fn().mockResolvedValueOnce({
      convertize: {
        key: "convertize",
        result: null,
        detail: null,
        error: null,
      },
      drogasil: {
        key: "drogasil",
        result: null,
        detail: null,
        error: null,
      },
      openai_web: {
        key: "openai_web",
        result: null,
        detail: null,
        error: "OpenAI Web indisponivel temporariamente por limite de consultas (429).",
      },
    });

    const service = new EnrichmentService({
      lookupSourceRegistry: {
        lookupByEan,
      },
    });

    const result = await service.enrichImportedItem({
      ean: "7897947622227",
      nome_recebido: "Creme Hidratante Para Maos Carmed Chocolate 40g",
      fonte: "csv",
      dados_brutos: {
        origem_dados: "csv",
        nome: "Creme Hidratante Para Maos Carmed Chocolate 40g",
        nome_produto: "Creme Hidratante Para Maos Carmed Chocolate 40g",
        nome_exibicao: "Creme Hidratante Para Maos Carmed Chocolate 40g",
        categoria: "Perfumaria",
      },
    });

    expect(result.enriched).toBe(true);
    expect(result.requiresApproval).toBe(false);
    expect(result.item.nome_recebido).toBe("Creme Hidratante Para Maos Carmed Chocolate 40g");
    expect(result.item.dados_brutos.origem_nome).toBe("csv");
    expect(result.fontes_consultadas.raw_name_fallback_source).toBe("csv");
  });

  test("mantem medicamento em revisao quando nao houver principio ativo e nem match externo", async () => {
    const lookupByEan = jest.fn().mockResolvedValueOnce({
      convertize: {
        key: "convertize",
        result: null,
        detail: null,
        error: null,
      },
      drogasil: {
        key: "drogasil",
        result: null,
        detail: null,
        error: null,
      },
    });

    const service = new EnrichmentService({
      lookupSourceRegistry: {
        lookupByEan,
      },
    });

    const result = await service.enrichImportedItem({
      ean: "7898582272235",
      nome_recebido: "Optaflan 12 Comprimidos",
      fonte: "csv",
      dados_brutos: {
        origem_dados: "csv",
        nome: "Optaflan 12 Comprimidos",
        nome_produto: "Optaflan 12 Comprimidos",
        nome_exibicao: "Optaflan 12 Comprimidos",
        categoria: "Medicamento",
      },
    });

    expect(result.enriched).toBe(false);
    expect(result.requiresApproval).toBe(true);
  });

  test("prefere nome bruto confiavel do csv quando o lookup encontrado nao e fonte confiavel", async () => {
    const lookupByEan = jest.fn().mockResolvedValueOnce({
      openai_web: {
        key: "openai_web",
        result: {
          nome: "Nome Generico Encontrado",
          nome_produto: "Nome Generico Encontrado",
          nome_exibicao: "Nome Generico Encontrado 30 Capsulas",
          categoria: "Suplementos",
        },
        detail: {
          info: {
            produto: "Nome Generico Encontrado",
            apresentacao: "30 Capsulas",
            categoria: "Suplementos",
          },
        },
        error: null,
      },
    });

    const service = new EnrichmentService({
      lookupSourceRegistry: {
        lookupByEan,
      },
    });

    const result = await service.enrichImportedItem({
      ean: "7908079515292",
      nome_recebido: "Suplemento Alimentar Borg Magnesio Taurato Com 60 Capsulas",
      fonte: "csv",
      dados_brutos: {
        origem_dados: "csv",
        nome: "Suplemento Alimentar Borg Magnesio Taurato Com 60 Capsulas",
        nome_produto: "Suplemento Alimentar Borg Magnesio Taurato Com 60 Capsulas",
        nome_exibicao: "Suplemento Alimentar Borg Magnesio Taurato Com 60 Capsulas",
        categoria: "Suplementos",
      },
    });

    expect(result.enriched).toBe(true);
    expect(result.requiresApproval).toBe(false);
    expect(result.item.nome_recebido).toBe("Suplemento Alimentar Borg Magnesio Taurato Com 60 Capsulas");
    expect(result.item.dados_brutos.origem_nome).toBe("csv");
    expect(result.fontes_consultadas.raw_name_fallback_reason).toBe(
      "trusted_raw_name_preferred_over_untrusted_lookup",
    );
  });

  test("nao deixa passar nome bruto abreviado do csv sem resolucao externa", async () => {
    const lookupByEan = jest.fn().mockResolvedValueOnce({
      convertize: {
        key: "convertize",
        result: null,
        detail: null,
        error: null,
      },
      drogasil: {
        key: "drogasil",
        result: null,
        detail: null,
        error: null,
      },
    });

    const service = new EnrichmentService({
      lookupSourceRegistry: {
        lookupByEan,
      },
    });

    const result = await service.enrichImportedItem({
      ean: "7891234567890",
      nome_recebido: "SH PALMOLIVE 350ML NUTRI LISS",
      fonte: "csv",
      dados_brutos: {
        origem_dados: "csv",
        nome: "SH PALMOLIVE 350ML NUTRI LISS",
        nome_produto: "SH PALMOLIVE 350ML NUTRI LISS",
        nome_exibicao: "SH PALMOLIVE 350ML NUTRI LISS",
        categoria: "Perfumaria",
      },
    });

    expect(result.enriched).toBe(false);
    expect(result.requiresApproval).toBe(true);
  });

  test("nao deixa passar abreviacoes comerciais como COND no fallback cru do csv", async () => {
    const lookupByEan = jest.fn().mockResolvedValueOnce({
      convertize: {
        key: "convertize",
        result: null,
        detail: null,
        error: null,
      },
      drogasil: {
        key: "drogasil",
        result: null,
        detail: null,
        error: null,
      },
    });

    const service = new EnrichmentService({
      lookupSourceRegistry: {
        lookupByEan,
      },
    });

    const result = await service.enrichImportedItem({
      ean: "7891024185070",
      nome_recebido: "COND DARLING CALEN 350ML",
      fonte: "csv",
      dados_brutos: {
        origem_dados: "csv",
        nome: "COND DARLING CALEN 350ML",
        nome_produto: "COND DARLING CALEN 350ML",
        nome_exibicao: "COND DARLING CALEN 350ML",
        categoria: "Perfumaria",
      },
    });

    expect(result.enriched).toBe(false);
    expect(result.requiresApproval).toBe(true);
  });

  test("nao deixa passar apresentacao abreviada como 10CPR no fallback cru do csv", async () => {
    const lookupByEan = jest.fn().mockResolvedValueOnce({
      convertize: {
        key: "convertize",
        result: null,
        detail: null,
        error: null,
      },
      drogasil: {
        key: "drogasil",
        result: null,
        detail: null,
        error: null,
      },
    });

    const service = new EnrichmentService({
      lookupSourceRegistry: {
        lookupByEan,
      },
    });

    const result = await service.enrichImportedItem({
      ean: "7896004711263",
      nome_recebido: "BETAMETASONA 2MG 10CPR GERMED",
      fonte: "csv",
      dados_brutos: {
        origem_dados: "csv",
        nome: "BETAMETASONA 2MG 10CPR GERMED",
        nome_produto: "BETAMETASONA 2MG 10CPR GERMED",
        nome_exibicao: "BETAMETASONA 2MG 10CPR GERMED",
        categoria: "Perfumaria",
      },
    });

    expect(result.enriched).toBe(false);
    expect(result.requiresApproval).toBe(true);
  });

  test("nao deixa passar abreviacoes cosmeticas como DESCOL no fallback cru do csv", async () => {
    const lookupByEan = jest.fn().mockResolvedValueOnce({
      convertize: {
        key: "convertize",
        result: null,
        detail: null,
        error: null,
      },
      drogasil: {
        key: "drogasil",
        result: null,
        detail: null,
        error: null,
      },
    });

    const service = new EnrichmentService({
      lookupSourceRegistry: {
        lookupByEan,
      },
    });

    const result = await service.enrichImportedItem({
      ean: "7896009159879",
      nome_recebido: "DESCOL LUMINOUS 50G CAMOMILA",
      fonte: "csv",
      dados_brutos: {
        origem_dados: "csv",
        nome: "DESCOL LUMINOUS 50G CAMOMILA",
        nome_produto: "DESCOL LUMINOUS 50G CAMOMILA",
        nome_exibicao: "DESCOL LUMINOUS 50G CAMOMILA",
        categoria: "Perfumaria",
      },
    });

    expect(result.enriched).toBe(false);
    expect(result.requiresApproval).toBe(true);
  });

  test("usa o nome corrigido pela busca quando o csv vier abreviado e a resolucao externa melhorar o registro", async () => {
    const lookupByEan = jest.fn().mockResolvedValueOnce({
      openai_web: {
        key: "openai_web",
        result: {
          nome: "Shampoo Palmolive Naturals Nutri Liss",
          nome_produto: "Shampoo Palmolive Naturals Nutri Liss",
          nome_exibicao: "Shampoo Palmolive Naturals Nutri Liss 350ml",
          categoria: "Perfumaria",
        },
        detail: {
          info: {
            produto: "Shampoo Palmolive Naturals Nutri Liss",
            apresentacao: "350ml",
            categoria: "Perfumaria",
          },
        },
        error: null,
      },
    });

    const service = new EnrichmentService({
      lookupSourceRegistry: {
        lookupByEan,
      },
    });

    const result = await service.enrichImportedItem({
      ean: "7891234567890",
      nome_recebido: "SH PALMOLIVE 350ML NUTRI LISS",
      fonte: "csv",
      dados_brutos: {
        origem_dados: "csv",
        nome: "SH PALMOLIVE 350ML NUTRI LISS",
        nome_produto: "SH PALMOLIVE 350ML NUTRI LISS",
        nome_exibicao: "SH PALMOLIVE 350ML NUTRI LISS",
        categoria: "Perfumaria",
      },
    });

    expect(result.enriched).toBe(true);
    expect(result.requiresApproval).toBe(false);
    expect(result.item.nome_recebido).toBe("Shampoo Palmolive Naturals Nutri Liss 350ml");
    expect(result.item.dados_brutos.origem_nome).toBe("openai_web");
    expect(result.fontes_consultadas.raw_name_fallback_reason).toBe(
      "lookup_resolved_abbreviated_raw_name",
    );
  });
});
