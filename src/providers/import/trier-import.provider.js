import { ImportProviderContract } from "../../contracts/import-provider.contract.js";
import { TrierService } from "../../services/trier.service.js";
import { TrierImportAdapter } from "../../adapters/trier-import.adapter.js";
class TrierImportProvider extends ImportProviderContract {
  constructor({ service, adapter } = {}) {
    super();
    this.service = service || new TrierService();
    this.adapter = adapter || new TrierImportAdapter();
  }

  getSourceName() {
    return "trier";
  }

  normalizeFilters(filters = {}) {
    return {
      ...filters,
      quantidadeRegistros: this.service.normalizePageSize(filters.quantidadeRegistros, 999),
    };
  }

  getInitialState(filters = {}) {
    return {
      primeiroRegistro: Number.parseInt(filters.primeiroRegistro, 10) || 0,
      quantidadeRegistros: this.service.normalizePageSize(filters.quantidadeRegistros, 999),
    };
  }

  describePendingFilters(filters = {}) {
    return {
      codigo: filters.codigo || null,
      codigoBarras: filters.codigoBarras || null,
      nomeProduto: filters.nomeProduto || null,
      primeiroRegistro: filters.primeiroRegistro || 0,
      quantidadeRegistros: filters.quantidadeRegistros,
      ativo: filters.ativo ?? null,
      integracaoEcommerce: filters.integracaoEcommerce ?? null,
      processaCustoMedio: filters.processaCustoMedio ?? false,
    };
  }

  describeProcessingStart(state = {}) {
    return {
      quantidade_registros: state.quantidadeRegistros,
      primeiro_registro: state.primeiroRegistro,
    };
  }

  describePageRequest(state = {}, filters = {}) {
    return {
      primeiro_registro: state.primeiroRegistro,
      quantidade_registros: state.quantidadeRegistros,
      ativo: filters.ativo ?? null,
      integracao_ecommerce: filters.integracaoEcommerce ?? null,
      processa_custo_medio: filters.processaCustoMedio ?? false,
    };
  }

  async fetchPage(state = {}, filters = {}, credentials = {}) {
    const result = await this.service.buscarProdutos({
      ...filters,
      primeiroRegistro: state.primeiroRegistro,
      quantidadeRegistros: state.quantidadeRegistros,
    }, credentials);

    const batch = this.adapter.normalizeBatch(result.items || []);

    return {
      raw: result.raw,
      items: batch,
      endpoint: result.endpoint,
      total: batch.length,
      hasMore: batch.length === state.quantidadeRegistros,
      nextState: {
        ...state,
        primeiroRegistro: state.primeiroRegistro + batch.length,
      },
    };
  }
}

export { TrierImportProvider };