const {
  buildParsedProviderRequest,
  buildProviderRequestError,
} = require("../provider-request.utils");

function normalizeOptionalText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}

function parseAlpha7ProviderRequest(body = {}) {
  const authenticate = normalizeOptionalText(
    body.alpha7Authenticate ?? body.alpha7ApiKey ?? body.authenticate,
  );

  if (!authenticate) {
    return buildProviderRequestError(
      "missing_alpha7_authenticate",
      "Parâmetro \"alpha7Authenticate\" é obrigatório.",
    );
  }

  return buildParsedProviderRequest({
    clientSearchOptions: {
      alpha7Authenticate: authenticate,
      alpha7BaseUrl: normalizeOptionalText(body.alpha7BaseUrl),
      alpha7RequestPath: normalizeOptionalText(body.alpha7RequestPath),
      alpha7AuthHeaderName: normalizeOptionalText(body.alpha7AuthHeaderName),
      alpha7AuthPrefix: normalizeOptionalText(body.alpha7AuthPrefix),
    },
    requestContext: {},
    logContext: {
      hasAuthenticate: true,
      hasCustomBaseUrl: normalizeOptionalText(body.alpha7BaseUrl) !== null,
      hasCustomRequestPath: normalizeOptionalText(body.alpha7RequestPath) !== null,
    },
  });
}

module.exports = {
  parseAlpha7ProviderRequest,
};
