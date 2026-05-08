class ProductLookupSourceRegistry {
  constructor(sources = []) {
    this.sources = new Map();

    for (const source of sources) {
      this.register(source);
    }
  }

  register(source) {
    this.sources.set(source.getSourceKey(), source);
    return this;
  }

  get(sourceKey) {
    return this.sources.get(sourceKey) || null;
  }

  getAll() {
    return Array.from(this.sources.values());
  }

  async lookupByEan(ean) {
    const entries = await Promise.all(
      this.getAll().map(async (source) => [source.getSourceKey(), await source.lookupByEan(ean)]),
    );

    return Object.fromEntries(entries);
  }
}

export { ProductLookupSourceRegistry };