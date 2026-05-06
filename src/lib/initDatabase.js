const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const env = require("../config/env");

function resolveSqlitePath(databaseUrl) {
  return databaseUrl.replace(/^file:/, "");
}

function initDatabase() {
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

module.exports = { initDatabase };
