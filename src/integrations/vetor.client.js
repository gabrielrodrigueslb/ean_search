import axios from "axios";
import env from "../config/env.js";
class VetorClient {
  constructor({ baseUrl, apiKey }) {
    this.baseUrl = String(baseUrl || "https://integracao.zetti.dev").trim();
    this.apiKey = String(apiKey || "").trim();
    this.http = axios.create({
      timeout: env.vetorRequestTimeoutMs || env.requestTimeoutMs,
      headers: {
        Accept: "application/json",
      },
    });
  }

  ensureConfigured() {
    if (!this.apiKey) {
      const error = new Error("apiKey da Vetor nao informada.");
      error.status = 400;
      throw error;
    }
  }

  buildUrl(pathname) {
    const normalizedBaseUrl = this.baseUrl.endsWith("/")
      ? this.baseUrl
      : `${this.baseUrl}/`;

    return new URL(pathname.replace(/^\//, ""), normalizedBaseUrl).toString();
  }

  async get(pathname, params = {}) {
    this.ensureConfigured();

    try {
      const response = await this.http.get(this.buildUrl(pathname), {
        params,
        headers: {
          Authorization: `ApiKey ${this.apiKey}`,
        },
      });

      return response.data;
    } catch (error) {
      if (error.response) {
        const detail = typeof error.response.data === "string"
          ? error.response.data
          : JSON.stringify(error.response.data);
        const wrapped = new Error(
          `Vetor respondeu ${error.response.status}${detail ? `: ${detail}` : ""}`,
        );
        wrapped.status = error.response.status;
        wrapped.details = error.response.data;
        throw wrapped;
      }

      throw error;
    }
  }
}

export { VetorClient };