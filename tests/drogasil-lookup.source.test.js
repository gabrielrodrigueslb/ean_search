import fs from "fs";
import path from "path";
import { describe, expect, test } from "@jest/globals";
import { DrogasilLookupSource } from "../src/providers/enrichment/drogasil-lookup.source.js";

function buildProductHtml() {
  const nextData = {
    props: {
      pageProps: {
        productData: {
          sku: "1275582",
          name: "Calcium Maxx D3 (60 Comp) - Padrão: Único",
          breadcrumb: [
            { name: "Vitaminas e Suplementos", position: 1 },
            { name: "Vitaminas", position: 2 },
            { name: "Cálcio", position: 3 },
          ],
          productEan: "7898593053571",
          custom_attributes: [
            {
              attribute_code: "description",
              value_string: [
                "Calcium Maxx D3 é enriquecido com vitamina D3 e auxilia na fixação eficiente do cálcio no organismo.",
              ],
              value: null,
            },
            {
              attribute_code: "marca",
              value_string: [],
              value: [{ label: "Maxinutri" }],
            },
            {
              attribute_code: "fabricante",
              value_string: [],
              value: [{ label: null }],
            },
            {
              attribute_code: "grupo",
              value_string: ["OTC"],
              value: null,
            },
            {
              attribute_code: "subgruponome",
              value_string: ["SAUDE"],
              value: null,
            },
            {
              attribute_code: "ean",
              value_string: ["7898593053571"],
              value: null,
            },
            {
              attribute_code: "quantidade",
              value_string: ["60 comp"],
              value: null,
            },
            {
              attribute_code: "principioativonovo",
              value_string: [""],
              value: null,
            },
          ],
        },
        pdpSeoSchemaResult: {
          nodes: [
            {
              "@type": "Product",
              name: "Calcium Maxx D3 (60 Comp) - Padrão: Único",
              sku: "1275582",
              gtin13: "7898593053571",
              brand: {
                "@type": "Brand",
                name: "Maxinutri",
              },
            },
          ],
        },
      },
    },
  };

  return `<!DOCTYPE html><html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script></body></html>`;
}

describe("DrogasilLookupSource", () => {
  test("busca o primeiro resultado por EAN e extrai dados do detalhe", async () => {
    const searchHtml = fs.readFileSync(
      path.resolve(process.cwd(), "example.html"),
      "utf8",
    );
    const productHtml = buildProductHtml();

    const source = new DrogasilLookupSource({
      client: {
        async fetchDocument({ url, params }) {
          if (String(url).includes("/search")) {
            return {
              url: `https://www.drogasil.com.br/search?w=${params.w}`,
              html: searchHtml,
              $: (await import("cheerio")).load(searchHtml),
            };
          }

          return {
            url,
            html: productHtml,
            $: (await import("cheerio")).load(productHtml),
          };
        },
      },
    });

    const lookup = await source.lookupByEan("7898593053571");

    expect(lookup.result).toEqual(expect.objectContaining({
      ean: "7898593053571",
      sku: "1275582",
      nome: "Calcium Maxx D3 (60 Comp) - Padrão: Único",
      marca: "Maxinutri",
      departamento: "Vitaminas e Suplementos",
      categoria: "Vitaminas",
      subcategoria: "Cálcio",
      href: "/calcium-maxx-d3-60-comp-padrao-unico-1275582.html",
      url: "https://www.drogasil.com.br/calcium-maxx-d3-60-comp-padrao-unico-1275582.html",
    }));
    expect(lookup.detail).toEqual(expect.objectContaining({
      info: expect.objectContaining({
        gtin: "7898593053571",
        produto: "Calcium Maxx D3 (60 Comp) - Padrão: Único",
        departamento: "Vitaminas e Suplementos",
        categoria: "Vitaminas",
        subcategoria: "Cálcio",
        segmento: "OTC",
        subsegmento: "SAUDE",
        descricao_original: "Calcium Maxx D3 (60 Comp) - Padrão: Único",
        descricao_normalizada: "calcium maxx d3 60 comp padrao unico",
        ingrediente_ativo: "Vitamina D3, Cálcio",
        qtde_fs: "60",
        unidade: "comprimidos",
        farmacos: [
          { farmaco: "Vitamina D3" },
          { farmaco: "Cálcio" },
        ],
      }),
      raw: expect.objectContaining({
        marca: "Maxinutri",
        ean: "7898593053571",
      }),
    }));
  });
});
