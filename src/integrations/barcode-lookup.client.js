const axios = require("axios");
const cheerio = require("cheerio");
const env = require("../config/env");

function pickFirstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

class BarcodeLookupClient {
  constructor() {
    this.http = axios.create({
      timeout: env.requestTimeoutMs,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      },
    });
  }

  parseNameFromHtml(html) {
    const $ = cheerio.load(html);

    const productDetails = $(".product-details");
    const h4Name = pickFirstNonEmpty(productDetails.find("h4").first().text());
    if (h4Name) {
      return h4Name;
    }

    const metaDescription = $('meta[name="description"]').attr("content") || "";
    const metaMatch = metaDescription.match(/-\s*(.+?)\s*\.?$/);
    if (metaMatch?.[1]) {
      return metaMatch[1].trim();
    }

    return null;
  }

  async buscarNomePorEan(ean) {
    const normalizedEan = String(ean || "").trim();
    if (!normalizedEan) {
      return null;
    }

    const response = await this.http.get(`https://www.barcodelookup.com/${encodeURIComponent(normalizedEan)}`);
    const nome = this.parseNameFromHtml(response.data);

    if (!nome) {
      return null;
    }

    return {
      nome,
      origem: "barcode_lookup",
    };
  }
}

module.exports = { BarcodeLookupClient };
