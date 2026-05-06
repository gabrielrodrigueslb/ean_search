const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const env = require("../config/env");

function isSqliteUrl(databaseUrl) {
  return typeof databaseUrl === "string" && databaseUrl.startsWith("file:");
}

function isPostgresUrl(databaseUrl) {
  return typeof databaseUrl === "string"
    && (databaseUrl.startsWith("postgresql://") || databaseUrl.startsWith("postgres://"));
}

function resolveSqlitePath(databaseUrl) {
  return databaseUrl.replace(/^file:/, "");
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

function initSqliteDatabase() {
  const filePath = resolveSqlitePath(env.databaseUrl);
  const directory = path.dirname(filePath);

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  const db = new Database(filePath);
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS importacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fonte TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      total_itens INTEGER NOT NULL DEFAULT 0,
      itens_processados INTEGER NOT NULL DEFAULT 0,
      itens_sucesso INTEGER NOT NULL DEFAULT 0,
      itens_falha INTEGER NOT NULL DEFAULT 0,
      itens_revisao INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      finished_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS itens_importacao (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      importacao_id INTEGER NOT NULL,
      ean TEXT NOT NULL,
      nome_recebido TEXT,
      dados_brutos TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      mensagem_erro TEXT,
      fontes_consultadas TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (importacao_id) REFERENCES importacoes(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_itens_importacao_importacao_id ON itens_importacao(importacao_id);
    CREATE INDEX IF NOT EXISTS idx_itens_importacao_ean ON itens_importacao(ean);

    CREATE TABLE IF NOT EXISTS produtos_aprovacao (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      importacao_id INTEGER NOT NULL,
      item_importacao_id INTEGER,
      ean TEXT NOT NULL,
      nome_sugerido TEXT,
      motivo TEXT NOT NULL,
      fonte_origem TEXT,
      dados_brutos TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (importacao_id) REFERENCES importacoes(id) ON DELETE CASCADE,
      FOREIGN KEY (item_importacao_id) REFERENCES itens_importacao(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_produtos_aprovacao_importacao_id ON produtos_aprovacao(importacao_id);
    CREATE INDEX IF NOT EXISTS idx_produtos_aprovacao_item_importacao_id ON produtos_aprovacao(item_importacao_id);
    CREATE INDEX IF NOT EXISTS idx_produtos_aprovacao_ean ON produtos_aprovacao(ean);
  `);

  db.close();
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

  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_itens_importacao_importacao_id" ON "${schema}"."itens_importacao"("importacao_id")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_itens_importacao_ean" ON "${schema}"."itens_importacao"("ean")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_produtos_aprovacao_importacao_id" ON "${schema}"."produtos_aprovacao"("importacao_id")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_produtos_aprovacao_item_importacao_id" ON "${schema}"."produtos_aprovacao"("item_importacao_id")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "idx_produtos_aprovacao_ean" ON "${schema}"."produtos_aprovacao"("ean")`);
}

async function initDatabase(prisma) {
  if (!env.databaseUrl) {
    throw new Error("DATABASE_URL nao configurada.");
  }

  if (isSqliteUrl(env.databaseUrl)) {
    initSqliteDatabase();
    return;
  }

  if (isPostgresUrl(env.databaseUrl)) {
    await initPostgresDatabase(prisma);
    return;
  }

  throw new Error("DATABASE_URL com protocolo nao suportado. Use file:, postgresql:// ou postgres://.");
}

module.exports = { initDatabase };
