const {
  buildParsedProviderRequest,
  buildProviderRequestError,
  parseOptionalInteger,
} = require("../provider-request.utils");

function parseVetorProviderRequest(body = {}) {
  const { vetorToken, cdfilial, cdFilial } = body;

  if (!vetorToken || !String(vetorToken).trim()) {
    return buildProviderRequestError(
      "missing_vetor_token",
      "Parâmetro \"vetorToken\" é obrigatório.",
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
      vetorToken: String(vetorToken).trim(),
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
  parseVetorProviderRequest,
};
