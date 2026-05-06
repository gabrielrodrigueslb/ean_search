const axios = require("axios");
const env = require("../config/env");

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

class BancoUnicoClient {
  constructor({ baseUrl, authorization } = {}) {
    this.baseUrl = trimTrailingSlash(baseUrl || env.bancoUnicoBaseUrl);
    this.authorization = typeof authorization === "string" && authorization.trim()
      ? authorization.trim()
      : null;
  }

  buildHeaders() {
    return {
      "Content-Type": "application/json",
      ...(this.authorization ? { Authorization: this.authorization } : {}),
    };
  }

  async health() {
    try {
      const response = await axios.get(`${this.baseUrl}/health`, {
        timeout: env.bancoUnicoRequestTimeoutMs,
        headers: this.buildHeaders(),
      });

      return response.data;
    } catch (error) {
      throw this.wrapError("Falha ao consultar health da Banco Unico API.", error);
    }
  }

  async publishProducts(payload) {
    try {
      const response = await axios.post(`${this.baseUrl}/api/products`, payload, {
        timeout: env.bancoUnicoRequestTimeoutMs,
        headers: this.buildHeaders(),
      });

      return response.data;
    } catch (error) {
      throw this.wrapError("Falha ao publicar produto na Banco Unico API.", error);
    }
  }

  wrapError(prefix, error) {
    const status = error?.response?.status;
    const data = error?.response?.data;
    const message = status
      ? `${prefix} Status ${status}.`
      : `${prefix} ${error.message}`;
    const wrapped = new Error(message);
    wrapped.status = status || 502;
    wrapped.details = data || null;
    wrapped.cause = error;
    return wrapped;
  }
}

module.exports = { BancoUnicoClient };
