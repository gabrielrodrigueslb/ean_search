import { BaseImportAdapter } from "./base-import.adapter.js";

function findSpecificationValue(specifications = [], fieldNames = []) {
  if (!Array.isArray(specifications)) {
    return null;
  }

  const normalizedFieldNames = fieldNames.map((name) => String(name).trim().toLowerCase());

  for (const specification of specifications) {
    const fieldName = String(specification?.FieldName || "").trim().toLowerCase();
    if (!normalizedFieldNames.includes(fieldName)) {
      continue;
    }

    const fieldValues = Array.isArray(specification?.FieldValues)
      ? specification.FieldValues
      : [];

    const firstValue = fieldValues.find((value) => String(value || "").trim() !== "");
    if (firstValue) {
      return String(firstValue).trim();
    }
  }

  return null;
}

function pickDeepValue(item, path = []) {
  return path.reduce((current, key) => current?.[key], item);
}

class VtexImportAdapter extends BaseImportAdapter {
  constructor() {
    super("vtex");
  }

  normalizeItem(item = {}) {
    const nomeVtex = this.pickFirst(
      item.NameComplete,
      item.ProductName,
      item.SkuName,
      item.ProductDescription,
    );

    const ean = this.pickFirst(
      pickDeepValue(item, ["AlternateIds", "Ean"]),
      Array.isArray(item.AlternateIdValues) ? item.AlternateIdValues[0] : null,
    );

    const categoria = this.pickFirst(
      Object.values(item.ProductCategories || {}).slice(-1)[0],
      Array.isArray(item.Categories) ? item.Categories.slice(-1)[0] : null,
    );

    const registroMs = this.pickFirst(
      findSpecificationValue(item.ProductSpecifications, ["Código MS", "Codigo MS", "RMS"]),
    );

    const principioAtivo = this.pickFirst(
      findSpecificationValue(item.ProductSpecifications, ["Princípio Ativo", "Principio Ativo"]),
    );

    return {
      ean,
      nome_recebido: nomeVtex,
      dados_brutos: {
        skuId: item.Id ?? item._metadata?.skuId ?? null,
        productId: item.ProductId ?? item._metadata?.productId ?? null,
        refId: this.pickFirst(
          pickDeepValue(item, ["AlternateIds", "RefId"]),
          item.ProductRefId,
        ),
        ean,
        nome: nomeVtex,
        nome_produto: this.pickFirst(item.ProductName, nomeVtex),
        nome_exibicao: this.pickFirst(item.NameComplete, nomeVtex),
        descricao: this.pickFirst(item.ProductDescription, nomeVtex),
        categoria,
        laboratorio: this.pickFirst(item.BrandName),
        marca: this.pickFirst(item.BrandName),
        registro_ms: registroMs,
        principio_ativo_informado: principioAtivo,
        image_url: this.pickFirst(item.ImageUrl),
        sales_channels: Array.isArray(item.SalesChannels) ? item.SalesChannels : [],
        origem_nome: "vtex",
        origem_dados: "vtex",
        payload_vtex: item,
      },
      fonte: "vtex",
    };
  }

  normalizeBatch(items = []) {
    return items
      .map((item) => this.normalizeItem(item))
      .filter((item) => item.ean);
  }
}

export { VtexImportAdapter };
