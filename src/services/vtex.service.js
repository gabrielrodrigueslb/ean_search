import { VtexClient } from "../integrations/vtex.client.js";

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 250;
const DETAIL_CONCURRENCY = 10;

function normalizePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function mapWithConcurrency(items, concurrency, iteratee) {
  if (!Array.isArray(items) || !items.length) {
    return [];
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array(items.length);
  let index = 0;

  const worker = async () => {
    while (true) {
      const currentIndex = index;
      index += 1;

      if (currentIndex >= items.length) {
        return;
      }

      results[currentIndex] = await iteratee(items[currentIndex], currentIndex);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

class VtexService {
  normalizePageSize(value, fallback = DEFAULT_PAGE_SIZE) {
    return Math.min(normalizePositiveInt(value, fallback), MAX_PAGE_SIZE);
  }

  normalizeFrom(value) {
    return normalizePositiveInt(value, 1);
  }

  normalizeTo(value, from, top) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed >= from) {
      return parsed;
    }

    return from + top - 1;
  }

  extractPairs(data = {}) {
    const entries = Object.entries(data || {});

    return entries.flatMap(([productId, skuIds]) => {
      const normalizedProductId = Number.parseInt(productId, 10);
      const validSkuIds = Array.isArray(skuIds) ? skuIds : [];

      return validSkuIds
        .map((skuId) => ({
          productId: Number.isInteger(normalizedProductId) ? normalizedProductId : productId,
          skuId: Number.parseInt(skuId, 10) || skuId,
        }))
        .filter((pair) => pair.skuId);
    });
  }

  async buscarProdutos(filters = {}, credentials = {}) {
    const client = new VtexClient(credentials);
    const top = this.normalizePageSize(filters.top, DEFAULT_PAGE_SIZE);
    const from = this.normalizeFrom(filters.from);
    const to = this.normalizeTo(filters.to, from, top);
    const categoryId = filters.categoryId || null;

    const raw = await client.fetchProductAndSkuIds({ from, to, categoryId });
    const pairs = this.extractPairs(raw?.data);
    const items = await mapWithConcurrency(pairs, DETAIL_CONCURRENCY, async (pair) => {
      const detail = await client.fetchSkuById(pair.skuId);
      return {
        ...detail,
        _metadata: {
          productId: pair.productId,
          skuId: pair.skuId,
        },
      };
    });

    return {
      raw,
      items,
      total: Number.parseInt(raw?.range?.total, 10) || items.length,
      range: raw?.range || null,
      endpoint: "/api/catalog_system/pvt/products/GetProductAndSkuIds",
    };
  }
}

export { VtexService, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, DETAIL_CONCURRENCY };
