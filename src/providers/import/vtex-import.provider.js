import { ImportProviderContract } from "../../contracts/import-provider.contract.js";
import { VtexService } from "../../services/vtex.service.js";
import { VtexImportAdapter } from "../../adapters/vtex-import.adapter.js";

class VtexImportProvider extends ImportProviderContract {
  constructor({ service, adapter } = {}) {
    super();
    this.service = service || new VtexService();
    this.adapter = adapter || new VtexImportAdapter();
  }

  getSourceName() {
    return "vtex";
  }

  normalizeFilters(filters = {}) {
    const top = this.service.normalizePageSize(filters.top, 100);
    const from = this.service.normalizeFrom(filters.from);

    return {
      ...filters,
      top,
      from,
      to: this.service.normalizeTo(filters.to, from, top),
      categoryId: filters.categoryId || null,
    };
  }

  getInitialState(filters = {}) {
    return {
      top: filters.top,
      from: filters.from,
      to: filters.to,
    };
  }

  describePendingFilters(filters = {}) {
    return {
      from: filters.from,
      to: filters.to,
      top: filters.top,
      categoryId: filters.categoryId,
    };
  }

  describeProcessingStart(state = {}, filters = {}) {
    return {
      from: state.from,
      to: state.to,
      top: state.top,
      categoryId: filters.categoryId,
    };
  }

  describePageRequest(state = {}, filters = {}) {
    return {
      from: state.from,
      to: state.to,
      top: state.top,
      categoryId: filters.categoryId,
    };
  }

  async fetchPage(state = {}, filters = {}, credentials = {}) {
    const result = await this.service.buscarProdutos({
      from: state.from,
      to: state.to,
      top: state.top,
      categoryId: filters.categoryId,
    }, credentials);

    const batch = this.adapter.normalizeBatch(result.items || []);
    const total = Number.isInteger(result.total) ? result.total : batch.length;
    const nextFrom = state.to + 1;
    const nextTo = nextFrom + state.top - 1;

    return {
      raw: result.raw,
      items: batch,
      endpoint: result.endpoint,
      total,
      hasMore: state.to < total,
      nextState: {
        ...state,
        from: nextFrom,
        to: nextTo,
      },
    };
  }
}

export { VtexImportProvider };
