const { ProductService, EMBEDDING_DIMENSIONS } = require("../src/services/product.service");

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
    })).toThrow("Nome do produto nao foi validado por PT.ProductSearch, FarmaIndex, BarcodeLookup ou browser fallback.");
  });

  test("monta documento unico para nome validado pelo PT.ProductSearch", () => {
    const service = new ProductService();
    const snapshot = service.buildSnapshot({
      ean: "7890000000001",
      nome_recebido: "Lencos Umedecidos Baby Wipes 500 Unidades",
      dados_brutos: {
        origem_nome: "pt_product_search",
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
        origem_nome: "barcode_lookup",
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

  test("aceita nome validado pelo browser fallback", () => {
    const service = new ProductService();
    const snapshot = service.buildSnapshot({
      ean: "7891158105395",
      nome_recebido: "Sof D Go 2.000 Ui 60 Comprimidos Orodispersiveis",
      dados_brutos: {
        origem_nome: "pt_product_search_browser",
        nome: "Sof D Go 2.000 Ui 60 Comprimidos Orodispersiveis",
        nome_produto: "Sof D Go 2.000 Ui 60 Comprimidos Orodispersiveis",
        nome_exibicao: "Sof D Go 2.000 Ui 60 Comprimidos Orodispersiveis",
        categoria: "Suplementos",
      },
    });

    expect(snapshot.nomeSocial).toBe("Sof D Go 2.000 Ui 60 Comprimidos Orodispersiveis");
    expect(snapshot.debug_normalized_searchable_text).toContain("sof d go 2 000 ui 60 comprimidos orodispersiveis");
    expect(snapshot.debug_embedding_dimensions).toBe(EMBEDDING_DIMENSIONS);
  });
});
