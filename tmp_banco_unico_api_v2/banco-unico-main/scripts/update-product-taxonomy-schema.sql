CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

BEGIN;

CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subcategories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subsegments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS active_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS active_ingredient_id uuid;
ALTER TABLE products ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS department_id uuid;
ALTER TABLE products ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id uuid;
ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory_id uuid;
ALTER TABLE products ADD COLUMN IF NOT EXISTS segment text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS segment_id uuid;
ALTER TABLE products ADD COLUMN IF NOT EXISTS subsegment text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS subsegment_id uuid;

INSERT INTO active_ingredients (name)
SELECT DISTINCT active_ingredient
FROM products
WHERE active_ingredient IS NOT NULL
  AND btrim(active_ingredient) <> ''
ON CONFLICT (name) DO NOTHING;

INSERT INTO departments (name)
SELECT DISTINCT department
FROM products
WHERE department IS NOT NULL
  AND btrim(department) <> ''
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name)
SELECT DISTINCT category
FROM products
WHERE category IS NOT NULL
  AND btrim(category) <> ''
ON CONFLICT (name) DO NOTHING;

INSERT INTO subcategories (name)
SELECT DISTINCT subcategory
FROM products
WHERE subcategory IS NOT NULL
  AND btrim(subcategory) <> ''
ON CONFLICT (name) DO NOTHING;

INSERT INTO segments (name)
SELECT DISTINCT segment
FROM products
WHERE segment IS NOT NULL
  AND btrim(segment) <> ''
ON CONFLICT (name) DO NOTHING;

INSERT INTO subsegments (name)
SELECT DISTINCT subsegment
FROM products
WHERE subsegment IS NOT NULL
  AND btrim(subsegment) <> ''
ON CONFLICT (name) DO NOTHING;

UPDATE products p
SET active_ingredient_id = ai.id
FROM active_ingredients ai
WHERE p.active_ingredient IS NOT NULL
  AND p.active_ingredient = ai.name
  AND p.active_ingredient_id IS DISTINCT FROM ai.id;

UPDATE products p
SET department_id = d.id
FROM departments d
WHERE p.department IS NOT NULL
  AND p.department = d.name
  AND p.department_id IS DISTINCT FROM d.id;

UPDATE products p
SET category_id = c.id
FROM categories c
WHERE p.category IS NOT NULL
  AND p.category = c.name
  AND p.category_id IS DISTINCT FROM c.id;

UPDATE products p
SET subcategory_id = sc.id
FROM subcategories sc
WHERE p.subcategory IS NOT NULL
  AND p.subcategory = sc.name
  AND p.subcategory_id IS DISTINCT FROM sc.id;

UPDATE products p
SET segment_id = s.id
FROM segments s
WHERE p.segment IS NOT NULL
  AND p.segment = s.name
  AND p.segment_id IS DISTINCT FROM s.id;

UPDATE products p
SET subsegment_id = ss.id
FROM subsegments ss
WHERE p.subsegment IS NOT NULL
  AND p.subsegment = ss.name
  AND p.subsegment_id IS DISTINCT FROM ss.id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_products_active_ingredient'
  ) THEN
    ALTER TABLE products
    ADD CONSTRAINT fk_products_active_ingredient
    FOREIGN KEY (active_ingredient_id)
    REFERENCES active_ingredients(id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_products_department'
  ) THEN
    ALTER TABLE products
    ADD CONSTRAINT fk_products_department
    FOREIGN KEY (department_id)
    REFERENCES departments(id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_products_category'
  ) THEN
    ALTER TABLE products
    ADD CONSTRAINT fk_products_category
    FOREIGN KEY (category_id)
    REFERENCES categories(id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_products_subcategory'
  ) THEN
    ALTER TABLE products
    ADD CONSTRAINT fk_products_subcategory
    FOREIGN KEY (subcategory_id)
    REFERENCES subcategories(id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_products_segment'
  ) THEN
    ALTER TABLE products
    ADD CONSTRAINT fk_products_segment
    FOREIGN KEY (segment_id)
    REFERENCES segments(id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_products_subsegment'
  ) THEN
    ALTER TABLE products
    ADD CONSTRAINT fk_products_subsegment
    FOREIGN KEY (subsegment_id)
    REFERENCES subsegments(id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_products_active_ingredient_id ON products (active_ingredient_id);
CREATE INDEX IF NOT EXISTS idx_products_department_id ON products (department_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products (category_id);
CREATE INDEX IF NOT EXISTS idx_products_subcategory_id ON products (subcategory_id);
CREATE INDEX IF NOT EXISTS idx_products_segment_id ON products (segment_id);
CREATE INDEX IF NOT EXISTS idx_products_subsegment_id ON products (subsegment_id);

COMMIT;
