const axios = require("axios");
const cheerio = require("cheerio");
const env = require("../config/env");

class PtProductSearchClient {
  constructor() {
    this.http = axios.create({
      timeout: env.requestTimeoutMs,
      headers: {
        "User-Agent": "ean-search-mvp/1.0",
      },
    });
  }

  async buscarNomePorEan(ean) {
    const response = await this.http.get("https://pt.product-search.net/", {
      params: { q: ean },
    });

    const $ = cheerio.load(response.data);
    const node = $('a[href^="/ext/"]').first();
    const nome = node.text().trim();

    if (!nome) {
      return null;
    }

    return {
      nome,
      origem: "pt_product_search",
    };
  }
}

module.exports = { PtProductSearchClient };
