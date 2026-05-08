import env from "../config/env.js";

function isPostgresUrl(databaseUrl) {
  return typeof databaseUrl === "string"
    && (databaseUrl.startsWith("postgresql://") || databaseUrl.startsWith("postgres://"));
}

function getPostgresSchema(databaseUrl) {
  try {
    const parsedUrl = new URL(databaseUrl);
    return parsedUrl.searchParams.get("schema") || "public";
  } catch {
    return "public";
  }
}

function assertSafeIdentifier(identifier, label) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`${label} invalido para inicializacao automatica: ${identifier}`);
  }
}

async function initPostgresDatabase(prisma) {
  if (!prisma) {
    throw new Error("Prisma e obrigatorio para inicializar o Postgres.");
  }

  const schema = getPostgresSchema(env.databaseUrl);
  assertSafeIdentifier(schema, "Schema");

  await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      CREATE TYPE "${schema}"."StatusImportacao" AS ENUM ('pending', 'processing', 'completed', 'failed');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      CREATE TYPE "${schema}"."StatusItemImportacao" AS ENUM ('pending', 'processing', 'enriched', 'review', 'failed');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "${schema}"."importacoes" (
      "id" SERIAL PRIMARY KEY,
      "fonte" TEXT NOT NULL,
      "status" "${schema}"."StatusImportacao" NOT NULL DEFAULT 'pending',
      "total_itens" INTEGER NOT NULL DEFAULT 0,
      "itens_processados" INTEGER NOT NULL DEFAULT 0,
      "itens_sucesso" INTEGER NOT NULL DEFAULT 0,
      "itens_falha" INTEGER NOT NULL DEFAULT 0,
      "itens_revisao" INTEGER NOT NULL DEFAULT 0,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "finished_at" TIMESTAMP(3)
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "${schema}"."itens_importacao" (
      "id" SERIAL PRIMARY KEY,
      "importacao_id" INTEGER NOT NULL,
      "ean" TEXT NOT NULL,
      "nome_recebido" TEXT,
      "dados_brutos" TEXT NOT NULL,
      "status" "${schema}"."StatusItemImportacao" NOT NULL DEFAULT 'pending',
      "mensagem_erro" TEXT,
      "fontes_consultadas" TEXT,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "itens_importacao_importacao_id_fkey"
        FOREIGN KEY ("importacao_id") REFERENCES "${schema}"."importacoes"("id") ON DELETE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "${schema}"."produtos_aprovacao" (
      "id" SERIAL PRIMARY KEY,
      "importacao_id" INTEGER NOT NULL,
      "item_importacao_id" INTEGER,
      "ean" TEXT NOT NULL,
      "nome_sugerido" TEXT,
      "motivo" TEXT NOT NULL,
      "fonte_origem" TEXT,
      "dados_brutos" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "produtos_aprovacao_importacao_id_fkey"
        FOREIGN KEY ("importacao_id") REFERENCES "${schema}"."importacoes"("id") ON DELETE CASCADE,
      CONSTRAINT "produtos_aprovacao_item_importacao_id_fkey"
        FOREIGN KEY ("item_importacao_id") REFERENCES "${schema}"."itens_importacao"("id") ON DELETE SET NULL
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "${schema}"."produtos_fallback_api" (
      "id" SERIAL PRIMARY KEY,
      "importacao_id" INTEGER NOT NULL,
      "item_importacao_id" INTEGER,
      "ean" TEXT NOT NULL,
      "payload" TEXT NOT NULL,
      "api_config" TEXT,
      "motivo_falha" TEXT NOT NULL,
      "resposta_erro" TEXT,
      "status" TEXT NOT NULL DEFAULT 'pending_replay',
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "produtos_fallback_api_importacao_id_fkey"
        FOREIGN KEY ("importacao_id") REFERENCES "${schema}"."importacoes"("id") ON DELETE CASCADE,
      CONSTRAINT "produtos_fallback_api_item_importacao_id_fkey"
        FOREIGN KEY ("item_importacao_id") REFERENCES "${schema}"."itens_importacao"("id") ON DELETE SET NULL
    )
  `);

  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_itens_importacao_importacao_id" ON "${schema}"."itens_importacao"("importacao_id")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_itens_importacao_ean" ON "${schema}"."itens_importacao"("ean")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_produtos_aprovacao_importacao_id" ON "${schema}"."produtos_aprovacao"("importacao_id")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_produtos_aprovacao_item_importacao_id" ON "${schema}"."produtos_aprovacao"("item_importacao_id")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_produtos_aprovacao_ean" ON "${schema}"."produtos_aprovacao"("ean")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_produtos_fallback_api_importacao_id" ON "${schema}"."produtos_fallback_api"("importacao_id")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_produtos_fallback_api_item_importacao_id" ON "${schema}"."produtos_fallback_api"("item_importacao_id")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_produtos_fallback_api_ean" ON "${schema}"."produtos_fallback_api"("ean")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_produtos_fallback_api_status" ON "${schema}"."produtos_fallback_api"("status")`);
}

async function initDatabase(prisma) {
  if (!env.databaseUrl) {
    throw new Error("DATABASE_URL nao configurada.");
  }

  if (isPostgresUrl(env.databaseUrl)) {
    await initPostgresDatabase(prisma);
    return;
  }

  throw new Error("DATABASE_URL com protocolo nao suportado. Use postgresql:// ou postgres://.");
}

export { initDatabase };
