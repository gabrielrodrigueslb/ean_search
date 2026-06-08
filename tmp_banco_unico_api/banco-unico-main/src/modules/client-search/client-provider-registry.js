const { Alpha7ClientProvider } = require("./providers/alpha7/alpha7.provider");
const { parseAlpha7ProviderRequest } = require("./providers/alpha7/alpha7.request-parser");
const { TrierClientProvider } = require("./providers/trier/trier.provider");
const { parseTrierProviderRequest } = require("./providers/trier/trier.request-parser");
const { VetorClientProvider } = require("./providers/vetor/vetor.provider");
const { parseVetorProviderRequest } = require("./providers/vetor/vetor.request-parser");

const clientSearchProviders = Object.freeze([
  {
    key: "alpha7",
    displayName: "Alpha7",
    auth: {
      type: "header",
      headerName: "x-api-key",
      notes: "Aceita override por alpha7AuthHeaderName e alpha7AuthPrefix.",
    },
    requestSchema: {
      required: ["alpha7Authenticate"],
      optional: [
        "alpha7BaseUrl",
        "alpha7RequestPath",
        "alpha7AuthHeaderName",
        "alpha7AuthPrefix",
        "providerOptions",
        "authenticate",
      ],
    },
    capabilities: {
      batchByEan: true,
      cacheTtlMs: false,
      retry: false,
      concurrencyLimit: false,
    },
    parseRequest: parseAlpha7ProviderRequest,
    clientProductProvider: new Alpha7ClientProvider(),
  },
  {
    key: "trier",
    displayName: "Trier",
    auth: {
      type: "header",
      headerName: "Authorization",
      prefix: "Bearer ",
    },
    requestSchema: {
      required: ["trierToken"],
      optional: ["cdfilial", "cdFilial", "providerOptions"],
      defaults: {
        cdfilial: 1,
      },
    },
    capabilities: {
      batchByEan: true,
      cacheTtlMs: true,
      retry: true,
      concurrencyLimit: true,
    },
    parseRequest: parseTrierProviderRequest,
    clientProductProvider: new TrierClientProvider(),
  },
  {
    key: "vetor",
    displayName: "Vetor",
    auth: {
      type: "header",
      headerName: "Authorization",
      prefix: "ApiKey ",
    },
    requestSchema: {
      required: ["vetorToken"],
      optional: ["cdfilial", "cdFilial", "providerOptions"],
      defaults: {
        cdfilial: 1,
      },
    },
    capabilities: {
      batchByEan: true,
      cacheTtlMs: true,
      adaptiveBatchFallback: true,
      concurrencyLimit: true,
    },
    minAvailableStock: 2,
    parseRequest: parseVetorProviderRequest,
    clientProductProvider: new VetorClientProvider(),
  },
]);

const providerByKey = new Map(clientSearchProviders.map((provider) => [provider.key, provider]));

function getClientSearchProvider(key) {
  return providerByKey.get(String(key || "").trim()) || null;
}

function listClientSearchProviders() {
  return clientSearchProviders.map((provider) => ({
    key: provider.key,
    displayName: provider.displayName,
    auth: provider.auth,
    requestSchema: provider.requestSchema,
    capabilities: provider.capabilities,
  }));
}

module.exports = {
  getClientSearchProvider,
  listClientSearchProviders,
};
