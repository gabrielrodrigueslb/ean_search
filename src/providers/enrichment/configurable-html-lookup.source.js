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

class ConfigurableHtmlLookupSource extends ProductLookupSourceContract {
  constructor({ config, client } = {}) {
    super();

    if (!config?.key) {
      throw new Error("ConfigurableHtmlLookupSource precisa de config.key.");
    }

    this.config = config;
    this.client = client || new HtmlScraperClient();
  }

  getSourceKey() {
    return String(this.config.key).trim().toLowerCase();
  }

  async lookupByEan(ean) {
    try {
      const result = await this.fetchSearchResult(ean);
      const detail = result?.url
        ? await this.fetchDetail(result.url)
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
    const searchConfig = this.config.search || {};
    const selectors = this.config.selectors || {};
    const baseUrl = this.config.baseUrl || searchConfig.baseUrl || "";
    const templateVariables = { ean, baseUrl };
    const queryValue = this.client.interpolate
      ? this.client.interpolate(searchConfig.queryTemplate || "{{ean}}", templateVariables)
      : String(searchConfig.queryTemplate || "{{ean}}").replace("{{ean}}", ean);
    const document = await this.client.fetchDocument({
      url: this.client.buildUrl(
        searchConfig.url || searchConfig.urlTemplate,
        templateVariables,
        baseUrl,
      ),
      params: searchConfig.queryParam
        ? { [searchConfig.queryParam]: queryValue }
        : null,
      headers: searchConfig.headers || null,
    });

    const $scope = selectors.resultItem
      ? document.$(selectors.resultItem).first()
      : document.$.root();

    if (!$scope.length) {
      return null;
    }

    const href = this.client.extractField($scope, selectors.resultLink);
    const url = href
      ? this.client.buildUrl(
        this.config.detail?.urlTemplate || href,
        { ean, href, baseUrl },
        baseUrl,
      )
      : null;

    const nome = pickFirstString(
      this.client.extractField($scope, selectors.resultName),
      this.client.extractField($scope, selectors.resultDisplayName),
    );

    const apresentacao = this.client.extractField($scope, selectors.resultPresentation);

    if (!nome && !href && !apresentacao) {
      return null;
    }

    return {
      nome,
      nome_produto: nome,
      nome_exibicao: pickFirstString(
        this.client.extractField($scope, selectors.resultDisplayName),
        [nome, apresentacao].filter(Boolean).join(" ").trim(),
        nome,
      ),
      produto: nome,
      apresentacao,
      laboratorio: this.client.extractField($scope, selectors.resultBrand),
      categoria: this.client.extractField($scope, selectors.resultCategory),
      tarja: this.client.extractField($scope, selectors.resultTarja),
      href,
      url,
      raw: {
        source: this.getSourceKey(),
        search_url: document.url,
      },
    };
  }

  async fetchDetail(url) {
    const selectors = this.config.selectors || {};
    const detailConfig = this.config.detail || {};
    const document = await this.client.fetchDocument({
      url,
      headers: detailConfig.headers || null,
    });

    const activeIngredients = this.client.extractField(document.$.root(), selectors.detailActiveIngredients);

    return {
      info: {
        produto: pickFirstString(
          this.client.extractField(document.$.root(), selectors.detailName),
          this.client.extractField(document.$.root(), selectors.resultName),
        ),
        apresentacao: this.client.extractField(document.$.root(), selectors.detailPresentation),
        laboratorio: this.client.extractField(document.$.root(), selectors.detailBrand),
        classe: this.client.extractField(document.$.root(), selectors.detailClass),
        categoria: this.client.extractField(document.$.root(), selectors.detailCategory),
        registro: this.client.extractField(document.$.root(), selectors.detailRegistration),
        tarja: this.client.extractField(document.$.root(), selectors.detailTarja),
        forma_farmaceutica: this.client.extractField(document.$.root(), selectors.detailForm),
        via_adm: this.client.extractField(document.$.root(), selectors.detailRoute),
        qtde_fs: this.client.extractField(document.$.root(), selectors.detailQuantity),
        farmacos: Array.isArray(activeIngredients)
          ? activeIngredients.map((farmaco) => ({ farmaco }))
          : [],
      },
      raw: {
        source: this.getSourceKey(),
        detail_url: document.url,
        descricao: this.client.extractField(document.$.root(), selectors.detailDescription),
      },
    };
  }
}

export { ConfigurableHtmlLookupSource };
