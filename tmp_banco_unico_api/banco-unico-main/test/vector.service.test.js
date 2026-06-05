const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildRepresentation,
  createExternalId,
  normalizeText,
  toSqlVector,
  tokenizeText,
  vectorizeTokens,
} = require("../src/modules/vector/vector.service");

test("normalizeText remove acentos, pontuacao e espacos extras", () => {
  assert.equal(normalizeText(" Paracetamol + Códigoína! "), "paracetamol codigoina");
});

test("tokenizeText respeita maxTokens", () => {
  assert.deepEqual(tokenizeText("um dois tres", 2), {
    normalizedText: "um dois tres",
    tokens: ["um", "dois"],
  });
});

test("vectorizeTokens gera vetor normalizado com tamanho esperado", () => {
  const vector = vectorizeTokens(["paracetamol", "paracetamol", "codeina"], 8);

  assert.equal(vector.length, 8);

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  assert.ok(Math.abs(magnitude - 1) < 1e-9);
});

test("buildRepresentation reune texto normalizado, tokens e vetor", () => {
  const representation = buildRepresentation("Paracetamol + Codeina", {
    dimensions: 8,
    maxTokens: 10,
  });

  assert.equal(representation.normalizedText, "paracetamol codeina");
  assert.deepEqual(representation.tokens, ["paracetamol", "codeina"]);
  assert.equal(representation.tokenCount, 2);
  assert.equal(representation.vector.length, 8);
});

test("toSqlVector serializa vetor para formato do pgvector", () => {
  assert.equal(toSqlVector([0.1, -0.2, 0.3]), "[0.1,-0.2,0.3]");
});

test("createExternalId e deterministico para a mesma entrada", () => {
  const firstId = createExternalId("openai", "paracetamol codeina");
  const secondId = createExternalId("openai", "paracetamol codeina");

  assert.equal(firstId, secondId);
  assert.equal(firstId.length, 64);
});
