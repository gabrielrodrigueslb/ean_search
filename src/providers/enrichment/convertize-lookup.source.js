import { ProductLookupSourceContract } from "../../contracts/product-lookup-source.contract.js";
import { ConvertizeClient } from "../../integrations/convertize.client.js";
class ConvertizeLookupSource extends ProductLookupSourceContract {
  constructor({ client } = {}) {
    super();
    this.client = client || new ConvertizeClient();
  }

  getSourceKey() {
    return "convertize";
  }

  async lookupByEan(ean) {
    try {
      return {
        key: this.getSourceKey(),
        result: await this.client.buscarPorEan(ean),
        detail: null,
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

export { ConvertizeLookupSource };