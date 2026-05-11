class PostgresEmbalagemImportAdapter {
  normalizeItem(row = {}) {
    const ean = typeof row.ean === "string" ? row.ean.trim() : String(row.ean || "").trim();
    const nome = typeof row.nome === "string" ? row.nome.trim() : String(row.nome || "").trim();

    return {
      ean,
      nome_recebido: nome || null,
      dados_brutos: {
        ean,
        nome,
        nome_produto: nome,
        nome_exibicao: nome,
        origem_nome: "cliente_postgres",
        origem_dados: "cliente_postgres",
      },
      fonte: "cliente_postgres",
    };
  }

  normalizeBatch(rows = []) {
    return rows
      .map((row) => this.normalizeItem(row))
      .filter((item) => item.ean && item.nome_recebido);
  }
}

export { PostgresEmbalagemImportAdapter };
