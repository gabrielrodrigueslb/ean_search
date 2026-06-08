const {
  ensurePlainObject,
  ensureUrl,
  normalizeHeaders,
  normalizeMethod,
} = require("./provider-utils");

const SUPPORTED_AUTH_TYPES = Object.freeze([
  "none",
  "bearer",
  "apiKeyHeader",
  "apiKeyQuery",
  "apiKeyBody",
  "basic",
  "customHeaders",
]);

const genericJsonIntegrationProvider = Object.freeze({
  key: "generic-json",
  description: "Envia os EANs encontrados para um endpoint HTTP com body JSON.",
  supportedAuthTypes: SUPPORTED_AUTH_TYPES,
  contract: {
    provider: "generic-json",
    description: "POST/PUT/PATCH JSON com a lista de EANs e, opcionalmente, os produtos encontrados.",
    request: {
      required: ["url"],
      optional: [
        "method",
        "headers",
        "eanField",
        "extraBody",
        "includeMatchedProducts",
        "productsField",
        "includeQuery",
        "queryField",
      ],
    },
    supportedAuthTypes: [...SUPPORTED_AUTH_TYPES],
    example: {
      id: "erp-principal",
      provider: "generic-json",
      auth: {
        type: "apiKeyHeader",
        headerName: "x-api-key",
        value: "<secret>",
      },
      request: {
        url: "https://erp.exemplo.com/api/catalog/search",
        method: "POST",
        eanField: "eans",
        extraBody: {
          tenant: "minha-loja",
        },
        includeMatchedProducts: false,
      },
    },
  },
  buildRequest({ request, eans, matchedProducts, query, timeoutMs }) {
    const safeRequest = ensurePlainObject(request, "integrations[].request");
    const body = {
      ...(ensurePlainObject(safeRequest.extraBody, "request.extraBody", {
        allowUndefined: true,
      })),
      [String(safeRequest.eanField || "eans")]: eans,
    };

    if (safeRequest.includeMatchedProducts === true) {
      body[String(safeRequest.productsField || "products")] = matchedProducts;
    }

    if (safeRequest.includeQuery === true) {
      body[String(safeRequest.queryField || "query")] = query;
    }

    return {
      method: normalizeMethod(safeRequest.method, "POST"),
      url: ensureUrl(safeRequest.url, "request.url"),
      headers: normalizeHeaders(safeRequest.headers),
      body,
      timeoutMs,
    };
  },
});

module.exports = {
  genericJsonIntegrationProvider,
};
