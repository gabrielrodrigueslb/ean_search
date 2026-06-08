const { pool } = require("../../db");
const { noopTraceLogger } = require("../../shared/utils/trace-logger");

const { mapProductRow } = require("./products.mapper");

function chunkArray(items, chunkSize, traceLogger = noopTraceLogger) {
  const chunks = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  traceLogger.step("chunkArrayForUpsert", "Produtos separados em batches para persistencia.", {
    itemCount: items.length,
    chunkSize,
    batchCount: chunks.length,
  });

  return chunks;
}

function buildUpsertProductsQuery(products, options = {}, traceLogger = noopTraceLogger) {
  const { returnRows = true } = options;
  const columnsPerRow = 12;
  const values = [];

  traceLogger.step("buildUpsertProductsQuery", "Montando query de upsert para o batch atual.", {
    batchSize: products.length,
    returnRows,
  });

  const placeholders = products.map((product, rowIndex) => {
    const offset = rowIndex * columnsPerRow;

    values.push(
      product.ean,
      product.description,
      product.activeIngredient,
      product.classification,
      product.socialName,
      product.manufacturer,
      product.details,
      product.searchableText,
      product.normalizedSearchableText,
      product.tokens,
      product.tokenCount,
      product.embedding,
    );

    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}::vector)`;
  });

  const query = `
    INSERT INTO products (
      ean,
      description,
      active_ingredient,
      classification,
      social_name,
      manufacturer,
      details,
      searchable_text,
      normalized_searchable_text,
      tokens,
      token_count,
      embedding
    )
    VALUES ${placeholders.join(",\n")}
    ON CONFLICT (ean)
    DO UPDATE SET
      description = EXCLUDED.description,
      active_ingredient = EXCLUDED.active_ingredient,
      classification = EXCLUDED.classification,
      social_name = EXCLUDED.social_name,
      manufacturer = EXCLUDED.manufacturer,
      details = EXCLUDED.details,
      searchable_text = EXCLUDED.searchable_text,
      normalized_searchable_text = EXCLUDED.normalized_searchable_text,
      tokens = EXCLUDED.tokens,
      token_count = EXCLUDED.token_count,
      embedding = EXCLUDED.embedding,
      updated_at = now()
    ${returnRows
      ? `
    RETURNING
      id,
      ean,
      description,
      active_ingredient AS "activeIngredient",
      classification,
      social_name AS "socialName",
      manufacturer,
      details,
      searchable_text AS "searchableText",
      tokens,
      token_count AS "tokenCount",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    `
      : ""}
  `;

  return {
    query,
    values,
  };
}

async function upsertProducts(products, options = {}, traceLogger = noopTraceLogger) {
  const { batchSize, returnRows } = options;

  traceLogger.step("upsertProducts", "Entrou no repository para persistir produtos.", {
    productCount: products.length,
    batchSize,
    returnRows,
  });

  if (products.length === 0) {
    return {
      processedCount: 0,
      products: [],
    };
  }

  const client = await pool.connect();
  const batches = chunkArray(products, batchSize, traceLogger);
  const savedProducts = [];
  let processedCount = 0;

  try {
    await client.query("BEGIN");

    traceLogger.step("upsertProducts", "Transacao iniciada no Postgres.", {
      batchCount: batches.length,
    });

    for (const [batchIndex, batch] of batches.entries()) {
      const { query, values } = buildUpsertProductsQuery(batch, { returnRows }, traceLogger);

      traceLogger.step("upsertProducts", "Executando batch de upsert.", {
        batchIndex,
        batchSize: batch.length,
        parameterCount: values.length,
      });

      const result = await client.query(query, values);

      processedCount += batch.length;

      traceLogger.step("upsertProducts", "Batch persistido com sucesso.", {
        batchIndex,
        processedCount,
        returnedRows: result.rows.length,
      });

      if (returnRows) {
        savedProducts.push(...result.rows.map(mapProductRow));
      }
    }

    await client.query("COMMIT");

    traceLogger.step("upsertProducts", "Transacao confirmada.", {
      processedCount,
      returnedProducts: savedProducts.length,
    });

    return {
      processedCount,
      products: savedProducts,
    };
  } catch (error) {
    traceLogger.fail("upsertProducts", error, {
      stage: "repository",
    });
    await client.query("ROLLBACK");
    traceLogger.step("upsertProducts", "Rollback executado apos falha.", {
      processedCount,
    });
    throw error;
  } finally {
    client.release();
    traceLogger.step("upsertProducts", "Conexao com o banco liberada.");
  }
}

async function searchProducts(params) {
  const result = await pool.query(
    `
      SELECT *
      FROM (
        SELECT
          id,
          ean,
          description,
          active_ingredient AS "activeIngredient",
          classification,
          social_name AS "socialName",
          manufacturer,
          details,
          searchable_text AS "searchableText",
          tokens,
          token_count AS "tokenCount",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          1 - (embedding <=> $1::vector) AS similarity,
          CASE WHEN $2::text IS NOT NULL AND ean = $2 THEN 1 ELSE 0 END AS "exactEanMatch",
          COALESCE((
            SELECT COUNT(*)
            FROM unnest(tokens) AS token
            WHERE token = ANY($3::text[])
          ), 0) AS "tokenOverlap"
        FROM products
        WHERE (
          $4::double precision IS NULL
          OR 1 - (embedding <=> $1::vector) >= $4
          OR (
            $6::boolean
            AND EXISTS (
              SELECT 1
              FROM unnest(tokens) AS token
              WHERE token = ANY($3::text[])
            )
          )
        )
      ) AS ranked_products
      ORDER BY
        "exactEanMatch" DESC,
        CASE WHEN $6::boolean THEN "tokenOverlap" ELSE 0 END DESC,
        similarity DESC,
        CASE WHEN NOT $6::boolean THEN "tokenOverlap" ELSE 0 END DESC,
        "updatedAt" DESC
      LIMIT $5
      OFFSET $7
    `,
    [
      params.embedding,
      params.eanFilter,
      params.queryTokens,
      params.minScore,
      params.limit,
      params.prioritizeLexicalSignals === true,
      params.offset || 0,
    ],
  );

  return result.rows.map((row) => ({
    ...mapProductRow(row),
    similarity: Number(row.similarity),
    tokenOverlap: Number(row.tokenOverlap),
    exactEanMatch: Number(row.exactEanMatch) === 1,
  }));
}

async function findProductsByEans(eans) {
  const result = await pool.query(
    `
      SELECT
        id,
        ean,
        description,
        active_ingredient AS "activeIngredient",
        classification,
        social_name AS "socialName",
        manufacturer,
        details,
        searchable_text AS "searchableText",
        tokens,
        token_count AS "tokenCount",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM products
      WHERE ean = ANY($1::text[])
    `,
    [eans],
  );

  return result.rows.map(mapProductRow);
}

async function listProductsForReprocessing(params = {}) {
  const limit = Number.parseInt(params.limit, 10);
  const safeLimit = Number.isNaN(limit) || limit < 1 ? 100 : limit;

  const result = await pool.query(
    `
      SELECT
        ean,
        description,
        active_ingredient AS "activeIngredient",
        classification,
        social_name AS "socialName",
        manufacturer,
        details
      FROM products
      WHERE ($1::text IS NULL OR ean > $1)
      ORDER BY ean ASC
      LIMIT $2
    `,
    [
      params.afterEan || null,
      safeLimit,
    ],
  );

  return result.rows;
}

module.exports = {
  findProductsByEans,
  listProductsForReprocessing,
  searchProducts,
  upsertProducts,
};
