const { ProductService } = require("../src/services/product.service");

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
    })).toThrow("Nome do produto nao foi validado por PT.ProductSearch, FarmaIndex ou BarcodeLookup.");
  });

  test("aceita nome validado pelo PT.ProductSearch", () => {
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

    expect(snapshot.produto.nome).toBe("Lencos Umedecidos Baby Wipes 500 Unidades");
    expect(snapshot.apresentacao.nome_exibicao).toBe("Lencos Umedecidos Baby Wipes 500 Unidades");
  });

  test("aceita nome validado pelo BarcodeLookup", () => {
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
      },
    });

    expect(snapshot.produto.nome).toBe("Agua Inglesa Frasco Com 500ml");
    expect(snapshot.apresentacao.nome_exibicao).toBe("Agua Inglesa Frasco Com 500ml");
  });
});
