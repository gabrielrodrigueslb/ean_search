const axios = require("axios");
const cheerio = require("cheerio");
const env = require("../config/env");

class FarmaIndexClient {
  constructor() {
    this.http = axios.create({
      timeout: env.requestTimeoutMs,
      headers: {
        "User-Agent": "ean-search-mvp/1.0",
      },
    });
  }

  extractNextData(html) {
    const $ = cheerio.load(html);
    const raw = $("#__NEXT_DATA__").html();
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  }

  async buscarPorEan(ean) {
    const response = await this.http.get("https://farmaindex.com/busca", {
      params: { q: ean },
    });

    const nextData = this.extractNextData(response.data);
    const search = nextData?.props?.pageProps?.search;
    if (!Array.isArray(search) || !search.length) {
      return null;
    }

    return search[0];
  }

  async buscarDetalhe({ slug, medicamentoid }) {
    const response = await this.http.get(`https://farmaindex.com/${slug}/${medicamentoid}`);
    const nextData = this.extractNextData(response.data);
    return nextData?.props?.pageProps?.medicine || null;
  }
}

module.exports = { FarmaIndexClient };
