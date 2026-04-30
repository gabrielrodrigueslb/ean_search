const { ProductService } = require("../services/product.service");

class ProductsController {
  constructor() {
    this.productService = new ProductService();
  }

  search = async (req, res) => {
    const { nome, slug, q, limit } = req.query;

    if (!nome && !slug && !q) {
      return res.status(400).json({
        error: "Informe ao menos um criterio de busca: nome, slug ou q.",
      });
    }

    const result = await this.productService.search({
      nome,
      slug,
      q,
      limit,
    });

    return res.json(result);
  };

  getByEan = async (req, res) => {
    const result = await this.productService.findByEan(req.params.ean);
    if (!result) {
      return res.status(404).json({ error: "Produto nao encontrado para o EAN informado." });
    }

    return res.json(result);
  };
}

module.exports = { ProductsController };
