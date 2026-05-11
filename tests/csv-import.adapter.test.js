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
});
