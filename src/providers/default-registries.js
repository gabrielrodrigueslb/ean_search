import { ProductLookupSourceRegistry } from "./enrichment/product-lookup-source.registry.js";
import { ConvertizeLookupSource } from "./enrichment/convertize-lookup.source.js";
import env from "../config/env.js";
import { ConfigurableHtmlLookupSource } from "./enrichment/configurable-html-lookup.source.js";
import { ConsultaRemediosLookupSource } from "./enrichment/consulta-remedios-lookup.source.js";
import { DrogasilLookupSource } from "./enrichment/drogasil-lookup.source.js";
import { OpenAiWebLookupSource } from "./enrichment/openai-web-lookup.source.js";
import { PublicSearchLookupSource } from "./enrichment/public-search-lookup.source.js";
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

  if (env.consultaRemediosLookupEnabled) {
    sources.push(new ConsultaRemediosLookupSource());
  }

  if (env.publicSearchLookupEnabled) {
    sources.push(new PublicSearchLookupSource({
      maxCandidates: env.publicSearchLookupMaxCandidates,
      maxFetches: env.publicSearchLookupMaxFetches,
    }));
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
  const apiSources = [];
  if (env.convertizeLookupEnabled) {
    apiSources.push(new ConvertizeLookupSource());
  }

  const scraperSources = createConfiguredHtmlLookupSources();
  const fallbackSources = env.openAiWebLookupEnabled
    ? [new OpenAiWebLookupSource()]
    : [];

  return new ProductLookupSourceRegistry([
    ...resolveLookupSources({
      apiSources,
      scraperSources,
      mode: env.lookupSourceMode,
    }),
    ...fallbackSources,
  ]);
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
