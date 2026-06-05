const {
  ensurePlainObject,
  ensureUrl,
  normalizeHeaders,
  normalizeMethod,
} = require("./provider-utils");
const { createHttpError } = require("../../../../shared/utils/http-error");

const SUPPORTED_AUTH_TYPES = Object.freeze([
  "none",
  "bearer",
  "apiKeyHeader",
  "apiKeyQuery",
  "basic",
  "customHeaders",
]);

function appendEans(url, eans, request) {
  const eanParam = String(request.eanParam || "eans");
  const arrayFormat = String(request.arrayFormat || "comma");

  if (arrayFormat === "repeat") {
    for (const ean of eans) {
      url.searchParams.append(eanParam, ean);
    }

    return;
  }

  if (arrayFormat === "comma") {
    url.searchParams.set(eanParam, eans.join(String(request.separator || ",")));
    return;
  }

  throw createHttpError(
    400,
    "O campo request.arrayFormat precisa ser 'repeat' ou 'comma'.",
  );
}

const genericQueryIntegrationProvider = Object.freeze({
  key: "generic-query",
  description: "Envia os EANs encontrados por query string para endpoints GET-like.",
  supportedAuthTypes: SUPPORTED_AUTH_TYPES,
  contract: {
    provider: "generic-query",
    description: "Monta uma URL com os EANs em query string, usando ean=1&ean=2 ou eans=1,2.",
    request: {
      required: ["url"],
      optional: [
        "method",
        "headers",
        "query",
        "eanParam",
        "arrayFormat",
        "separator",
        "includeQuery",
        "queryParam",
      ],
    },
    supportedAuthTypes: [...SUPPORTED_AUTH_TYPES],
    example: {
      id: "ecommerce-a",
      provider: "generic-query",
      auth: {
        type: "bearer",
        token: "<secret>",
      },
      request: {
        url: "https://shop.exemplo.com/api/stock",
        method: "GET",
        eanParam: "ean",
        arrayFormat: "repeat",
        query: {
          sellerId: "123",
        },
      },
    },
  },
  buildRequest({ request, eans, query, timeoutMs }) {
    const safeRequest = ensurePlainObject(request, "integrations[].request");
    const url = new URL(ensureUrl(safeRequest.url, "request.url"));
    const staticQuery = ensurePlainObject(safeRequest.query, "request.query", {
      allowUndefined: true,
    });

    for (const [key, value] of Object.entries(staticQuery)) {
      url.searchParams.set(String(key), String(value));
    }

    appendEans(url, eans, safeRequest);

    if (safeRequest.includeQuery === true) {
      url.searchParams.set(String(safeRequest.queryParam || "query"), String(query));
    }

    return {
      method: normalizeMethod(safeRequest.method, "GET"),
      url: url.toString(),
      headers: normalizeHeaders(safeRequest.headers),
      timeoutMs,
    };
  },
});

module.exports = {
  genericQueryIntegrationProvider,
};
