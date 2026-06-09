import { describe, expect, test } from "@jest/globals";
import { CsvImportAdapter } from "../src/adapters/csv-import.adapter.js";

describe("CsvImportAdapter", () => {
  test("entende colunas codigobarras e descricao vindas de exportacoes de embalagem", async () => {
    const csv = [
      "\"id\",\"codigobarras\",\"descricao\"",
      "\"81261\",\"7893736007527\",\"ACETICIL 100MG ENV 10CP\"",
      "\"81281\",NULL,\"SALICETIL 100MG ENV 10CP\"",
    ].join("\n");

    const adapter = new CsvImportAdapter(Buffer.from(csv, "utf-8"));
    const items = await adapter.parse();

    expect(items).toEqual([
      expect.objectContaining({
        ean: "7893736007527",
        nome_recebido: "ACETICIL 100MG ENV 10CP",
        fonte: "csv",
      }),
      expect.objectContaining({
        ean: null,
        nome_recebido: "SALICETIL 100MG ENV 10CP",
        fonte: "csv",
      }),
    ]);
  });

  test("entende coluna de principio ativo no csv", async () => {
    const csv = [
      "\"ean\",\"descricao\",\"principio_ativo\"",
      "\"7891058003890\",\"ANADOR 1G 10 COMPRIMIDOS\",\"Dipirona Monoidratada\"",
    ].join("\n");

    const adapter = new CsvImportAdapter(Buffer.from(csv, "utf-8"));
    const items = await adapter.parse();

    expect(items).toEqual([
      expect.objectContaining({
        ean: "7891058003890",
        nome_recebido: "ANADOR 1G 10 COMPRIMIDOS",
        fonte: "csv",
        dados_brutos: expect.objectContaining({
          principio_ativo: "Dipirona Monoidratada",
          ingrediente_ativo: "Dipirona Monoidratada",
          farmacos: [
            {
              nome: "Dipirona Monoidratada",
              farmaco: "Dipirona Monoidratada",
            },
          ],
        }),
      }),
    ]);
  });

  test("entende alias com espaco e mantem multiplos principios ativos", async () => {
    const csv = [
      "\"ean\",\"descricao\",\"principio ativo\"",
      "\"7891058006716\",\"ALLEGRA D 10 COMPRIMIDOS\",\"Cloridrato de Fexofenadina, Cloridrato de Pseudoefedrina\"",
    ].join("\n");

    const adapter = new CsvImportAdapter(Buffer.from(csv, "utf-8"));
    const items = await adapter.parse();

    expect(items[0].dados_brutos).toEqual(expect.objectContaining({
      ingrediente_ativo: "Cloridrato de Fexofenadina, Cloridrato de Pseudoefedrina",
      farmacos: [
        {
          nome: "Cloridrato de Fexofenadina",
          farmaco: "Cloridrato de Fexofenadina",
        },
        {
          nome: "Cloridrato de Pseudoefedrina",
          farmaco: "Cloridrato de Pseudoefedrina",
        },
      ],
    }));
  });
});
