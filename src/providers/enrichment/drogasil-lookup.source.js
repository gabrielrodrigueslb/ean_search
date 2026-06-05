import { ProductLookupSourceContract } from "../../contracts/product-lookup-source.contract.js";
import { HtmlScraperClient } from "../../integrations/html-scraper.client.js";
import { normalizeText } from "../../utils/normalizeText.js";

function pickFirstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function stripQueryString(value) {
  return String(value || "").split("?")[0];
}

function buildAbsoluteUrl(pathname) {
  const path = stripQueryString(pathname);
  if (!path) {
    return null;
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return new URL(path, "https://www.drogasil.com.br").toString();
}

function extractNextData(html, $ = null) {
  const scriptContent = $?.("script#__NEXT_DATA__").html();
  if (scriptContent) {
    return JSON.parse(scriptContent);
  }

  const match = String(html || "").match(
    /<script[^>]*id="__NEXT_DATA__"[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/i,
  );

  if (!match) {
    return null;
  }

  return JSON.parse(match[1]);
}

function resolveSearchPageProps(nextData) {
  const pageProps = nextData?.props?.pageProps || {};
  if (Array.isArray(pageProps?.results?.products)) {
    return pageProps;
  }

  const nestedPageProps = pageProps?.pageProps || {};
  if (Array.isArray(nestedPageProps?.results?.products)) {
    return nestedPageProps;
  }

  return pageProps;
}

function resolveProductPageProps(nextData) {
  const pageProps = nextData?.props?.pageProps || {};
  if (pageProps?.productData) {
    return pageProps;
  }

  const nestedPageProps = pageProps?.pageProps || {};
  if (nestedPageProps?.productData) {
    return nestedPageProps;
  }

  return pageProps;
}

function htmlToText(value) {
  if (!pickFirstString(value)) {
    return null;
  }

  return String(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getCustomAttribute(customAttributes = [], attributeCode) {
  return customAttributes.find((attribute) => attribute?.attribute_code === attributeCode) || null;
}

function getCustomAttributeString(customAttributes = [], attributeCode) {
  const attribute = getCustomAttribute(customAttributes, attributeCode);
  if (!attribute) {
    return null;
  }

  return pickFirstString(
    ...(Array.isArray(attribute.value_string) ? attribute.value_string : []),
  );
}

function getCustomAttributeLabel(customAttributes = [], attributeCode) {
  const attribute = getCustomAttribute(customAttributes, attributeCode);
  if (!attribute) {
    return null;
  }

  return pickFirstString(
    ...(Array.isArray(attribute.value)
      ? attribute.value.map((entry) => entry?.label)
      : []),
  );
}

function uniquePreservingOrder(values = []) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(value);
  }

  return result;
}

function inferIngredients(text) {
  const sourceText = String(text || "");
  if (!sourceText.trim()) {
    return [];
  }

  const patterns = [
    { label: "Carbonato de Cálcio", regex: /carbonato de c[aá]lcio/gi },
    { label: "Colecalciferol", regex: /colecalciferol/gi },
    { label: "Vitamina D3", regex: /vitamina\s*d3\b/gi },
    { label: "Vitamina D", regex: /vitamina\s*d\b/gi },
    { label: "Cálcio", regex: /\bc[aá]lcio\b/gi },
    { label: "Magnésio", regex: /magn[eé]sio/gi },
    { label: "Zinco", regex: /\bzinco\b/gi },
    { label: "Colágeno", regex: /col[aá]geno/gi },
    { label: "Ferro", regex: /\bferro\b/gi },
    { label: "Ômega 3", regex: /omega\s*3|ômega\s*3/gi },
    { label: "Creatina", regex: /creatina/gi },
    { label: "Melatonina", regex: /melatonina/gi },
    { label: "Cafeína", regex: /cafe[ií]na/gi },
  ];

  const matches = patterns
    .filter(({ regex }) => regex.test(sourceText))
    .map(({ label }) => label);

  return uniquePreservingOrder(matches);
}

function splitIngredients(value) {
  return uniquePreservingOrder(
    String(value || "")
      .split(/[,;/]| e /i)
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function normalizeUnitLabel(value) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  if (["un", "uni", "unid", "unidade", "unidades"].includes(normalized)) {
    return "unidades";
  }

  if (["comp", "comprimido", "comprimidos"].includes(normalized)) {
    return "comprimidos";
  }

  if (["caps", "capsula", "capsulas", "cps"].includes(normalized)) {
    return "capsulas";
  }

  if (["ml", "l", "g", "kg", "mg", "mcg"].includes(normalized)) {
    return normalized;
  }

  return value.trim();
}

function extractPackageInfo(...values) {
  for (const value of values) {
    const source = pickFirstString(value);
    if (!source) {
      continue;
    }

    const compactMatch = source.match(/\b(\d+)\s*(un|uni|unid|unidade|unidades|comp|comprimido|comprimidos|caps|capsula|capsulas|cps|ml|l|g|kg)\b/i);
    if (compactMatch) {
      return {
        quantidade: compactMatch[1],
        unidade: normalizeUnitLabel(compactMatch[2]),
      };
    }
  }

  return {
    quantidade: null,
    unidade: null,
  };
}

function extractBreadcrumbNames(items = []) {
  const normalizedItems = Array.isArray(items) ? items : [];

  return normalizedItems
    .map((item) => pickFirstString(item?.name))
    .filter(Boolean);
}

function buildSearchCategories(product = {}) {
  const categories = Array.isArray(product.categories)
    ? product.categories.map((category) => pickFirstString(category?.name)).filter(Boolean)
    : [];

  return {
    departamento: categories[0] || null,
    categoria: categories[1] || null,
    subcategoria: categories[2] || null,
  };
}

class DrogasilLookupSource extends ProductLookupSourceContract {
  constructor({ client } = {}) {
    super();
    this.client = client || new HtmlScraperClient();
  }

  getSourceKey() {
    return "drogasil";
  }

  async lookupByEan(ean) {
    try {
      const result = await this.fetchSearchResult(ean);
      const detail = result?.url
        ? await this.fetchProductDetail(result.url, result)
        : null;

      return {
        key: this.getSourceKey(),
        result,
        detail,
        error: null,
      };
    } catch (error) {
      return {
        key: this.getSourceKey(),
        result: null,
        detail: null,
        error: error.message,
      };
    }
  }

  async fetchSearchResult(ean) {
    const normalizedEan = String(ean || "").trim();
    if (!normalizedEan) {
      return null;
    }

    const document = await this.client.fetchDocument({
      url: "https://www.drogasil.com.br/search",
      params: { w: normalizedEan },
    });
    const nextData = extractNextData(document.html, document.$);
    const pageProps = resolveSearchPageProps(nextData);
    const firstProduct = pageProps?.results?.products?.[0];

    if (!firstProduct?.url || !firstProduct?.name) {
      return null;
    }

    const categoryTree = buildSearchCategories(firstProduct);
    const cleanUrl = buildAbsoluteUrl(firstProduct.url);

    return {
      ean: normalizedEan,
      sku: pickFirstString(firstProduct.sku, firstProduct.objectID),
      nome: pickFirstString(firstProduct.name),
      nome_produto: pickFirstString(firstProduct.name),
      nome_exibicao: pickFirstString(firstProduct.name),
      produto: pickFirstString(firstProduct.name),
      marca: pickFirstString(firstProduct.brand),
      fabricante: null,
      laboratorio: pickFirstString(firstProduct.brand),
      departamento: categoryTree.departamento,
      categoria: categoryTree.categoria,
      subcategoria: categoryTree.subcategoria,
      segmento: pickFirstString(firstProduct.productGroup),
      subsegmento: null,
      href: stripQueryString(firstProduct.url),
      url: cleanUrl,
      raw: {
        source: this.getSourceKey(),
        search_url: document.url,
        categories: firstProduct.categories || [],
        hierarchical_categories: firstProduct.hierarchicalCategories || {},
      },
    };
  }

  async fetchProductDetail(url, searchResult = null) {
    const document = await this.client.fetchDocument({ url });
    const nextData = extractNextData(document.html, document.$);
    const pageProps = resolveProductPageProps(nextData);
    const productData = pageProps.productData || {};
    const customAttributes = Array.isArray(productData.custom_attributes)
      ? productData.custom_attributes
      : [];
    const schemaNodes = Array.isArray(pageProps.pdpSeoSchemaResult?.nodes)
      ? pageProps.pdpSeoSchemaResult.nodes
      : [];
    const productSchema = schemaNodes.find((node) => node?.["@type"] === "Product") || null;
    const breadcrumbNames = extractBreadcrumbNames(productData.breadcrumb);
    const rawDescription = pickFirstString(
      getCustomAttributeString(customAttributes, "description"),
      getCustomAttributeString(customAttributes, "short_description"),
      productSchema?.description,
    );
    const descriptionText = htmlToText(rawDescription);
    const descricaoOriginal = pickFirstString(productData.name, productSchema?.name);
    const descricaoNormalizada = descricaoOriginal
      ? normalizeText(descricaoOriginal)
      : null;
    const packInfo = extractPackageInfo(
      getCustomAttributeString(customAttributes, "quantidade"),
      descricaoOriginal,
      getCustomAttributeString(customAttributes, "descricaodetalhada"),
    );
    const marca = pickFirstString(
      getCustomAttributeLabel(customAttributes, "marca"),
      productSchema?.brand?.name,
      searchResult?.marca,
    );
    const fabricante = pickFirstString(
      getCustomAttributeLabel(customAttributes, "fabricante"),
      searchResult?.fabricante,
    );
    const departamento = pickFirstString(breadcrumbNames[0], searchResult?.departamento);
    const categoria = pickFirstString(breadcrumbNames[1], searchResult?.categoria);
    const subcategoria = pickFirstString(breadcrumbNames[2], searchResult?.subcategoria);
    const segmento = pickFirstString(
      getCustomAttributeString(customAttributes, "grupo"),
      searchResult?.segmento,
    );
    const subsegmento = pickFirstString(
      getCustomAttributeString(customAttributes, "subgruponome"),
      searchResult?.subsegmento,
    );
    const ingredienteAtivo = pickFirstString(
      getCustomAttributeString(customAttributes, "principioativonovo"),
      splitIngredients(inferIngredients([descricaoOriginal, descriptionText].filter(Boolean).join(" ")).join(", ")).join(", "),
    );
    const ingredientList = splitIngredients(ingredienteAtivo);
    const ean = pickFirstString(
      productData.productEan,
      getCustomAttributeString(customAttributes, "ean"),
      productSchema?.gtin13,
      searchResult?.ean,
    );

    return {
      info: {
        gtin: ean,
        produto: descricaoOriginal,
        apresentacao: descriptionText,
        descricao: descriptionText,
        laboratorio: pickFirstString(fabricante, marca),
        categoria,
        classe: null,
        departamento,
        subcategoria,
        segmento,
        subsegmento,
        dose: pickFirstString(getCustomAttributeString(customAttributes, "dosagem")),
        unidade: packInfo.unidade,
        qtde_fs: packInfo.quantidade,
        tarja: pickFirstString(getCustomAttributeString(customAttributes, "descricaotarja")),
        descricao_original: descricaoOriginal,
        descricao_normalizada: descricaoNormalizada,
        ingrediente_ativo: ingredienteAtivo || null,
        farmacos: ingredientList.map((name) => ({ farmaco: name })),
      },
      raw: {
        source: this.getSourceKey(),
        detail_url: document.url,
        sku: pickFirstString(productData.sku, searchResult?.sku),
        marca,
        fabricante,
        departamento,
        categoria,
        subcategoria,
        segmento,
        subsegmento,
        dose: pickFirstString(getCustomAttributeString(customAttributes, "dosagem")),
        unidade: packInfo.unidade,
        quantidade: packInfo.quantidade,
        tarja: pickFirstString(getCustomAttributeString(customAttributes, "descricaotarja")),
        descricao_original: descricaoOriginal,
        descricao_normalizada: descricaoNormalizada,
        ingrediente_ativo: ingredienteAtivo || null,
        descricao: descriptionText,
        ean,
      },
    };
  }
}

export { DrogasilLookupSource };
