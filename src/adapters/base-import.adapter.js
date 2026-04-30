class BaseImportAdapter {
  constructor(source) {
    this.source = source;
  }

  async parse() {
    throw new Error("parse() deve ser implementado pelo adapter.");
  }

  normalizeItem(item) {
    return {
      ean: item.ean || item.codigo_barras || item.codigo || null,
      nome_recebido: item.nome_recebido || item.nome || item.description || null,
      dados_brutos: item,
      fonte: this.source,
    };
  }
}

module.exports = { BaseImportAdapter };
