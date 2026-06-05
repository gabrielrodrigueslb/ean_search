function firstFiniteNumber(...values) {
  for (const value of values) {
    if (value == null || value === "") {
      continue;
    }

    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function mapTrierProduct(item) {
  const estoque = firstFiniteNumber(
    item?.quantidadeEstoqueEcommerce,
    item?.quantidadeEstoque,
    item?.qtdEstoque,
    item?.estoque,
    item?.saldo_estoque,
    0,
  );
  const preco = firstFiniteNumber(
    item?.valorVendaEcommerce,
    item?.valorVenda,
    item?.preco,
    item?.vlrTabela,
  );
  const precoPromocional = firstFiniteNumber(
    item?.valorVendaPromocional,
    item?.vlrOferta,
    item?.precoPromocional,
    item?.preco_promocional,
  );
  const descontoPercentual = firstFiniteNumber(
    item?.percentualDescontoMax,
    item?.percentualDesconto,
    item?.descontoPercentual,
    item?.percDesconto,
  );

  return {
    source: "trier",
    id: item?.codigo ?? item?.id ?? null,
    codigo: item?.codigo ?? null,
    cdfilial: item?.cdFilial ?? item?.cdfilial ?? null,
    ean: item?.codigoBarras || item?.ean || item?.codigo_barras || item?.codigobarras || null,
    descricao: item?.nome || item?.descricao || item?.descricaoProduto || null,
    descricaoUsual: item?.nomeEcommerce || item?.nome || null,
    fabricante: item?.nomeLaboratorio || item?.nomeFabricante || null,
    classificacaoOrigem: item?.nomeGrupo || item?.nomeCategoria || item?.nomeClassificacao || null,
    tipoClassificacao: item?.tipo?.nome || item?.nomeCategoria || item?.nomeClassificacao || null,
    estoque: estoque ?? 0,
    preco,
    precoPromocional,
    descontoPercentual,
    disponivel: Number(estoque ?? 0) > 0,
  };
}

module.exports = {
  mapTrierProduct,
};
