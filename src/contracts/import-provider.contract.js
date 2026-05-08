class ImportProviderContract {
  getSourceName() {
    throw new Error("ImportProviderContract#getSourceName precisa ser implementado.");
  }

  normalizeFilters(_filters = {}) {
    throw new Error("ImportProviderContract#normalizeFilters precisa ser implementado.");
  }

  getInitialState(_filters = {}) {
    throw new Error("ImportProviderContract#getInitialState precisa ser implementado.");
  }

  describePendingFilters(_filters = {}) {
    throw new Error("ImportProviderContract#describePendingFilters precisa ser implementado.");
  }

  describeProcessingStart(_state = {}, _filters = {}) {
    throw new Error("ImportProviderContract#describeProcessingStart precisa ser implementado.");
  }

  describePageRequest(_state = {}, _filters = {}) {
    throw new Error("ImportProviderContract#describePageRequest precisa ser implementado.");
  }

  async fetchPage(_state = {}, _filters = {}, _credentials = {}) {
    throw new Error("ImportProviderContract#fetchPage precisa ser implementado.");
  }
}

export { ImportProviderContract };