function createLookupTableStatement(tableName) {
  return `
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
}

function createAddForeignKeyConstraintStatement(constraintName, columnName, referenceTable) {
  return `
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = '${constraintName}'
      ) THEN
        ALTER TABLE products
        ADD CONSTRAINT ${constraintName}
        FOREIGN KEY (${columnName})
        REFERENCES ${referenceTable}(id);
      END IF;
    END
    $$;
  `;
}

function createSchemaStatements(vectorDimensions) {
  return [
    "CREATE EXTENSION IF NOT EXISTS vector",
    "CREATE EXTENSION IF NOT EXISTS pgcrypto",
    createLookupTableStatement("departments"),
    createLookupTableStatement("categories"),
    createLookupTableStatement("subcategories"),
    createLookupTableStatement("segments"),
    createLookupTableStatement("subsegments"),
    createLookupTableStatement("active_ingredients"),
    `
      CREATE TABLE IF NOT EXISTS products (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ean text NOT NULL UNIQUE,
        description text NOT NULL,
        active_ingredient text,
        active_ingredient_id uuid,
        classification text,
        social_name text,
        manufacturer text,
        details text,
        department text,
        department_id uuid,
        category text,
        category_id uuid,
        subcategory text,
        subcategory_id uuid,
        segment text,
        segment_id uuid,
        subsegment text,
        subsegment_id uuid,
        searchable_text text NOT NULL,
        normalized_searchable_text text NOT NULL,
        tokens text[] NOT NULL,
        token_count integer NOT NULL,
        embedding vector(${vectorDimensions}) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `,
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS active_ingredient_id uuid",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS department text",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS department_id uuid",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS category text",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id uuid",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory text",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory_id uuid",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS segment text",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS segment_id uuid",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS subsegment text",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS subsegment_id uuid",
    createAddForeignKeyConstraintStatement(
      "fk_products_active_ingredient",
      "active_ingredient_id",
      "active_ingredients",
    ),
    createAddForeignKeyConstraintStatement(
      "fk_products_department",
      "department_id",
      "departments",
    ),
    createAddForeignKeyConstraintStatement(
      "fk_products_category",
      "category_id",
      "categories",
    ),
    createAddForeignKeyConstraintStatement(
      "fk_products_subcategory",
      "subcategory_id",
      "subcategories",
    ),
    createAddForeignKeyConstraintStatement(
      "fk_products_segment",
      "segment_id",
      "segments",
    ),
    createAddForeignKeyConstraintStatement(
      "fk_products_subsegment",
      "subsegment_id",
      "subsegments",
    ),
    "CREATE INDEX IF NOT EXISTS idx_products_ean ON products (ean)",
    "CREATE INDEX IF NOT EXISTS idx_products_active_ingredient_id ON products (active_ingredient_id)",
    "CREATE INDEX IF NOT EXISTS idx_products_department_id ON products (department_id)",
    "CREATE INDEX IF NOT EXISTS idx_products_category_id ON products (category_id)",
    "CREATE INDEX IF NOT EXISTS idx_products_subcategory_id ON products (subcategory_id)",
    "CREATE INDEX IF NOT EXISTS idx_products_segment_id ON products (segment_id)",
    "CREATE INDEX IF NOT EXISTS idx_products_subsegment_id ON products (subsegment_id)",
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
