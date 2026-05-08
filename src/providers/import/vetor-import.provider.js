import { ImportProviderContract } from "../../contracts/import-provider.contract.js";
import { VetorService } from "../../services/vetor.service.js";
import { VetorImportAdapter } from "../../adapters/vetor-import.adapter.js";
class VetorImportProvider extends ImportProviderContract {
  constructor({ service, adapter } = {}) {
    super();
    this.service = service || new VetorService();
    this.adapter = adapter || new VetorImportAdapter();
  }

  getSourceName() {
    return "vetor";
  }

  normalizeFilters(filters = {}) {
    return {
      ...filters,
      top: this.service.normalizePageSize(filters.top, 100),
      skip: this.service.normalizeSkip(filters.skip),
    };
  }

  getInitialState(filters = {}) {
    return {
      top: this.service.normalizePageSize(filters.top, 500),
      skip: this.service.normalizeSkip(filters.skip),
    };
  }

  describePendingFilters(filters = {}) {
    return {
      filter: filters.filter || null,
      select: filters.select || "default",
      orderby: filters.orderby || null,
      skip: filters.skip || 0,
      top: filters.top,
      count: filters.count ?? false,
    };
  }

  describeProcessingStart(state = {}, filters = {}) {
    return {
      top: state.top,
      skip: state.skip,
      filter: filters.filter || null,
    };
  }

  describePageRequest(state = {}, filters = {}) {
    return {
      skip: state.skip,
      top: state.top,
      filter: filters.filter || null,
    };
  }

  async fetchPage(state = {}, filters = {}, credentials = {}) {
    const result = await this.service.buscarProdutos({
      ...filters,
      skip: state.skip,
      top: state.top,
    }, credentials);

    const batch = this.adapter.normalizeBatch(result.items || []);

    return {
      raw: result.raw,
      items: batch,
      endpoint: result.endpoint,
      total: result.total,
      hasMore: batch.length === state.top,
      nextState: {
        ...state,
        skip: state.skip + batch.length,
      },
    };
  }
}

export { VetorImportProvider };