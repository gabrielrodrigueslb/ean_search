const axios = require("axios");
const env = require("../config/env");

function extractNextData(html) {
  const match = String(html).match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i,
  );

  if (!match) {
    return null;
  }

  return JSON.parse(match[1]);
}

class FarmaIndexClient {
  constructor() {
    this.http = axios.create({
      timeout: env.requestTimeoutMs,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
    });
  }

  async buscarPorEan(ean) {
    const response = await this.http.get("https://farmaindex.com/busca", {
      params: { q: ean },
    });

    const nextData = extractNextData(response.data);
    const search = nextData?.props?.pageProps?.search;

    if (!Array.isArray(search) || !search.length) {
      return null;
    }

    const first = search[0];
    if (!first?.medicamentoid || !first?.slug) {
      return null;
    }

    return first;
  }

  async buscarDetalhe({ slug, medicamentoid }) {
    const response = await this.http.get(`https://farmaindex.com/${slug}/${medicamentoid}`);
    const nextData = extractNextData(response.data);
    return nextData?.props?.pageProps?.medicine || null;
  }
}

module.exports = { FarmaIndexClient };
