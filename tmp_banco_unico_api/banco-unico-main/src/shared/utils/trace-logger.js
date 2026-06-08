const { randomUUID } = require("node:crypto");

function summarizeText(value, maxLength = 80) {
  if (value === undefined || value === null) {
    return value;
  }

  const normalized = String(value).replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

function describePayloadShape(payload) {
  if (Array.isArray(payload)) {
    return {
      payloadType: "array",
      productCount: payload.length,
    };
  }

  if (!payload || typeof payload !== "object") {
    return {
      payloadType: typeof payload,
    };
  }

  if (Array.isArray(payload.products)) {
    return {
      payloadType: "wrapper.products",
      productCount: payload.products.length,
      hasOptions: payload.options && typeof payload.options === "object",
    };
  }

  if (Array.isArray(payload.produtos)) {
    return {
      payloadType: "wrapper.produtos",
      productCount: payload.produtos.length,
      hasOptions: payload.options && typeof payload.options === "object",
    };
  }

  return {
    payloadType: "single-object",
    keys: Object.keys(payload).slice(0, 10),
  };
}

function serializeMeta(meta) {
  if (!meta || typeof meta !== "object" || Object.keys(meta).length === 0) {
    return "";
  }

  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return " {\"meta\":\"nao-serializavel\"}";
  }
}

function createTraceLogger(options = {}) {
  const requestId = String(options.requestId || randomUUID());
  const flow = options.flow || "application";
  const enabled = options.enabled ?? process.env.NODE_ENV !== "test";

  function emit(method, functionName, message, meta = {}) {
    if (!enabled) {
      return;
    }

    const timestamp = new Date().toISOString();
    const prefix = `${timestamp} [trace:${requestId}] [flow:${flow}] [${functionName}]`;

    console[method](`${prefix} ${message}${serializeMeta(meta)}`);
  }

  return {
    requestId,
    flow,
    enabled,
    step(functionName, message, meta) {
      emit("log", functionName, message, meta);
    },
    fail(functionName, error, meta = {}) {
      emit("error", functionName, error.message || "Erro sem mensagem.", {
        ...meta,
        errorName: error.name || "Error",
      });
    },
  };
}

const noopTraceLogger = Object.freeze({
  requestId: "noop",
  flow: "noop",
  enabled: false,
  step() {},
  fail() {},
});

module.exports = {
  createTraceLogger,
  describePayloadShape,
  noopTraceLogger,
  summarizeText,
};
