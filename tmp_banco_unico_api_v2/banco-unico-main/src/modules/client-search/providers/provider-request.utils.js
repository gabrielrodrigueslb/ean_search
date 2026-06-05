const { createHttpError } = require("../../../shared/utils/http-error");

const DEFAULT_CDFILIAL = 1;

function parseOptionalInteger(value, fallback = DEFAULT_CDFILIAL) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function sanitizeBearerToken(value) {
  return String(value || "")
    .trim()
    .replace(/^Bearer\s+/i, "")
    .trim();
}

function ensureObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value;
}

function mergeProviderOptions(payload) {
  const safePayload = ensureObject(payload);
  const providerOptions = ensureObject(safePayload.providerOptions);

  return {
    ...safePayload,
    ...providerOptions,
  };
}

function buildProviderRequestError(reason, message) {
  return {
    error: {
      reason,
      message,
    },
  };
}

function buildParsedProviderRequest(options = {}) {
  return {
    clientSearchOptions: options.clientSearchOptions || {},
    requestContext: options.requestContext || {},
    logContext: options.logContext || {},
  };
}

function throwInvalidProviderRequest(parsedProviderRequest) {
  if (!parsedProviderRequest?.error) {
    return;
  }

  throw createHttpError(400, parsedProviderRequest.error.message, {
    code: parsedProviderRequest.error.reason,
  });
}

module.exports = {
  DEFAULT_CDFILIAL,
  buildParsedProviderRequest,
  buildProviderRequestError,
  mergeProviderOptions,
  parseOptionalInteger,
  sanitizeBearerToken,
  throwInvalidProviderRequest,
};
