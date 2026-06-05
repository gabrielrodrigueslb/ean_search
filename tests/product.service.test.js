import { describe, expect, test } from "@jest/globals";
import { EMBEDDING_DIMENSIONS, ProductService } from "../src/services/product.service.js";

describe("ProductService.buildSnapshot", () => {
  test("rejeita nome vindo apenas da Trier", () => {
    const service = new ProductService();

    expect(() => service.buildSnapshot({
      ean: "7890000000000",
      nome_recebido: "LENCOS UMED.BABY WIPES C500 AZ",
      dados_brutos: {
        origem_nome: "trier",
        nome_trier: "LENCOS UMED.BABY WIPES C500 AZ",
        nome_produto_trier: "LENCOS UMED.BABY WIPES C500 AZ",
        nome_exibicao_trier: "LENCOS UMED.BABY WIPES C500 AZ",
        categoria: "Higiene",
      },
    })).toThrow("Nome do produto nao foi validado por Convertize, FarmaIndex, Drogasil ou VTEX.");
  });

  test("monta documento unico para nome validado pela Convertize", () => {
    const service = new ProductService();
    const snapshot = service.buildSnapshot({
      ean: "7890000000001",
      nome_recebido: "Lencos Umedecidos Baby Wipes 500 Unidades",
      dados_brutos: {
        origem_nome: "convertize",
        nome: "Lencos Umedecidos Baby Wipes 500 Unidades",
        nome_produto: "Lencos Umedecidos Baby Wipes 500 Unidades",
        nome_exibicao: "Lencos Umedecidos Baby Wipes 500 Unidades",
        categoria: "Higiene",
      },
    });

    expect(snapshot.nomeSocial).toBe("Lencos Umedecidos Baby Wipes 500 Unidades");
    expect(snapshot.descricaoProduto).toBe("Lencos Umedecidos Baby Wipes 500 Unidades");
    expect(snapshot.classificacao).toBe("Higiene");
    expect(snapshot.debug_tokens.length).toBe(snapshot.debug_token_count);
    expect(snapshot.debug_embedding_dimensions).toBe(EMBEDDING_DIMENSIONS);
  });

  test("usa ingredientes ativos quando disponiveis", () => {
    const service = new ProductService();
    const snapshot = service.buildSnapshot({
      ean: "7896023705397",
      nome_recebido: "Agua Inglesa Frasco Com 500ml",
      dados_brutos: {
        origem_nome: "farmaindex",
        nome: "Agua Inglesa Frasco Com 500ml",
        nome_produto: "Agua Inglesa Frasco Com 500ml",
        nome_exibicao: "Agua Inglesa Frasco Com 500ml",
        categoria: "Perfumaria",
        laboratorio: "Marca X",
        farmacos: [
          { nome: "Oxido de Zinco" },
          { nome: "Acido Borico" },
        ],
      },
    });

    expect(snapshot.principioAtivo).toBe("Oxido de Zinco, Acido Borico");
    expect(snapshot.fabricante).toBe("Marca X");
    expect(snapshot.debug_searchable_text).toContain("Oxido de Zinco, Acido Borico");
  });

  test("rejeita nome vindo apenas do banco do cliente sem validacao externa", () => {
    const service = new ProductService();

    expect(() => service.buildSnapshot({
      ean: "7893736007527",
      nome_recebido: "ACETICIL 100MG ENV 10CP",
      dados_brutos: {
        origem_nome: "cliente_postgres",
        nome: "ACETICIL 100MG ENV 10CP",
        nome_produto: "ACETICIL 100MG ENV 10CP",
        nome_exibicao: "ACETICIL 100MG ENV 10CP",
      },
    })).toThrow("Nome do produto nao foi validado por Convertize, FarmaIndex, Drogasil ou VTEX.");
  });

  test("aceita nome vindo da vtex quando for pass-through operacional", () => {
    const service = new ProductService();
    const snapshot = service.buildSnapshot({
      ean: "7896226500416",
      nome_recebido: "Hidratante Corporal VTEX",
      dados_brutos: {
        origem_nome: "vtex",
        origem_dados: "vtex",
        nome: "Hidratante Corporal VTEX",
        nome_produto: "Hidratante Corporal VTEX",
        nome_exibicao: "Hidratante Corporal VTEX",
        categoria: "Perfumaria",
        laboratorio: "Marca VTEX",
      },
    });

    expect(snapshot.nomeSocial).toBe("Hidratante Corporal VTEX");
    expect(snapshot.descricaoProduto).toBe("Hidratante Corporal VTEX");
    expect(snapshot.classificacao).toBe("Perfumaria");
    expect(snapshot.fabricante).toBe("Marca VTEX");
  });
});
