import { ProductLookupSourceRegistry } from "./enrichment/product-lookup-source.registry.js";
import { ConvertizeLookupSource } from "./enrichment/convertize-lookup.source.js";
import { FarmaIndexLookupSource } from "./enrichment/farmaindex-lookup.source.js";
import { ImportProviderRegistry } from "./import/import-provider.registry.js";
import { TrierImportProvider } from "./import/trier-import.provider.js";
import { VetorImportProvider } from "./import/vetor-import.provider.js";
function createDefaultProductLookupSourceRegistry() {
  return new ProductLookupSourceRegistry([
    new ConvertizeLookupSource(),
    new FarmaIndexLookupSource(),
  ]);
}

function createDefaultImportProviderRegistry() {
  return new ImportProviderRegistry([
    new TrierImportProvider(),
    new VetorImportProvider(),
  ]);
}

export { createDefaultProductLookupSourceRegistry, createDefaultImportProviderRegistry, };