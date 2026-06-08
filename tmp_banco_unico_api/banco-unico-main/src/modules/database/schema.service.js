function createSchemaStatements(vectorDimensions) {
  return [
    "CREATE EXTENSION IF NOT EXISTS vector",
    "CREATE EXTENSION IF NOT EXISTS pgcrypto",
    `
      CREATE TABLE IF NOT EXISTS products (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ean text NOT NULL UNIQUE,
        description text NOT NULL,
        active_ingredient text,
        classification text,
        social_name text,
        manufacturer text,
        details text,
        searchable_text text NOT NULL,
        normalized_searchable_text text NOT NULL,
        tokens text[] NOT NULL,
        token_count integer NOT NULL,
        embedding vector(${vectorDimensions}) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `,
    "CREATE INDEX IF NOT EXISTS idx_products_ean ON products (ean)",
    "CREATE INDEX IF NOT EXISTS idx_products_tokens_gin ON products USING GIN (tokens)",
    `
      CREATE INDEX IF NOT EXISTS idx_products_embedding_ivfflat
      ON products
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100)
    `,
  ];
}

async function ensureSchema(pool, vectorDimensions) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const statement of createSchemaStatements(vectorDimensions)) {
      await client.query(statement);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  ensureSchema,
};
