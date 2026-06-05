const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildResultHaystack,
  evaluateBenchmarkCase,
  matcherMatchesResult,
  normalizeSearchText,
} = require("../src/shared/utils/search-quality");

test("normalizeSearchText remove acentos e normaliza espacos", () => {
  assert.equal(normalizeSearchText(" Dipirona Monoidratada "), "dipirona monoidratada");
  assert.equal(normalizeSearchText("Acido Salicilico"), "acido salicilico");
});

test("buildResultHaystack inclui string e array de principio ativo", () => {
  const haystack = buildResultHaystack({
    ean: "7891234567890",
    descricaoProduto: "Paracetamol + Fosfato de Codeina",
    principioAtivo: ["Fosfato de Codeina", "Paracetamol"],
    classificacao: "Generico",
    nomeSocial: "Tylex",
    fabricante: "EMS",
  });

  assert.match(haystack, /paracetamol/);
  assert.match(haystack, /codeina/);
  assert.match(haystack, /ems/);
});

test("matcherMatchesResult respeita ean, allOf e anyOf", () => {
  const result = {
    ean: "7891058021580",
    descricaoProduto: "Anador 500mg/ml Solucao 20 ml",
    principioAtivo: "Dipirona Monoidratada",
    classificacao: "Analgesicos nao narcoticos",
    nomeSocial: "Anador",
    fabricante: "Opella Healthcare",
  };

  assert.equal(matcherMatchesResult(result, {
    ean: "7891058021580",
  }), true);
  assert.equal(matcherMatchesResult(result, {
    allOf: ["anador", "dipirona"],
  }), true);
  assert.equal(matcherMatchesResult(result, {
    allOf: ["dipirona"],
    anyOf: ["opella", "ems"],
  }), true);
  assert.equal(matcherMatchesResult(result, {
    allOf: ["dipirona"],
    anyOf: ["medley"],
  }), false);
});

test("evaluateBenchmarkCase aprova quando um matcher aparece dentro do top k", () => {
  const evaluation = evaluateBenchmarkCase({
    expectedTopK: 3,
    matchers: [
      {
        allOf: ["anador", "dipirona"],
      },
    ],
  }, [
    {
      ean: "1",
      descricaoProduto: "Paracetamol 750mg",
      principioAtivo: "Paracetamol",
      classificacao: "Generico",
      nomeSocial: "Paracetamol",
      fabricante: "EMS",
    },
    {
      ean: "2",
      descricaoProduto: "Anador 500mg/ml Solucao 20 ml",
      principioAtivo: "Dipirona Monoidratada",
      classificacao: "Analgesicos nao narcoticos",
      nomeSocial: "Anador",
      fabricante: "Opella Healthcare",
    },
  ]);

  assert.equal(evaluation.passed, true);
  assert.equal(evaluation.matchingIndex, 1);
});
