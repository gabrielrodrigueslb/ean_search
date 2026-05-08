import axios from "axios";
import env from "../config/env.js";
class TrierClient {
  constructor({ baseUrl, bearerToken }) {
    this.baseUrl = String(baseUrl || "").trim();
    this.bearerToken = String(bearerToken || "").trim();
    this.http = axios.create({
      timeout: env.trierRequestTimeoutMs,
      headers: {
        Accept: "application/json",
      },
    });
  }

  ensureConfigured() {
    if (!this.baseUrl) {
      const error = new Error("baseUrl da Trier nao informado.");
      error.status = 400;
      throw error;
    }

    if (!this.bearerToken) {
      const error = new Error("bearerToken da Trier nao informado.");
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
          Authorization: `Bearer ${this.bearerToken}`,
        },
      });

      return response.data;
    } catch (error) {
      if (error.response) {
        const detail = typeof error.response.data === "string"
          ? error.response.data
          : JSON.stringify(error.response.data);
        const wrapped = new Error(
          `Trier respondeu ${error.response.status}${detail ? `: ${detail}` : ""}`,
        );
        wrapped.status = error.response.status;
        wrapped.details = error.response.data;
        throw wrapped;
      }

      throw error;
    }
  }
}

export { TrierClient };