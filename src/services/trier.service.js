import { TrierClient } from "../integrations/trier.client.js";
class TrierService {
  normalizePageSize(value, fallback = 999) {
    const parsed = Number.parseInt(value, 10);

    if (!Number.isInteger(parsed) || parsed <= 0) {
      return fallback;
    }

    return Math.min(parsed, 999);
  }

  shouldUseObterTodos(filters = {}) {
    return !filters.codigo
      && !filters.codigoBarras
      && !filters.nomeProduto
      && filters.ativo === undefined
      && filters.integracaoEcommerce === undefined;
  }

  async buscarProdutos(filters, credentials) {
    const client = new TrierClient(credentials);
    const quantidadeRegistros = this.normalizePageSize(filters.quantidadeRegistros, 999);
    const primeiroRegistro = Number.parseInt(filters.primeiroRegistro, 10) || 0;
    const useObterTodos = this.shouldUseObterTodos(filters);
    const pathname = useObterTodos
      ? "/rest/integracao/produto/obter-todos-v1"
      : "/rest/integracao/produto/obter-v1";

    const params = {
      primeiroRegistro,
      quantidadeRegistros,
      processaCustoMedio: filters.processaCustoMedio !== undefined
        ? Boolean(filters.processaCustoMedio)
        : false,
      ...(filters.codigo ? { codigo: filters.codigo } : {}),
      ...(filters.codigoBarras ? { codigoBarras: filters.codigoBarras } : {}),
      ...(filters.nomeProduto ? { nomeProduto: filters.nomeProduto } : {}),
      ...(filters.ativo !== undefined ? { ativo: filters.ativo } : {}),
      ...(filters.integracaoEcommerce !== undefined
        ? { integracaoEcommerce: filters.integracaoEcommerce }
        : {}),
    };

    const data = await client.get(pathname, params);

    const items = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];

    return {
      raw: data,
      items,
      endpoint: pathname,
    };
  }
}

export { TrierService };