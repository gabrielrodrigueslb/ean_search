function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeEan(value) {
  const digitsOnly = String(value || "").replace(/\D+/g, "");
  return digitsOnly || null;
}

function formatEstoque(value) {
  const estoque = Number(value ?? 0);
  return Number.isFinite(estoque) ? estoque.toFixed(4) : "0.0000";
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== null && item !== undefined),
  );
}

function buildPrecos(clientProduct) {
  const precoSemDesconto = clientProduct?.preco ?? null;
  const precoComDesconto = clientProduct?.precoPromocional ?? null;
  const precoVenda = precoComDesconto ?? precoSemDesconto;
  const hasPrecoData = precoVenda != null || precoSemDesconto != null || precoComDesconto != null;

  if (!hasPrecoData) {
    return {};
  }

  return compactObject({
    preco_venda: precoVenda,
    tem_oferta_ativa: precoComDesconto != null,
    preco_sem_desconto: precoSemDesconto,
    preco_com_desconto: precoComDesconto,
    desconto_percentual: clientProduct?.descontoPercentual ?? null,
  });
}

function calculateBancoUnicoRankingScore(product) {
  const similarity = toFiniteNumber(product?.similarity);
  const tokenOverlap = toFiniteNumber(product?.tokenOverlap);
  const exactEanMatch = product?.exactEanMatch === true ? 1 : 0;

  return Number(((similarity * 10) + tokenOverlap + exactEanMatch).toFixed(3));
}

function sortMergedProducts(products) {
  return products.sort((left, right) => {
    const priceLeft = Number(left?.precos?.preco_venda ?? Number.POSITIVE_INFINITY);
    const priceRight = Number(right?.precos?.preco_venda ?? Number.POSITIVE_INFINITY);
    const similarityLeft = toFiniteNumber(left?.match_banco_unico?.similarity);
    const similarityRight = toFiniteNumber(right?.match_banco_unico?.similarity);
    const scoreLeft = toFiniteNumber(left?.relevancia_score);
    const scoreRight = toFiniteNumber(right?.relevancia_score);

    return scoreRight - scoreLeft
      || similarityRight - similarityLeft
      || priceLeft - priceRight
      || String(left?.descricao || "").localeCompare(String(right?.descricao || ""));
  });
}

function mergeClientSearchResults(bancoUnicoProducts, clientProducts, providerDefinition) {
  const clientProductsByEan = new Map();
  const diagnostics = {
    clientProductsReceived: Array.isArray(clientProducts) ? clientProducts.length : 0,
    clientProductsWithValidEan: 0,
    bancoUnicoProductsReceived: Array.isArray(bancoUnicoProducts) ? bancoUnicoProducts.length : 0,
    bancoUnicoProductsWithValidEan: 0,
    missingClientMatch: 0,
    matchedByEan: 0,
    filteredByLowStock: 0,
    mergedProducts: 0,
  };

  for (const product of Array.isArray(clientProducts) ? clientProducts : []) {
    const normalizedEan = normalizeEan(product?.ean);

    if (!normalizedEan || clientProductsByEan.has(normalizedEan)) {
      continue;
    }

    diagnostics.clientProductsWithValidEan += 1;
    clientProductsByEan.set(normalizedEan, product);
  }

  const mergedProducts = [];

  for (const bancoUnicoProduct of Array.isArray(bancoUnicoProducts) ? bancoUnicoProducts : []) {
    const normalizedEan = normalizeEan(bancoUnicoProduct?.ean);

    if (!normalizedEan) {
      continue;
    }

    diagnostics.bancoUnicoProductsWithValidEan += 1;

    const clientProduct = clientProductsByEan.get(normalizedEan);

    if (!clientProduct) {
      diagnostics.missingClientMatch += 1;
      continue;
    }

    diagnostics.matchedByEan += 1;

    if (Number(clientProduct?.estoque ?? 0) < Number(providerDefinition?.minAvailableStock ?? 0)) {
      diagnostics.filteredByLowStock += 1;
      continue;
    }

    const precos = buildPrecos(clientProduct);

    mergedProducts.push({
      id: String(clientProduct?.id ?? ""),
      provider: providerDefinition?.key || null,
      providerDisplayName: providerDefinition?.displayName || null,
      codigo: clientProduct?.codigo ?? null,
      codigo_barras: normalizedEan,
      descricao: bancoUnicoProduct?.descricaoProduto || null,
      descricao_provider: clientProduct?.descricao || null,
      principio_ativo: bancoUnicoProduct?.principioAtivo || null,
      tipo_classificacao: clientProduct?.tipoClassificacao || null,
      classificacao_nome_origem: clientProduct?.classificacaoOrigem || null,
      estoque_disponivel: formatEstoque(clientProduct?.estoque),
      relevancia_score: calculateBancoUnicoRankingScore(bancoUnicoProduct),
      relacionado_busca: true,
      origem_busca: "catalogo_externo_ean",
      match_banco_unico: {
        id: bancoUnicoProduct?.id || null,
        ean: normalizedEan,
        descricao_produto: bancoUnicoProduct?.descricaoProduto || null,
        principio_ativo: bancoUnicoProduct?.principioAtivo || null,
        classificacao: bancoUnicoProduct?.classificacao || null,
        nome_social: bancoUnicoProduct?.nomeSocial || null,
        fabricante: bancoUnicoProduct?.fabricante || null,
        similarity: bancoUnicoProduct?.similarity ?? null,
        tokenOverlap: bancoUnicoProduct?.tokenOverlap ?? null,
        exactEanMatch: bancoUnicoProduct?.exactEanMatch === true,
        relevanceScore: bancoUnicoProduct?.relevanceScore ?? null,
        relevanceReason: bancoUnicoProduct?.relevanceReason ?? null,
      },
      ...(Object.keys(precos).length > 0 ? { precos } : {}),
    });
  }

  diagnostics.mergedProducts = mergedProducts.length;

  return {
    products: sortMergedProducts(mergedProducts),
    diagnostics,
  };
}

module.exports = {
  mergeClientSearchResults,
};
