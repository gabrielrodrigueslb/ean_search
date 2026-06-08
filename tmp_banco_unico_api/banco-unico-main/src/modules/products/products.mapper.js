function mapActiveIngredient(activeIngredient) {
  if (typeof activeIngredient !== "string") {
    return activeIngredient;
  }

  const items = activeIngredient
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (items.length <= 1) {
    return activeIngredient;
  }

  return items;
}

function mapProductRow(row) {
  return {
    id: row.id,
    ean: row.ean,
    descricaoProduto: row.description,
    principioAtivo: mapActiveIngredient(row.activeIngredient),
    classificacao: row.classification,
    nomeSocial: row.socialName,
    fabricante: row.manufacturer,
    detalhes: row.details,
    tokenCount: row.tokenCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

module.exports = {
  mapActiveIngredient,
  mapProductRow,
};
