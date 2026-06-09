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

  buildSkippedLookup(sourceKey, resolvedBySourceKey) {
    return {
      key: sourceKey,
      result: null,
      detail: null,
      error: null,
      skipped: true,
      skip_reason: resolvedBySourceKey
        ? `resolved_by_${resolvedBySourceKey}`
        : "resolved_by_previous_source",
    };
  }

  async lookupByEan(ean, context = {}) {
    const entries = [];
    let resolvedBySourceKey = null;

    for (const source of this.getAll()) {
      const sourceKey = source.getSourceKey();

      if (resolvedBySourceKey) {
        entries.push([sourceKey, this.buildSkippedLookup(sourceKey, resolvedBySourceKey)]);
        continue;
      }

      const lookup = await source.lookupByEan(ean, context);
      entries.push([sourceKey, lookup]);

      if (lookup?.result || lookup?.detail) {
        resolvedBySourceKey = sourceKey;
      }
    }

    return Object.fromEntries(entries);
  }
}

export { ProductLookupSourceRegistry };
