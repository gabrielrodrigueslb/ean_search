function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapAlpha7Product(item) {
  const preco = toFiniteNumber(item?.valorVenda ?? item?.preco ?? item?.vlrTabela);
  const melhorDesconto = toFiniteNumber(
    item?.melhorDesconto ?? item?.precoPromocional ?? item?.vlrOferta,
  );
  const estoque = toFiniteNumber(item?.estoque ?? item?.qtdEstoque ?? item?.saldo_estoque) ?? 0;
  const precoPromocional = (
    melhorDesconto != null
    && preco != null
    && melhorDesconto > 0
    && melhorDesconto < preco
  )
    ? melhorDesconto
    : null;
  const descontoPercentual = (
    preco != null
    && preco > 0
    && precoPromocional != null
  )
    ? Number((((preco - precoPromocional) / preco) * 100).toFixed(2))
    : null;
  const ean = String(item?.ean ?? item?.codigoBarras ?? item?.codigo_barras ?? "").replace(/\D+/g, "");

  return {
    source: "alpha7",
    id: item?.id || item?.codigo || ean || null,
    codigo: item?.codigo ?? null,
    ean: ean || null,
    descricao: item?.descricao || item?.descricaoProduto || item?.nome || null,
    estoque,
    preco,
    precoPromocional,
    descontoPercentual,
    disponivel: estoque > 0,
  };
}

module.exports = {
  mapAlpha7Product,
};
