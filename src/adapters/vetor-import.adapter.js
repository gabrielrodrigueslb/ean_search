import { BaseImportAdapter } from "./base-import.adapter.js";
function pickFirst(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }

  return null;
}

class VetorImportAdapter extends BaseImportAdapter {
  constructor() {
    super("vetor");
  }

  normalizeItem(item) {
    const nomeVetor = pickFirst(item.descricaoUsual, item.descricao);

    return {
      ean: pickFirst(item.codigoBarras),
      nome_recebido: nomeVetor,
      dados_brutos: {
        codigo: item.cdProduto ?? null,
        codigo_barras: pickFirst(item.codigoBarras),
        nome_vetor: nomeVetor,
        nome_produto_vetor: nomeVetor,
        nome_exibicao_vetor: nomeVetor,
        descricao: pickFirst(item.descricao, item.descricaoUsual),
        categoria: pickFirst(item.nomeCategoria),
        departamento: pickFirst(item.nomeDepartamento),
        grupo: pickFirst(item.nomeLinha),
        laboratorio: pickFirst(item.nomeFabricante, item.nomeMarca),
        quantidade: item.qtdEstoque ?? null,
        registro_ms: null,
        tarja: pickFirst(item.tipoReceita, item.corReceita),
        origem_nome: "vetor",
        origem_dados: "vetor",
        payload_vetor: item,
      },
      fonte: "vetor",
    };
  }

  normalizeBatch(items) {
    return items
      .map((item) => this.normalizeItem(item))
      .filter((item) => item.ean);
  }
}

export { VetorImportAdapter };
