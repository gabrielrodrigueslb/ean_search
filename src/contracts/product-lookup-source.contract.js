class ProductLookupSourceContract {
  getSourceKey() {
    throw new Error("ProductLookupSourceContract#getSourceKey precisa ser implementado.");
  }

  async lookupByEan(_ean) {
    throw new Error("ProductLookupSourceContract#lookupByEan precisa ser implementado.");
  }
}

export { ProductLookupSourceContract };