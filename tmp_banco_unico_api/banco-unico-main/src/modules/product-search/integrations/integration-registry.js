const { genericJsonIntegrationProvider } = require("./providers/generic-json.provider");
const { genericQueryIntegrationProvider } = require("./providers/generic-query.provider");

const providers = Object.freeze([
  genericJsonIntegrationProvider,
  genericQueryIntegrationProvider,
]);

const providerByKey = new Map(providers.map((provider) => [provider.key, provider]));

function getSearchIntegrationProvider(key) {
  return providerByKey.get(key) || null;
}

function listSearchIntegrationProviders() {
  return providers.map((provider) => ({
    provider: provider.contract.provider,
    description: provider.contract.description,
    request: {
      required: [...provider.contract.request.required],
      optional: [...provider.contract.request.optional],
    },
    supportedAuthTypes: [...provider.contract.supportedAuthTypes],
    example: provider.contract.example,
  }));
}

module.exports = {
  getSearchIntegrationProvider,
  listSearchIntegrationProviders,
};
