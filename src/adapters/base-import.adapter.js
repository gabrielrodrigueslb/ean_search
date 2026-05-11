class BaseImportAdapter {
  constructor(source) {
    this.source = source;
  }

  pickFirst(...values) {
    for (const value of values) {
      if (value === undefined || value === null) {
        continue;
      }

      const normalized = String(value).trim();
      if (!normalized || normalized.toUpperCase() === "NULL") {
        continue;
      }

      return normalized;
    }

    return null;
  }

  async parse() {
    throw new Error("parse() deve ser implementado pelo adapter.");
  }

  normalizeItem(item) {
    return {
      ean: this.pickFirst(item.ean, item.codigo_barras, item.codigobarras, item.codigo),
      nome_recebido: this.pickFirst(item.nome_recebido, item.nome, item.description, item.descricao),
      dados_brutos: item,
      fonte: this.source,
    };
  }
}

export { BaseImportAdapter };
