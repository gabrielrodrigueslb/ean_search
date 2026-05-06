const { BancoUnicoService } = require("../src/services/banco-unico.service");

describe("BancoUnicoService", () => {
  test("monta payload com os campos aceitos pela API", () => {
    const service = new BancoUnicoService();

    expect(service.buildSingleProductPayload({
      descricaoProduto: "Paracetamol 750mg 20 Comprimidos",
      ean: "7891234567890",
      principioAtivo: "Paracetamol",
      classificacao: "Analgésicos",
      nomeSocial: "Paracetamol",
      fabricante: "EMS S/A",
      detalhes: "{\"tarja\":\"VENDA LIVRE\"}",
      ignorar: "nao deve seguir",
    })).toEqual({
      descricaoProduto: "Paracetamol 750mg 20 Comprimidos",
      ean: "7891234567890",
      principioAtivo: "Paracetamol",
      classificacao: "Analgésicos",
      nomeSocial: "Paracetamol",
      fabricante: "EMS S/A",
      detalhes: "{\"tarja\":\"VENDA LIVRE\"}",
    });
  });
});
