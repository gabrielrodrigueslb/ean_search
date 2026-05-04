const { VetorClient } = require("../integrations/vetor.client");

const DEFAULT_SELECT = [
  "cdFilial",
  "cdProduto",
  "descricao",
  "descricaoUsual",
  "codigoBarras",
  "inativo",
  "cdMarca",
  "nomeMarca",
  "cdFabricante",
  "nomeFabricante",
  "cdLinha",
  "nomeLinha",
  "cdCategoria",
  "nomeCategoria",
  "qtdEstoque",
  "vlrTabela",
  "percDesconto",
  "vlrOferta",
  "dtCadastro",
  "dtUltimaAlteracao",
  "nsuRegistro",
  "controleSngpc",
  "cdDepartamento",
  "nomeDepartamento",
  "controlado",
  "antimicrobiano",
  "etico",
  "generico",
  "similar",
  "tipoReceituario",
  "tipoReceita",
  "corReceita",
].join(",");

class VetorService {
  normalizePageSize(value, fallback = 100) {
    const parsed = Number.parseInt(value, 10);

    if (!Number.isInteger(parsed) || parsed <= 0) {
      return fallback;
    }

    return Math.min(parsed, 500);
  }

  normalizeSkip(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
  }

  async buscarProdutos(filters = {}, credentials) {
    const client = new VetorClient(credentials);
    const top = this.normalizePageSize(filters.top, 100);
    const skip = this.normalizeSkip(filters.skip);

    const params = {
      $top: top,
      $skip: skip,
      $count: filters.count !== undefined ? Boolean(filters.count) : false,
      ...(filters.filter ? { $filter: filters.filter } : {}),
      $select: filters.select || DEFAULT_SELECT,
      ...(filters.orderby ? { $orderby: filters.orderby } : {}),
    };

    const data = await client.get("/api/ecommerce/produtos/consulta", params);
    const items = Array.isArray(data?.data) ? data.data : [];

    return {
      raw: data,
      items,
      total: Number.isInteger(data?.total) ? data.total : null,
      endpoint: "/api/ecommerce/produtos/consulta",
    };
  }
}

module.exports = { VetorService, DEFAULT_SELECT };
