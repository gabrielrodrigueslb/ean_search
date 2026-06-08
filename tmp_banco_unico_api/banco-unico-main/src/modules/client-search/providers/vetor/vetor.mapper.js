function mapVetorProduct(item) {
  const estoque = Number(item?.qtdEstoque ?? item?.estoque ?? item?.saldo_estoque ?? 0);
  const preco = item?.vlrTabela != null
    ? Number(item.vlrTabela)
    : (item?.preco != null ? Number(item.preco) : null);
  const precoPromocional = item?.vlrOferta != null
    ? Number(item.vlrOferta)
    : (item?.precoPromocional != null
      ? Number(item.precoPromocional)
      : (item?.preco_promocional != null ? Number(item.preco_promocional) : null));
  const descontoPercentual = item?.percDesconto != null
    ? Number(item.percDesconto)
    : (item?.descontoPercentual != null ? Number(item.descontoPercentual) : null);

  return {
    source: "vetor",
    id: item?.id || item?.cdProduto || item?.produtoid || null,
    codigo: item?.cdProduto || item?.codigo || null,
    cdfilial: item?.cdFilial ?? item?.cdfilial ?? null,
    ean: item?.codigoBarras || item?.ean || item?.codigo_barras || item?.codigobarras || null,
    descricao: item?.descricao || item?.descricaoUsual || item?.nome || item?.descricaoProduto || null,
    descricaoUsual: item?.descricaoUsual || null,
    fabricante: item?.nomeFabricante || null,
    classificacaoOrigem: item?.generico === true
      ? "GENERICOS"
      : (item?.similar === true ? "SIMILARES" : (item?.etico === true ? "ETICOS" : null)),
    tipoClassificacao: item?.generico === true
      ? "GENERICO"
      : (item?.similar === true ? "SIMILAR" : (item?.etico === true ? "REFERENCIA" : null)),
    estoque,
    preco,
    precoPromocional,
    descontoPercentual,
    disponivel: estoque > 0,
  };
}

module.exports = {
  mapVetorProduct,
};
