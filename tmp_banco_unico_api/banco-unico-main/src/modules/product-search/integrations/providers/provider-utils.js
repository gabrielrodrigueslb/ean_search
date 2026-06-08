const { createHttpError } = require("../../../../shared/utils/http-error");

function ensurePlainObject(value, fieldName, options = {}) {
  const { allowUndefined = false } = options;

  if (value === undefined || value === null) {
    if (allowUndefined) {
      return {};
    }

    throw createHttpError(400, `O campo ${fieldName} precisa ser um objeto.`);
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw createHttpError(400, `O campo ${fieldName} precisa ser um objeto.`);
  }

  return value;
}

function ensureUrl(value, fieldName) {
  const url = String(value || "").trim();

  if (!url) {
    throw createHttpError(400, `O campo ${fieldName} e obrigatorio.`);
  }

  try {
    return new URL(url).toString();
  } catch (_error) {
    throw createHttpError(400, `O campo ${fieldName} precisa ser uma URL valida.`);
  }
}

function normalizeHeaders(value, fieldName = "request.headers") {
  const headers = ensurePlainObject(value, fieldName, {
    allowUndefined: true,
  });

  return Object.fromEntries(
    Object.entries(headers).map(([key, headerValue]) => [String(key), String(headerValue)]),
  );
}

function normalizeMethod(value, fallback = "GET") {
  const method = String(value || fallback).trim().toUpperCase();
  const allowedMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

  if (!allowedMethods.has(method)) {
    throw createHttpError(400, `Metodo HTTP nao suportado para integracao: ${method}.`);
  }

  return method;
}

module.exports = {
  ensurePlainObject,
  ensureUrl,
  normalizeHeaders,
  normalizeMethod,
};
