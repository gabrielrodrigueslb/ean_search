import { PostgresEmbalagemImportAdapter } from "../../adapters/postgres-embalagem-import.adapter.js";
import { ImportProviderContract } from "../../contracts/import-provider.contract.js";
import { ClientPostgresClient } from "../../integrations/client-postgres.client.js";

class PostgresEmbalagemImportProvider extends ImportProviderContract {
  constructor({ client, adapter } = {}) {
    super();
    this.client = client || new ClientPostgresClient();
    this.adapter = adapter || new PostgresEmbalagemImportAdapter();
  }

  getSourceName() {
    return "postgres-embalagens";
  }

  normalizeFilters(filters = {}) {
    return {
      ...filters,
      top: Math.max(1, Number.parseInt(filters.top, 10) || 100),
      skip: Math.max(0, Number.parseInt(filters.skip, 10) || 0),
      schema: filters.schema || "public",
    };
  }

  getInitialState(filters = {}) {
    return {
      top: filters.top,
      skip: filters.skip,
    };
  }

  describePendingFilters(filters = {}) {
    return {
      schema: filters.schema,
      top: filters.top,
      skip: filters.skip,
    };
  }

  describeProcessingStart(state = {}, filters = {}) {
    return {
      schema: filters.schema,
      top: state.top,
      skip: state.skip,
    };
  }

  describePageRequest(state = {}, filters = {}) {
    return {
      schema: filters.schema,
      top: state.top,
      skip: state.skip,
    };
  }

  async fetchPage(state = {}, filters = {}, credentials = {}) {
    const result = await this.client.fetchEmbalagens({
      top: state.top,
      skip: state.skip,
    }, {
      ...credentials,
      schema: filters.schema,
    });

    const items = this.adapter.normalizeBatch(result.items || []);

    return {
      raw: result.items,
      items,
      endpoint: result.endpoint,
      total: result.total,
      hasMore: state.skip + items.length < result.total,
      nextState: {
        ...state,
        skip: state.skip + items.length,
      },
    };
  }
}

export { PostgresEmbalagemImportProvider };
