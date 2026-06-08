import { BancoUnicoClient } from "../integrations/banco-unico.client.js";
class BancoUnicoService {
  normalizeConfig(config = {}) {
    return {
      baseUrl: config.baseUrl || undefined,
      authorization: config.authorization || undefined,
    };
  }

  createClient(config = {}) {
    return new BancoUnicoClient(this.normalizeConfig(config));
  }

  buildSingleProductPayload(product) {
    return {
      descricaoProduto: product.descricaoProduto,
      ean: product.ean,
      ...(product.principioAtivo ? { principioAtivo: product.principioAtivo } : {}),
      ...(product.classificacao ? { classificacao: product.classificacao } : {}),
      ...(product.nomeSocial ? { nomeSocial: product.nomeSocial } : {}),
      ...(product.fabricante ? { fabricante: product.fabricante } : {}),
      ...(product.departamento ? { departamento: product.departamento } : {}),
      ...(product.categoria ? { categoria: product.categoria } : {}),
      ...(product.subcategoria ? { subcategoria: product.subcategoria } : {}),
      ...(product.segmento ? { segmento: product.segmento } : {}),
      ...(product.subsegmento ? { subsegmento: product.subsegmento } : {}),
      ...(product.detalhes ? { detalhes: product.detalhes } : {}),
    };
  }

  buildBatchPayload(products = []) {
    return {
      products: products.map((product) => this.buildSingleProductPayload(product)),
    };
  }

  async publishProduct(product, config = {}) {
    const client = this.createClient(config);
    return client.publishProducts(this.buildSingleProductPayload(product));
  }

  async publishProducts(products, config = {}) {
    const client = this.createClient(config);
    return client.publishProducts(this.buildBatchPayload(products));
  }

  async searchProductsByEans(eans = [], config = {}) {
    const client = this.createClient(config);
    return client.searchProductsByEans(eans);
  }
}

export { BancoUnicoService };
