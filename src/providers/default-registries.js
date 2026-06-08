import { ProductLookupSourceRegistry } from "./enrichment/product-lookup-source.registry.js";
import { ConvertizeLookupSource } from "./enrichment/convertize-lookup.source.js";
import env from "../config/env.js";
import { ConfigurableHtmlLookupSource } from "./enrichment/configurable-html-lookup.source.js";
import { DrogasilLookupSource } from "./enrichment/drogasil-lookup.source.js";
import { ImportProviderRegistry } from "./import/import-provider.registry.js";
import { PostgresEmbalagemImportProvider } from "./import/postgres-embalagem-import.provider.js";
import { TrierImportProvider } from "./import/trier-import.provider.js";
import { VetorImportProvider } from "./import/vetor-import.provider.js";
import { VtexImportProvider } from "./import/vtex-import.provider.js";

function createConfiguredHtmlLookupSources() {
  const sources = [];

  if (env.drogasilLookupEnabled) {
    sources.push(new DrogasilLookupSource());
  }

  if (!Array.isArray(env.htmlLookupSources) || !env.htmlLookupSources.length) {
    return sources;
  }

  return [
    ...sources,
    ...env.htmlLookupSources
      .filter((config) => config && config.enabled !== false)
      .map((config) => new ConfigurableHtmlLookupSource({ config })),
  ];
}

function resolveLookupSources({ apiSources, scraperSources, mode }) {
  switch (mode) {
    case "api_only":
      return apiSources;
    case "scraping_only":
      return scraperSources;
    case "scraping_first":
      return [...scraperSources, ...apiSources];
    case "api_first":
    default:
      return [...apiSources, ...scraperSources];
  }
}

function createDefaultProductLookupSourceRegistry() {
  const apiSources = [new ConvertizeLookupSource()];
  const scraperSources = createConfiguredHtmlLookupSources();

  return new ProductLookupSourceRegistry(resolveLookupSources({
    apiSources,
    scraperSources,
    mode: env.lookupSourceMode,
  }));
}

function createDefaultImportProviderRegistry() {
  return new ImportProviderRegistry([
    new TrierImportProvider(),
    new VetorImportProvider(),
    new VtexImportProvider(),
    new PostgresEmbalagemImportProvider(),
  ]);
}

export {
  createConfiguredHtmlLookupSources,
  createDefaultProductLookupSourceRegistry,
  createDefaultImportProviderRegistry,
  resolveLookupSources,
};
