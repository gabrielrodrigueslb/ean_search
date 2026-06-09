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

  splitIngredients(value) {
    return String(value || "")
      .split(/[,;/]| e /i)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  normalizeItem(item) {
    const ingredienteAtivo = this.pickFirst(
      item.ingrediente_ativo,
      item.principio_ativo,
      item["principio ativo"],
      item["princípio ativo"],
      item.principioAtivo,
      item.active_ingredient,
      item.activeIngredient,
      item.farmaco,
      item.farmacos,
    );

    return {
      ean: this.pickFirst(item.ean, item.codigo_barras, item.codigobarras, item.codigo),
      nome_recebido: this.pickFirst(item.nome_recebido, item.nome, item.description, item.descricao),
      dados_brutos: {
        ...item,
        ingrediente_ativo: ingredienteAtivo,
        farmacos: ingredienteAtivo
          ? this.splitIngredients(ingredienteAtivo).map((nome) => ({
            nome,
            farmaco: nome,
          }))
          : undefined,
      },
      fonte: this.source,
    };
  }
}

export { BaseImportAdapter };
