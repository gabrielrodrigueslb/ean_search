const { config } = require("../../../config");

function createIntegrationRuntimeError(message, options = {}) {
  const error = new Error(message);

  if (options.code) {
    error.code = options.code;
  }

  if (options.cause) {
    error.cause = options.cause;
  }

  return error;
}

function serializeBody(body, headers) {
  if (body === undefined || body === null) {
    return undefined;
  }

  if (typeof body === "string" || body instanceof Uint8Array) {
    return body;
  }

  if (!headers["content-type"] && !headers["Content-Type"]) {
    headers["content-type"] = "application/json";
  }

  return JSON.stringify(body);
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

function parseResponseBody(text, contentType) {
  if (!text) {
    return null;
  }

  if (contentType && contentType.includes("application/json")) {
    const parsedJson = tryParseJson(text);
    return parsedJson === null ? text : parsedJson;
  }

  const maybeJson = tryParseJson(text);
  return maybeJson === null ? text : maybeJson;
}

async function executeIntegrationHttpRequest(request, options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch;

  if (typeof fetchImpl !== "function") {
    throw createIntegrationRuntimeError(
      "Nenhum fetch disponivel para executar a integracao externa.",
      {
        code: "INTEGRATION_FETCH_UNAVAILABLE",
      },
    );
  }

  const timeoutMs = Number.isInteger(request.timeoutMs)
    ? request.timeoutMs
    : config.integrationRequestTimeoutMs;
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  const headers = {
    ...(request.headers || {}),
  };
  const serializedBody = serializeBody(request.body, headers);

  try {
    const response = await fetchImpl(request.url, {
      method: request.method,
      headers,
      body: serializedBody,
      signal: controller.signal,
    });
    const rawBody = await response.text();
    const contentType = response.headers?.get?.("content-type") || null;

    return {
      ok: response.ok,
      statusCode: response.status,
      data: parseResponseBody(rawBody, contentType),
      headers: {
        contentType,
      },
    };
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw createIntegrationRuntimeError(
        `A integracao externa excedeu o timeout de ${timeoutMs}ms.`,
        {
          code: "INTEGRATION_REQUEST_TIMEOUT",
          cause: error,
        },
      );
    }

    throw createIntegrationRuntimeError(
      "Falha ao executar a requisicao da integracao externa.",
      {
        code: "INTEGRATION_REQUEST_FAILED",
        cause: error,
      },
    );
  } finally {
    clearTimeout(timeoutHandle);
  }
}

module.exports = {
  executeIntegrationHttpRequest,
};
