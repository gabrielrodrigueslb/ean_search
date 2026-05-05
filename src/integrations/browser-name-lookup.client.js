const env = require("../config/env");

function pickFirstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

class BrowserNameLookupClient {
  async loadPlaywright() {
    try {
      return require("playwright");
    } catch (error) {
      const wrapped = new Error("Playwright nao esta disponivel no projeto.");
      wrapped.cause = error;
      throw wrapped;
    }
  }

  async buscarNomePorEan(ean) {
    const normalizedEan = String(ean || "").trim();
    if (!normalizedEan) {
      return {
        result: null,
        trail: [],
      };
    }

    const playwright = await this.loadPlaywright();
    const browser = await playwright.chromium.launch({
      headless: env.browserFallbackHeadless,
    });

    const trail = [];

    try {
      const context = await browser.newContext({
        locale: "pt-BR",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      });
      const page = await context.newPage();
      page.setDefaultTimeout(env.browserFallbackTimeoutMs);

      const ptResult = await this.tryPtInBrowser(page, normalizedEan);
      trail.push({
        source: "pt_product_search_browser",
        ...ptResult,
      });

      if (ptResult.nome) {
        return {
          result: {
            nome: ptResult.nome,
            origem: "pt_product_search_browser",
          },
          trail,
        };
      }

      const barcodeResult = await this.tryBarcodeInBrowser(page, normalizedEan);
      trail.push({
        source: "barcode_lookup_browser",
        ...barcodeResult,
      });

      if (barcodeResult.nome) {
        return {
          result: {
            nome: barcodeResult.nome,
            origem: "barcode_lookup_browser",
          },
          trail,
        };
      }

      return {
        result: null,
        trail,
      };
    } finally {
      await browser.close();
    }
  }

  async tryPtInBrowser(page, ean) {
    try {
      await page.goto(`https://pt.product-search.net/?q=${encodeURIComponent(ean)}`, {
        waitUntil: "domcontentloaded",
        timeout: env.browserFallbackTimeoutMs,
      });
      await page.waitForTimeout(1500);

      const bodyText = await page.locator("body").textContent();
      const normalizedBody = String(bodyText || "").replace(/\s+/g, " ").trim();
      if (/voce foi bloqueado|voc[eê] foi bloqueado/i.test(normalizedBody)) {
        return {
          nome: null,
          error: "PT.ProductSearch bloqueou a consulta automatizada no browser.",
        };
      }

      const locator = page.locator('a[href^="/ext/"]').first();
      const count = await locator.count();
      if (!count) {
        return {
          nome: null,
          error: null,
        };
      }

      const nome = pickFirstNonEmpty(await locator.textContent());
      return {
        nome,
        error: null,
      };
    } catch (error) {
      return {
        nome: null,
        error: error.message,
      };
    }
  }

  async tryBarcodeInBrowser(page, ean) {
    try {
      await page.goto(`https://www.barcodelookup.com/${encodeURIComponent(ean)}`, {
        waitUntil: "domcontentloaded",
        timeout: env.browserFallbackTimeoutMs,
      });

      await page.waitForTimeout(3000);
      await page.waitForLoadState("networkidle", {
        timeout: Math.min(env.browserFallbackTimeoutMs, 10000),
      }).catch(() => {});

      const pageText = await page.locator("body").textContent();
      const normalizedText = String(pageText || "").replace(/\s+/g, " ").trim();
      if (/security verification/i.test(normalizedText)) {
        return {
          nome: null,
          error: "BarcodeLookup apresentou pagina de seguranca no browser.",
        };
      }

      const locator = page.locator(".product-details h4").first();
      const count = await locator.count();
      if (!count) {
        return {
          nome: null,
          error: null,
        };
      }

      const nome = pickFirstNonEmpty(await locator.textContent());
      return {
        nome,
        error: null,
      };
    } catch (error) {
      return {
        nome: null,
        error: error.message,
      };
    }
  }
}

module.exports = { BrowserNameLookupClient };
