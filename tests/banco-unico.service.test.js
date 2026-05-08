import { describe, expect, test } from "@jest/globals";
import { BancoUnicoService } from "../src/services/banco-unico.service.js";

describe("BancoUnicoService", () => {
  test("monta payload com os campos aceitos pela API", () => {
    const service = new BancoUnicoService();

    expect(service.buildSingleProductPayload({
      descricaoProduto: "Paracetamol 750mg 20 Comprimidos",
      ean: "7891234567890",
      principioAtivo: "Paracetamol",
      classificacao: "AnalgÃ©sicos",
      nomeSocial: "Paracetamol",
      fabricante: "EMS S/A",
      detalhes: "{\"tarja\":\"VENDA LIVRE\"}",
      ignorar: "nao deve seguir",
    })).toEqual({
      descricaoProduto: "Paracetamol 750mg 20 Comprimidos",
      ean: "7891234567890",
      principioAtivo: "Paracetamol",
      classificacao: "AnalgÃ©sicos",
      nomeSocial: "Paracetamol",
      fabricante: "EMS S/A",
      detalhes: "{\"tarja\":\"VENDA LIVRE\"}",
    });
  });
});
