const { config } = require("../../../../config");
const { createHttpError } = require("../../../../shared/utils/http-error");
const { mapAlpha7Product } = require("./alpha7.mapper");

const DEFAULT_REQUEST_PATH = "/api/consultar-eans";
const DEFAULT_AUTH_HEADER_NAME = "x-api-key";

function positiveNumberFromEnv(name, fallback) {
  const rawValue = process.env[name];

  if (rawValue === undefined || rawValue === "") {
    return fallback;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeOptionalText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}

function normalizeEan(value) {
  const digitsOnly = String(value || "").replace(/\D+/g, "");
  return digitsOnly || null;
}

function buildRequestUrl(baseUrl, path) {
  const normalizedBaseUrl = String(baseUrl || "").trim().replace(/\/+$/, "");
  const normalizedPath = String(path || "").trim().replace(/^\/+/, "");

  return new URL(`${normalizedBaseUrl}/${normalizedPath}`);
}

async function readJsonResponse(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    return text;
  }
}

function flattenAlpha7ResponseItems(responseBody) {
  if (Array.isArray(responseBody)) {
    return responseBody;
  }

  if (Array.isArray(responseBody?.produtos)) {
    return responseBody.produtos;
  }

  return [];
}

class Alpha7ClientProvider {
  constructor() {
    this.baseUrl = normalizeOptionalText(process.env.ALPHA7_API_BASE_URL);
    this.requestPath = normalizeOptionalText(process.env.ALPHA7_REQUEST_PATH)
      || normalizeOptionalText(process.env.ALPHA7_CONSULTAR_EANS_PATH)
      || DEFAULT_REQUEST_PATH;
    this.authHeaderName = normalizeOptionalText(process.env.ALPHA7_AUTH_HEADER_NAME)
      || DEFAULT_AUTH_HEADER_NAME;
    this.authPrefix = normalizeOptionalText(process.env.ALPHA7_AUTH_PREFIX);
    this.timeoutMs = positiveNumberFromEnv("ALPHA7_TIMEOUT_MS", config.integrationRequestTimeoutMs);
  }

  async searchByEans(eans, options = {}) {
    const uniqueEans = [...new Set(
      (Array.isArray(eans) ? eans : [])
        .map(normalizeEan)
        .filter(Boolean),
    )];

    if (uniqueEans.length === 0) {
      return [];
    }

    const baseUrl = normalizeOptionalText(options.alpha7BaseUrl) || this.baseUrl;
    const requestPath = normalizeOptionalText(options.alpha7RequestPath) || this.requestPath;
    const authHeaderName = normalizeOptionalText(options.alpha7AuthHeaderName) || this.authHeaderName;
    const authPrefix = normalizeOptionalText(options.alpha7AuthPrefix) ?? this.authPrefix ?? "";
    const authenticate = normalizeOptionalText(options.alpha7Authenticate);

    if (!baseUrl) {
      throw createHttpError(400, "URL base do Alpha7 não informada.", {
        code: "missing_alpha7_base_url",
      });
    }

    if (!authenticate) {
      throw createHttpError(400, "Authenticate do Alpha7 não informado.", {
        code: "missing_alpha7_authenticate",
      });
    }

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const url = buildRequestUrl(baseUrl, requestPath);
      const headers = {
        "Content-Type": "application/json",
        [authHeaderName]: `${authPrefix}${authenticate}`,
      };

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          eans: uniqueEans,
        }),
        signal: controller.signal,
      });
      const responseBody = await readJsonResponse(response);

      if (!response.ok) {
        throw createHttpError(
          response.status,
          `O Alpha7 respondeu com status ${response.status}.`,
          {
            code: "ALPHA7_HTTP_ERROR",
            cause: responseBody,
          },
        );
      }

      return flattenAlpha7ResponseItems(responseBody)
        .map(mapAlpha7Product)
        .filter((product) => product?.ean);
    } catch (error) {
      if (error?.name === "AbortError") {
        throw createHttpError(504, `O Alpha7 excedeu o timeout de ${this.timeoutMs}ms.`, {
          code: "ALPHA7_TIMEOUT",
          cause: error,
        });
      }

      if (Number.isInteger(error?.statusCode)) {
        throw error;
      }

      throw createHttpError(502, "Falha ao consultar o Alpha7.", {
        code: "ALPHA7_NETWORK_ERROR",
        cause: error,
      });
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}

module.exports = {
  Alpha7ClientProvider,
};
