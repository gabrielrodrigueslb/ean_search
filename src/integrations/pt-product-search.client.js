const axios = require("axios");
const cheerio = require("cheerio");
const env = require("../config/env");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class PtProductSearchClient {
  constructor() {
    this.http = axios.create({
      timeout: env.requestTimeoutMs,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
    });

    this.queue = Promise.resolve();
    this.requestTimestamps = [];
    this.maxRequestsPerMinute = Math.max(1, env.ptProductSearchMaxRequestsPerMinute || 45);
  }

  schedule(task) {
    const run = this.queue.then(async () => {
      await this.waitForRateLimit();
      return task();
    });

    this.queue = run.catch(() => {});
    return run;
  }

  async waitForRateLimit() {
    while (true) {
      const now = Date.now();
      this.requestTimestamps = this.requestTimestamps.filter(
        (timestamp) => now - timestamp < 60_000,
      );

      if (this.requestTimestamps.length < this.maxRequestsPerMinute) {
        this.requestTimestamps.push(now);
        return;
      }

      const oldest = this.requestTimestamps[0];
      const waitMs = Math.max(250, 60_000 - (now - oldest) + 50);
      await sleep(waitMs);
    }
  }

  async buscarNomePorEan(ean) {
    return this.schedule(async () => {
      const response = await this.http.get("https://pt.product-search.net/", {
        params: { q: ean },
      });

      const $ = cheerio.load(response.data);
      const bodyText = $("body").text().replace(/\s+/g, " ").trim();
      if (/voce foi bloqueado|voc[eê] foi bloqueado/i.test(bodyText)) {
        throw new Error("PT.ProductSearch bloqueou a consulta automatizada.");
      }

      const node = $('a[href^="/ext/"]').first();
      const nome = node.text().trim();

      if (!nome) {
        return null;
      }

      return {
        nome,
        origem: "pt_product_search",
      };
    });
  }
}

module.exports = { PtProductSearchClient };
