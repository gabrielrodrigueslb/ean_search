const { createHttpError } = require("../../../shared/utils/http-error");

const AUTH_TYPE_SPECS = Object.freeze([
  {
    type: "none",
    description: "Nao adiciona autenticacao extra.",
    requiredFields: [],
  },
  {
    type: "bearer",
    description: "Envia Authorization: Bearer <token>.",
    requiredFields: ["token"],
  },
  {
    type: "apiKeyHeader",
    description: "Envia a chave em um header customizado.",
    requiredFields: ["headerName", "value"],
  },
  {
    type: "apiKeyQuery",
    description: "Envia a chave como query string.",
    requiredFields: ["paramName", "value"],
  },
  {
    type: "apiKeyBody",
    description: "Envia a chave dentro do body da requisicao.",
    requiredFields: ["fieldName", "value"],
  },
  {
    type: "basic",
    description: "Envia Authorization Basic com usuario e senha.",
    requiredFields: ["username", "password"],
  },
  {
    type: "customHeaders",
    description: "Permite passar varios headers fixos de autenticacao.",
    requiredFields: ["headers"],
  },
]);

const AUTH_TYPE_BY_NAME = new Map(AUTH_TYPE_SPECS.map((item) => [item.type, item]));

function ensureNonEmptyString(value, fieldName) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw createHttpError(400, `O campo auth.${fieldName} e obrigatorio.`);
  }

  return normalized;
}

function ensureHeaders(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw createHttpError(400, "O campo auth.headers precisa ser um objeto.");
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, headerValue]) => [String(key), String(headerValue)]),
  );
}

function normalizeIntegrationAuth(auth) {
  if (auth === undefined || auth === null) {
    return {
      type: "none",
    };
  }

  if (typeof auth !== "object" || Array.isArray(auth)) {
    throw createHttpError(400, "O campo auth precisa ser um objeto.");
  }

  const type = String(auth.type || "none").trim();

  if (!AUTH_TYPE_BY_NAME.has(type)) {
    throw createHttpError(400, `Tipo de autenticacao nao suportado: ${type}.`);
  }

  switch (type) {
    case "none":
      return {
        type,
      };
    case "bearer":
      return {
        type,
        token: ensureNonEmptyString(auth.token, "token"),
      };
    case "apiKeyHeader":
      return {
        type,
        headerName: ensureNonEmptyString(auth.headerName, "headerName"),
        value: ensureNonEmptyString(auth.value, "value"),
      };
    case "apiKeyQuery":
      return {
        type,
        paramName: ensureNonEmptyString(auth.paramName, "paramName"),
        value: ensureNonEmptyString(auth.value, "value"),
      };
    case "apiKeyBody":
      return {
        type,
        fieldName: ensureNonEmptyString(auth.fieldName, "fieldName"),
        value: ensureNonEmptyString(auth.value, "value"),
      };
    case "basic":
      return {
        type,
        username: ensureNonEmptyString(auth.username, "username"),
        password: ensureNonEmptyString(auth.password, "password"),
      };
    case "customHeaders":
      return {
        type,
        headers: ensureHeaders(auth.headers),
      };
    default:
      throw createHttpError(400, `Tipo de autenticacao nao suportado: ${type}.`);
  }
}

function applyAuthToIntegrationRequest(request, auth) {
  const normalizedAuth = normalizeIntegrationAuth(auth);
  const headers = {
    ...(request.headers || {}),
  };
  const url = new URL(request.url);
  let body = request.body;

  switch (normalizedAuth.type) {
    case "none":
      break;
    case "bearer":
      headers.Authorization = `Bearer ${normalizedAuth.token}`;
      break;
    case "apiKeyHeader":
      headers[normalizedAuth.headerName] = normalizedAuth.value;
      break;
    case "apiKeyQuery":
      url.searchParams.set(normalizedAuth.paramName, normalizedAuth.value);
      break;
    case "apiKeyBody":
      if (body !== undefined && (typeof body !== "object" || body === null || Array.isArray(body))) {
        throw createHttpError(
          400,
          "A autenticacao apiKeyBody exige um body estruturado em objeto.",
        );
      }

      body = {
        ...(body || {}),
        [normalizedAuth.fieldName]: normalizedAuth.value,
      };
      break;
    case "basic":
      headers.Authorization = `Basic ${Buffer.from(`${normalizedAuth.username}:${normalizedAuth.password}`).toString("base64")}`;
      break;
    case "customHeaders":
      Object.assign(headers, normalizedAuth.headers);
      break;
    default:
      throw createHttpError(400, `Tipo de autenticacao nao suportado: ${normalizedAuth.type}.`);
  }

  return {
    ...request,
    url: url.toString(),
    headers,
    body,
  };
}

function getSupportedAuthTypes() {
  return AUTH_TYPE_SPECS.map((item) => ({
    type: item.type,
    description: item.description,
    requiredFields: [...item.requiredFields],
  }));
}

module.exports = {
  applyAuthToIntegrationRequest,
  getSupportedAuthTypes,
  normalizeIntegrationAuth,
};
