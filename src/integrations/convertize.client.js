import axios from "axios";
import env from "../config/env.js";
function pickFirstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

class ConvertizeClient {
  constructor(config = {}) {
    this.token = config.token || env.convertizeApiToken;
    this.environment = config.environment || env.convertizeEnvironment;
    this.baseUrl = trimTrailingSlash(config.baseUrl || env.convertizeBaseUrl || "https://api.convertize.com.br");
    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: env.convertizeRequestTimeoutMs || env.requestTimeoutMs,
      headers: {
        Accept: "*/*",
        "Content-Type": "application/json",
        "User-Agent": "insomnia/12.5.0",
        ...(this.token ? { Authorization: `Token ${this.token}` } : {}),
      },
    });
  }

  isConfigured() {
    return Boolean(this.token && this.environment);
  }

  normalizeSku(data) {
    if (!data || typeof data !== "object") {
      return null;
    }

    const title = pickFirstString(
      data.title,
      data.nome,
      data.name,
      data.product_name,
      data.description,
    );

    if (!title) {
      return null;
    }

    return {
      nome: title,
      origem: "convertize",
      skuId: data.id || data.sku_id || null,
      produtoId: data.product_id || data.produto_id || null,
      title,
      marca: pickFirstString(data.brand, data.brand_name, data.marca, data.manufacturer),
      fabricante: pickFirstString(data.manufacturer, data.brand_name, data.brand, data.marca),
      categoria: pickFirstString(data.category, data.category_name, data.departamento, data.department),
      departamento: pickFirstString(data.department, data.department_name),
      unidade: pickFirstString(data.measurement_unit, data.unit),
      quantidade: pickFirstString(data.quantity, data.package_quantity),
      volume: pickFirstString(data.volume),
      descricao: pickFirstString(data.description, data.short_description),
      raw: data,
    };
  }

  extractFirstItem(payload) {
    if (Array.isArray(payload)) {
      return this.normalizeSku(payload[0]);
    }

    const collections = [
      payload?.data,
      payload?.results,
      payload?.items,
      payload?.skus,
      payload?.rows,
    ];

    for (const collection of collections) {
      if (Array.isArray(collection) && collection.length) {
        return this.normalizeSku(collection[0]);
      }
    }

    return this.normalizeSku(payload);
  }

  async get(pathname, params) {
    if (!this.isConfigured()) {
      throw new Error("Convertize nao configurada. Defina CONVERTIZE_API_TOKEN e CONVERTIZE_ENVIRONMENT.");
    }

    const response = await this.http.get(`/${encodeURIComponent(this.environment)}${pathname}`, {
      params,
    });

    return this.extractFirstItem(response.data);
  }

  async buscarProdutoPorEan(ean) {
    const normalizedEan = String(ean || "").trim();
    if (!normalizedEan) {
      return null;
    }

    const attempts = [
      { pathname: "/api/v1/products", params: { upc: normalizedEan } },
      { pathname: "/api/v1/products", params: { reference_code: normalizedEan } },
    ];

    for (const attempt of attempts) {
      const result = await this.get(attempt.pathname, attempt.params);
      if (result) {
        return result;
      }
    }

    return null;
  }

  async buscarSkuPorEan(ean) {
    const normalizedEan = String(ean || "").trim();
    if (!normalizedEan) {
      return null;
    }

    return this.get("/api/v1/skus", { ean_13: normalizedEan });
  }

  async buscarPorEan(ean) {
    const sku = await this.buscarSkuPorEan(ean);
    if (sku) {
      return sku;
    }

    return this.buscarProdutoPorEan(ean);
  }
}

export { ConvertizeClient };