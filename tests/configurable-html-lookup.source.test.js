import { describe, expect, test } from "@jest/globals";
import { ConfigurableHtmlLookupSource } from "../src/providers/enrichment/configurable-html-lookup.source.js";

describe("ConfigurableHtmlLookupSource", () => {
  test("raspa resultado de busca e detalhe com configuracao declarativa", async () => {
    const requests = [];
    const source = new ConfigurableHtmlLookupSource({
      config: {
        key: "site_teste",
        baseUrl: "https://site-teste.com",
        search: {
          url: "https://site-teste.com/busca",
          queryParam: "q",
          queryTemplate: "{{ean}}",
        },
        detail: {
          urlTemplate: "{{href}}",
        },
        selectors: {
          resultItem: ".product-card",
          resultLink: { selector: "a", attr: "href" },
          resultName: ".product-title",
          resultPresentation: ".product-presentation",
          resultBrand: ".product-brand",
          detailName: "h1",
          detailPresentation: ".presentation",
          detailBrand: ".brand",
          detailCategory: ".category",
          detailRegistration: { selector: ".registro", regex: "([0-9]{6,})" },
          detailTarja: ".tarja",
          detailForm: ".forma",
          detailRoute: ".via",
          detailQuantity: ".quantidade",
          detailActiveIngredients: { selector: ".ingredientes li", multiple: true },
        },
      },
      client: {
        buildUrl(template, variables) {
          return String(template)
            .replace("{{ean}}", variables.ean || "")
            .replace("{{href}}", variables.href || "")
            .replace("{{baseUrl}}", variables.baseUrl || "");
        },
        async fetchDocument({ url, params = null }) {
          requests.push({ url, params });

          if (url.includes("/busca")) {
            const cheerio = await import("cheerio");
            const html = `
              <div class="product-card">
                <a href="https://site-teste.com/produto/123">Ver</a>
                <div class="product-title">Dorflex</div>
                <div class="product-presentation">36 comprimidos</div>
                <div class="product-brand">Opella</div>
              </div>
            `;

            return {
              url,
              html,
              $: cheerio.load(html),
            };
          }

          const cheerio = await import("cheerio");
          const html = `
            <h1>Dorflex</h1>
            <div class="presentation">36 comprimidos</div>
            <div class="brand">Opella</div>
            <div class="category">Analgesico</div>
            <div class="registro">Registro MS 1862000080116</div>
            <div class="tarja">Venda Livre</div>
            <div class="forma">Comprimidos</div>
            <div class="via">Oral</div>
            <div class="quantidade">36</div>
            <ul class="ingredientes">
              <li>Dipirona Monoidratada</li>
              <li>Cafeina</li>
            </ul>
          `;

          return {
            url,
            html,
            $: cheerio.load(html),
          };
        },
        extractField(...args) {
          const [scope, config] = args;

          if (!config) {
            return null;
          }

          const selector = typeof config === "string" ? { selector: config } : config;
          const root = scope.find(selector.selector);

          if (selector.multiple) {
            return root.toArray().map((_element, index) => root.eq(index).text().trim());
          }

          const first = root.first();
          if (!first.length) {
            return null;
          }

          const value = selector.attr ? first.attr(selector.attr) : first.text().trim();
          if (selector.regex) {
            const match = String(value).match(new RegExp(selector.regex));
            return match?.[1] || null;
          }

          return value;
        },
      },
    });

    const lookup = await source.lookupByEan("7891058017507");

    expect(requests[0]).toEqual({
      url: "https://site-teste.com/busca",
      params: { q: "7891058017507" },
    });
    expect(lookup.result).toEqual(expect.objectContaining({
      nome: "Dorflex",
      apresentacao: "36 comprimidos",
      laboratorio: "Opella",
      url: "https://site-teste.com/produto/123",
    }));
    expect(lookup.detail).toEqual(expect.objectContaining({
      info: expect.objectContaining({
        produto: "Dorflex",
        apresentacao: "36 comprimidos",
        laboratorio: "Opella",
        categoria: "Analgesico",
        registro: "1862000080116",
        farmacos: [
          { farmaco: "Dipirona Monoidratada" },
          { farmaco: "Cafeina" },
        ],
      }),
    }));
  });
});
