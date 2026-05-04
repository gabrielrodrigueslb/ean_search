const { BaseImportAdapter } = require("./base-import.adapter");

function pickFirst(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }

  return null;
}

class TrierImportAdapter extends BaseImportAdapter {
  constructor() {
    super("trier");
  }

  normalizeItem(item) {
    const nomeTrier = pickFirst(item.nomeProduto, item.nome);
    const nomeExibicaoTrier = pickFirst(item.nomeEcommerce, item.nomeProduto, item.nome);

    return {
      ean: pickFirst(item.codigoBarras, item.ean, item.gtin),
      nome_recebido: nomeExibicaoTrier,
      dados_brutos: {
        codigo: item.codigo ?? null,
        codigo_barras: pickFirst(item.codigoBarras, item.ean, item.gtin),
        nome_trier: nomeTrier,
        nome_produto_trier: nomeTrier,
        nome_exibicao_trier: nomeExibicaoTrier,
        descricao: pickFirst(item.descricaoEcommerce, item.apresentacao, item.nomeApresentacao),
        categoria: pickFirst(item.nomeCategoria, item.categoria),
        departamento: pickFirst(item.nomeDepartamento, item.departamento),
        grupo: pickFirst(item.nomeGrupo, item.grupo),
        laboratorio: pickFirst(item.nomeFabricante, item.fabricante, item.marca),
        tipo: pickFirst(item.tipoProduto, item.tipo),
        forma_farmaceutica: pickFirst(item.formaFarmaceutica, item.forma),
        quantidade: pickFirst(item.quantidade, item.qtde, item.estoque),
        volume: pickFirst(item.volume),
        registro_ms: pickFirst(item.registroMs, item.registro),
        tarja: pickFirst(item.tarja),
        origem_nome: "trier",
        origem_dados: "trier",
        payload_trier: item,
      },
      fonte: "trier",
    };
  }

  normalizeBatch(items) {
    return items.map((item) => this.normalizeItem(item));
  }
}

module.exports = { TrierImportAdapter };
