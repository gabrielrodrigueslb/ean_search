const { ProdutoRepository } = require("../repositories/produto.repository");
const { normalizeText } = require("../utils/normalizeText");
const { classifyProductType } = require("../utils/classifyProductType");

function pickFirstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function isTrustedNameSource(source) {
  return source === "pt_product_search"
    || source === "farmaindex"
    || source === "barcode_lookup"
    || source === "pt_product_search_browser"
    || source === "barcode_lookup_browser";
}

class ProductService {
  constructor() {
    this.produtoRepository = new ProdutoRepository();
  }

  buildSnapshot(item) {
    const raw = item.dados_brutos || item;
    const trustedNameSource = isTrustedNameSource(raw.origem_nome);
    const nomeProduto = pickFirstString(
      trustedNameSource ? raw.nome_produto : null,
      trustedNameSource ? raw.produto : null,
      trustedNameSource ? raw.nome : null,
      trustedNameSource ? item.nome_recebido : null,
    );

    if (!nomeProduto) {
      const error = new Error("Nome do produto nao foi validado por PT.ProductSearch, FarmaIndex, BarcodeLookup ou browser fallback.");
      error.status = 400;
      throw error;
    }

    const nomeExibicao = pickFirstString(
      trustedNameSource ? raw.nome_exibicao : null,
      trustedNameSource ? raw.nome_venda : null,
      trustedNameSource ? raw.display_name : null,
      trustedNameSource ? item.nome_recebido : null,
      nomeProduto,
    );

    return {
      ean: String(item.ean),
      produto: {
        nome: nomeProduto,
        nome_normalizado: normalizeText(nomeProduto),
        tipo: classifyProductType({ raw }),
        categoria: pickFirstString(raw.categoria, raw.departamento, raw.grupo),
        laboratorio: pickFirstString(raw.laboratorio, raw.fabricante, raw.marca),
        origem_nome: pickFirstString(raw.origem_nome, item.fonte) || "importacao",
      },
      apresentacao: {
        nome_exibicao: nomeExibicao,
        descricao: pickFirstString(raw.descricao, raw.apresentacao, raw.nome_apresentacao),
        dose: pickFirstString(raw.dose),
        unidade: pickFirstString(raw.unidade),
        forma_farmaceutica: pickFirstString(raw.forma_farmaceutica, raw.forma),
        via_administracao: pickFirstString(raw.via_administracao),
        quantidade: pickFirstString(raw.quantidade),
        volume: pickFirstString(raw.volume),
        registro_ms: pickFirstString(raw.registro_ms, raw.registro),
        tarja: pickFirstString(raw.tarja),
        origem_dados: pickFirstString(raw.origem_dados, item.fonte) || "importacao",
      },
      farmacos: Array.isArray(raw.farmacos) ? raw.farmacos : [],
    };
  }

  async upsertImportedItem(item) {
    const snapshot = this.buildSnapshot(item);
    const existing = await this.produtoRepository.findByEan(snapshot.ean);

    if (existing) {
      await this.produtoRepository.updateProduto(
        existing.produto.id,
        this.onlyDefined(snapshot.produto),
      );

      await this.produtoRepository.updateApresentacao(
        existing.id,
        this.onlyDefined(snapshot.apresentacao),
      );

      await this.attachFarmacos(existing.produto.id, snapshot.farmacos);

      return {
        action: "updated",
        produto_id: existing.produto.id,
        apresentacao_id: existing.id,
      };
    }

    let produto = await this.produtoRepository.findProdutoByNormalizedName(
      snapshot.produto.nome_normalizado,
      snapshot.produto.tipo,
    );
    const reused = Boolean(produto);

    if (!produto) {
      produto = await this.produtoRepository.createProduto(snapshot.produto);
    } else {
      await this.produtoRepository.updateProduto(
        produto.id,
        this.onlyDefined(snapshot.produto),
      );
    }

    const apresentacao = await this.produtoRepository.createApresentacao({
      produto_id: produto.id,
      ean: snapshot.ean,
      ...snapshot.apresentacao,
    });

    await this.attachFarmacos(produto.id, snapshot.farmacos);

    return {
      action: reused ? "attached" : "created",
      produto_id: produto.id,
      apresentacao_id: apresentacao.id,
    };
  }

  onlyDefined(data) {
    return Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined && value !== null && value !== ""),
    );
  }

  async attachFarmacos(produtoId, farmacos) {
    if (!Array.isArray(farmacos) || !farmacos.length) {
      return;
    }

    for (const farmaco of farmacos) {
      if (!farmaco?.nome_normalizado || !farmaco?.nome) {
        continue;
      }

      const saved = await this.produtoRepository.upsertFarmaco({
        nome: farmaco.nome,
        nome_normalizado: farmaco.nome_normalizado,
        slug: farmaco.slug || null,
      });

      await this.produtoRepository.attachFarmaco(produtoId, saved.id);
    }
  }
}

module.exports = { ProductService };
