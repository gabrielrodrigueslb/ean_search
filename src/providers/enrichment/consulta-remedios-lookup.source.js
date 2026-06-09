import { ProductLookupSourceContract } from "../../contracts/product-lookup-source.contract.js";
import { HtmlScraperClient } from "../../integrations/html-scraper.client.js";

function pickFirstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function inferPresentationFromName(value) {
  const source = pickFirstString(value);
  if (!source) {
    return null;
  }

  const match = source.match(/\b(\d+\s*(?:mg|mcg|g|ml).*)$/i);
  return pickFirstString(match?.[1]);
}

function inferCategoryFromUrl(url) {
  const pathname = new URL(url).pathname;
  if (pathname.includes("/p")) {
    return "Medicamentos";
  }

  return null;
}

class ConsultaRemediosLookupSource extends ProductLookupSourceContract {
  constructor({ client } = {}) {
    super();
    this.client = client || new HtmlScraperClient();
  }

  getSourceKey() {
    return "consulta_remedios";
  }

  async lookupByEan(ean) {
    try {
      const normalizedEan = String(ean || "").trim();
      if (!normalizedEan) {
        return {
          key: this.getSourceKey(),
          result: null,
          detail: null,
          error: null,
        };
      }

      const searchUrl = `https://consultaremedios.com.br/busca?termo=${encodeURIComponent(normalizedEan)}`;
      const document = await this.client.fetchDocument({ url: searchUrl });
      const pageEan = pickFirstString(document.$("h1").first().text());
      const pageTitle = pickFirstString(document.$("h2").first().text());

      if (!pageTitle || pageEan !== normalizedEan) {
        return {
          key: this.getSourceKey(),
          result: null,
          detail: null,
          error: null,
        };
      }

      const metaDescription = pickFirstString(
        document.$('meta[name="description"]').attr("content"),
        document.$('meta[property="og:description"]').attr("content"),
      );

      const result = {
        ean: normalizedEan,
        nome: pageTitle,
        nome_produto: pageTitle,
        nome_exibicao: pageTitle,
        produto: pageTitle,
        apresentacao: inferPresentationFromName(pageTitle),
        laboratorio: null,
        categoria: inferCategoryFromUrl(document.url),
        url: document.url,
        raw: {
          source: this.getSourceKey(),
          search_url: searchUrl,
          meta_description: metaDescription,
        },
      };

      const detail = {
        info: {
          produto: pageTitle,
          apresentacao: result.apresentacao,
          laboratorio: null,
          categoria: result.categoria,
          farmacos: [],
        },
        raw: {
          source: this.getSourceKey(),
          detail_url: document.url,
          ean: pageEan,
          meta_description: metaDescription,
        },
      };

      return {
        key: this.getSourceKey(),
        result,
        detail,
        error: null,
      };
    } catch (error) {
      if (Number(error?.response?.status || 0) === 404) {
        return {
          key: this.getSourceKey(),
          result: null,
          detail: null,
          error: null,
        };
      }

      return {
        key: this.getSourceKey(),
        result: null,
        detail: null,
        error: error.message,
      };
    }
  }
}

export { ConsultaRemediosLookupSource };
