import axios from "axios";
import * as cheerio from "cheerio";
import env from "../config/env.js";

function interpolateTemplate(template, variables = {}) {
  return String(template || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    const value = variables[key];
    return value == null ? "" : String(value);
  });
}

function pickFirstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function normalizeTextValue(value) {
  return pickFirstString(String(value || "").replace(/\s+/g, " ").trim());
}

function normalizeUrl(value, baseUrl = "") {
  const rawValue = String(value || "").trim();

  if (!rawValue) {
    return null;
  }

  if (/^https?:\/\//i.test(rawValue)) {
    return rawValue;
  }

  if (!baseUrl) {
    return rawValue;
  }

  return new URL(rawValue, baseUrl).toString();
}

class HtmlScraperClient {
  constructor({ timeout } = {}) {
    this.http = axios.create({
      timeout: timeout || env.requestTimeoutMs,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
    });
  }

  buildUrl(template, variables = {}, baseUrl = "") {
    const interpolated = interpolateTemplate(template, variables);
    return normalizeUrl(interpolated, baseUrl);
  }

  interpolate(template, variables = {}) {
    return interpolateTemplate(template, variables);
  }

  async fetchDocument({ url, params = null, headers = null }) {
    const response = await this.http.get(url, {
      params: params || undefined,
      headers: headers || undefined,
    });

    return {
      url: response.request?.res?.responseUrl || response.config?.url || url,
      html: response.data,
      $: cheerio.load(response.data),
    };
  }

  extractField($scope, fieldConfig) {
    if (!fieldConfig) {
      return null;
    }

    if (typeof fieldConfig === "string") {
      return this.extractScalarValue($scope, {
        selector: fieldConfig,
      });
    }

    if (typeof fieldConfig !== "object" || !fieldConfig.selector) {
      return null;
    }

    if (fieldConfig.multiple) {
      return this.extractMultipleValues($scope, fieldConfig);
    }

    return this.extractScalarValue($scope, fieldConfig);
  }

  extractScalarValue($scope, fieldConfig) {
    const $node = $scope.find(fieldConfig.selector).first();
    if (!$node.length) {
      return null;
    }

    const rawValue = fieldConfig.attr
      ? $node.attr(fieldConfig.attr)
      : $node.text();

    return this.applyTransforms(rawValue, fieldConfig);
  }

  extractMultipleValues($scope, fieldConfig) {
    const $nodes = $scope.find(fieldConfig.selector);
    const values = $nodes
      .toArray()
      .map((_element, index) => {
        const $element = $nodes.eq(index);
        const rawValue = fieldConfig.attr
          ? $element.attr(fieldConfig.attr)
          : $element.text();

        return this.applyTransforms(rawValue, fieldConfig);
      })
      .filter(Boolean);

    if (!values.length) {
      return [];
    }

    return Array.from(new Set(values));
  }

  applyTransforms(rawValue, fieldConfig) {
    let value = normalizeTextValue(rawValue);
    if (!value) {
      return null;
    }

    if (fieldConfig.regex) {
      const match = value.match(new RegExp(fieldConfig.regex, fieldConfig.regexFlags || ""));
      value = pickFirstString(match?.[fieldConfig.group || 1], match?.[0]);
    }

    if (!value) {
      return null;
    }

    if (fieldConfig.prefix) {
      value = pickFirstString(`${fieldConfig.prefix}${value}`);
    }

    if (fieldConfig.suffix) {
      value = pickFirstString(`${value}${fieldConfig.suffix}`);
    }

    return value;
  }
}

export { HtmlScraperClient, interpolateTemplate, normalizeUrl };
