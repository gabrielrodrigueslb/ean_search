import { ProductLookupSourceContract } from "../../contracts/product-lookup-source.contract.js";
import { FarmaIndexClient } from "../../integrations/farmaindex.client.js";
class FarmaIndexLookupSource extends ProductLookupSourceContract {
  constructor({ client } = {}) {
    super();
    this.client = client || new FarmaIndexClient();
  }

  getSourceKey() {
    return "farmaindex";
  }

  async lookupByEan(ean) {
    try {
      const result = await this.client.buscarPorEan(ean);
      const detail = result
        ? await this.client.buscarDetalhe({
          slug: result.slug,
          medicamentoid: result.medicamentoid,
        })
        : null;

      return {
        key: this.getSourceKey(),
        result,
        detail,
        error: null,
      };
    } catch (error) {
      return {
        key: this.getSourceKey(),
        result: null,
        detail: null,
        error: error.message,
      };
    }
  }
}

export { FarmaIndexLookupSource };