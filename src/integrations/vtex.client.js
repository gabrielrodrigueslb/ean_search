import axios from "axios";
import env from "../config/env.js";

const VTEX_ENVIRONMENT = "vtexcommercestable";

function normalizeString(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

class VtexClient {
  constructor({ accountName, appKey, appToken, environment = VTEX_ENVIRONMENT }) {
    this.accountName = normalizeString(accountName);
    this.appKey = normalizeString(appKey);
    this.appToken = normalizeString(appToken);
    this.environment = normalizeString(environment) || VTEX_ENVIRONMENT;
    this.http = axios.create({
      timeout: env.requestTimeoutMs,
      headers: {
        Accept: "application/json",
      },
    });
  }

  ensureConfigured() {
    if (!this.accountName) {
      const error = new Error("accountName da VTEX nao informado.");
      error.status = 400;
      throw error;
    }

    if (!this.appKey) {
      const error = new Error("X-VTEX-API-AppKey nao informado.");
      error.status = 400;
      throw error;
    }

    if (!this.appToken) {
      const error = new Error("X-VTEX-API-AppToken nao informado.");
      error.status = 400;
      throw error;
    }
  }

  buildUrl(pathname) {
    this.ensureConfigured();
    const baseUrl = `https://${this.accountName}.${this.environment}.com.br/`;
    return new URL(pathname.replace(/^\//, ""), baseUrl).toString();
  }

  async get(pathname, params = {}) {
    try {
      return await this.http.get(this.buildUrl(pathname), {
        params,
        headers: {
          "X-VTEX-API-AppKey": this.appKey,
          "X-VTEX-API-AppToken": this.appToken,
        },
      });
    } catch (error) {
      if (error.response) {
        const detail = typeof error.response.data === "string"
          ? error.response.data
          : JSON.stringify(error.response.data);
        const wrapped = new Error(
          `VTEX respondeu ${error.response.status}${detail ? `: ${detail}` : ""}`,
        );
        wrapped.status = error.response.status;
        wrapped.details = error.response.data;
        throw wrapped;
      }

      throw error;
    }
  }

  async fetchProductAndSkuIds({ from, to, categoryId } = {}) {
    const response = await this.get("/api/catalog_system/pvt/products/GetProductAndSkuIds", {
      _from: from,
      _to: to,
      ...(categoryId ? { categoryId } : {}),
    });

    return response.data;
  }

  async fetchSkuById(skuId) {
    const response = await this.get(`/api/catalog_system/pvt/sku/stockkeepingunitbyid/${skuId}`);
    return response.data;
  }
}

export { VtexClient, VTEX_ENVIRONMENT };
