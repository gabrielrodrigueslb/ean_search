class ImportProviderRegistry {
  constructor(providers = []) {
    this.providers = new Map();

    for (const provider of providers) {
      this.register(provider);
    }
  }

  register(provider) {
    this.providers.set(provider.getSourceName(), provider);
    return this;
  }

  get(sourceName) {
    const provider = this.providers.get(sourceName);
    if (!provider) {
      throw new Error(`Import provider nao registrado para fonte: ${sourceName}`);
    }

    return provider;
  }
}

export { ImportProviderRegistry };