const {
  buildParsedProviderRequest,
  buildProviderRequestError,
  parseOptionalInteger,
  sanitizeBearerToken,
} = require("../provider-request.utils");

function parseTrierProviderRequest(body = {}) {
  const { trierToken, cdfilial, cdFilial } = body;
  const normalizedToken = sanitizeBearerToken(trierToken);

  if (!normalizedToken) {
    return buildProviderRequestError(
      "missing_trier_token",
      "Parâmetro \"trierToken\" é obrigatório.",
    );
  }

  const parsedFilial = parseOptionalInteger(cdfilial ?? cdFilial);

  if (parsedFilial === null) {
    return buildProviderRequestError(
      "invalid_cdfilial",
      "Parâmetro \"cdfilial\" deve ser um número inteiro.",
    );
  }

  return buildParsedProviderRequest({
    clientSearchOptions: {
      trierToken: normalizedToken,
      cdfilial: parsedFilial,
    },
    requestContext: {
      cdfilial: parsedFilial,
    },
    logContext: {
      hasToken: true,
      cdfilial: parsedFilial,
    },
  });
}

module.exports = {
  parseTrierProviderRequest,
};
