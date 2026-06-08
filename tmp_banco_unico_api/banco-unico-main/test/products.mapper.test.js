const test = require("node:test");
const assert = require("node:assert/strict");

const { mapActiveIngredient, mapProductRow } = require("../src/modules/products/products.mapper");

test("mapActiveIngredient mantem string quando ha um unico principio ativo", () => {
  assert.equal(mapActiveIngredient("Dipirona Monoidratada"), "Dipirona Monoidratada");
});

test("mapActiveIngredient converte multiplos principios ativos em array", () => {
  assert.deepEqual(
    mapActiveIngredient("Dipropionato de Betametasona, Fosfato Dissodico de Betametasona"),
    ["Dipropionato de Betametasona", "Fosfato Dissodico de Betametasona"],
  );
});

test("mapProductRow aplica o formato de principio ativo na resposta", () => {
  const result = mapProductRow({
    id: "1",
    ean: "7891234567890",
    description: "Produto X",
    activeIngredient: "Fosfato de Codeina, Paracetamol",
    classification: "Generico",
    socialName: "Produto X",
    manufacturer: "EMS",
    details: null,
    tokenCount: 2,
    createdAt: "2026-05-05T00:00:00.000Z",
    updatedAt: "2026-05-05T00:00:00.000Z",
  });

  assert.deepEqual(result.principioAtivo, ["Fosfato de Codeina", "Paracetamol"]);
});
