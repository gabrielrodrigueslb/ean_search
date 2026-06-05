const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createTraceLogger,
  describePayloadShape,
  summarizeText,
} = require("../src/shared/utils/trace-logger");

test("summarizeText encurta textos longos", () => {
  assert.equal(summarizeText("  texto curto  "), "texto curto");
  assert.match(summarizeText("x".repeat(120), 20), /^x{17}\.\.\.$/);
});

test("describePayloadShape descreve os formatos aceitos", () => {
  assert.deepEqual(describePayloadShape([{ ean: "1" }]), {
    payloadType: "array",
    productCount: 1,
  });
  assert.deepEqual(describePayloadShape({
    products: [{ ean: "1" }, { ean: "2" }],
    options: {},
  }), {
    payloadType: "wrapper.products",
    productCount: 2,
    hasOptions: true,
  });
});

test("createTraceLogger emite logs estruturados quando habilitado", () => {
  const entries = [];
  const originalLog = console.log;
  const originalError = console.error;

  console.log = (message) => {
    entries.push({
      type: "log",
      message,
    });
  };
  console.error = (message) => {
    entries.push({
      type: "error",
      message,
    });
  };

  try {
    const traceLogger = createTraceLogger({
      requestId: "req-123",
      flow: "products.create",
      enabled: true,
    });

    traceLogger.step("fn", "etapa ok", {
      foo: "bar",
    });
    traceLogger.fail("fn", new Error("deu ruim"), {
      stage: "test",
    });
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }

  assert.equal(entries.length, 2);
  assert.match(entries[0].message, /\[trace:req-123\] \[flow:products.create\] \[fn\] etapa ok/);
  assert.match(entries[1].message, /\[trace:req-123\] \[flow:products.create\] \[fn\] deu ruim/);
});
