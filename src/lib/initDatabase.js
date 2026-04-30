const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const env = require("../config/env");

function resolveSqlitePath(databaseUrl) {
  return databaseUrl.replace(/^file:/, "");
}

function hasLegacyJsonColumns(db) {
  const tables = [
    "itens_importacao",
    "solicitacoes_revisao",
    "eans_nao_encontrados",
    "historico_alteracoes",
  ];

  for (const tableName of tables) {
    const row = db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName);

    if (row?.sql && /\bJSON\b/i.test(row.sql)) {
      return true;
    }
  }

  return false;
}

function migrateLegacyJsonSchema(db) {
  db.exec(`
    BEGIN TRANSACTION;

    CREATE TABLE IF NOT EXISTS itens_importacao_new (
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
    INSERT INTO itens_importacao_new (
      id, importacao_id, ean, nome_recebido, dados_brutos, status, mensagem_erro, fontes_consultadas, created_at, updated_at
    )
    SELECT
      id, importacao_id, ean, nome_recebido, CAST(dados_brutos AS TEXT), status, mensagem_erro, CAST(fontes_consultadas AS TEXT), created_at, updated_at
    FROM itens_importacao;
    DROP TABLE itens_importacao;
    ALTER TABLE itens_importacao_new RENAME TO itens_importacao;
    CREATE INDEX IF NOT EXISTS idx_itens_importacao_importacao_id ON itens_importacao(importacao_id);
    CREATE INDEX IF NOT EXISTS idx_itens_importacao_ean ON itens_importacao(ean);

    CREATE TABLE IF NOT EXISTS solicitacoes_revisao_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      ean TEXT,
      dados_atuais TEXT NOT NULL,
      dados_sugeridos TEXT NOT NULL,
      diff_campos TEXT NOT NULL,
      motivo TEXT NOT NULL,
      resumo_ia TEXT,
      confidence_score REAL,
      fonte TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_by TEXT,
      reviewed_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO solicitacoes_revisao_new (
      id, entity_type, entity_id, ean, dados_atuais, dados_sugeridos, diff_campos, motivo, resumo_ia, confidence_score, fonte, status, reviewed_by, reviewed_at, created_at, updated_at
    )
    SELECT
      id, entity_type, entity_id, ean, CAST(dados_atuais AS TEXT), CAST(dados_sugeridos AS TEXT), CAST(diff_campos AS TEXT), motivo, resumo_ia, confidence_score, fonte, status, reviewed_by, reviewed_at, created_at, updated_at
    FROM solicitacoes_revisao;
    DROP TABLE solicitacoes_revisao;
    ALTER TABLE solicitacoes_revisao_new RENAME TO solicitacoes_revisao;
    CREATE INDEX IF NOT EXISTS idx_solicitacoes_revisao_status ON solicitacoes_revisao(status);
    CREATE INDEX IF NOT EXISTS idx_solicitacoes_revisao_ean ON solicitacoes_revisao(ean);

    CREATE TABLE IF NOT EXISTS eans_nao_encontrados_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ean TEXT NOT NULL UNIQUE,
      nome_recebido TEXT,
      dados_brutos TEXT NOT NULL,
      fontes_tentadas TEXT,
      motivo_nao_encontrado TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_review',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO eans_nao_encontrados_new (
      id, ean, nome_recebido, dados_brutos, fontes_tentadas, motivo_nao_encontrado, status, created_at, updated_at
    )
    SELECT
      id, ean, nome_recebido, CAST(dados_brutos AS TEXT), CAST(fontes_tentadas AS TEXT), motivo_nao_encontrado, status, created_at, updated_at
    FROM eans_nao_encontrados;
    DROP TABLE eans_nao_encontrados;
    ALTER TABLE eans_nao_encontrados_new RENAME TO eans_nao_encontrados;

    CREATE TABLE IF NOT EXISTS historico_alteracoes_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      solicitacao_revisao_id INTEGER NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      antes TEXT NOT NULL,
      depois TEXT NOT NULL,
      aplicado_por TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO historico_alteracoes_new (
      id, solicitacao_revisao_id, entity_type, entity_id, antes, depois, aplicado_por, created_at
    )
    SELECT
      id, solicitacao_revisao_id, entity_type, entity_id, CAST(antes AS TEXT), CAST(depois AS TEXT), aplicado_por, created_at
    FROM historico_alteracoes;
    DROP TABLE historico_alteracoes;
    ALTER TABLE historico_alteracoes_new RENAME TO historico_alteracoes;
    CREATE INDEX IF NOT EXISTS idx_historico_alteracoes_revisao_id ON historico_alteracoes(solicitacao_revisao_id);

    COMMIT;
  `);
}

function initDatabase() {
  const filePath = resolveSqlitePath(env.databaseUrl);
  const directory = path.dirname(filePath);

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  let db = new Database(filePath);
  db.pragma("foreign_keys = ON");

  if (hasLegacyJsonColumns(db)) {
    migrateLegacyJsonSchema(db);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      nome_normalizado TEXT NOT NULL,
      slug TEXT,
      tipo TEXT NOT NULL DEFAULT 'outro',
      laboratorio TEXT,
      laboratorio_slug TEXT,
      classe TEXT,
      classe_slug TEXT,
      categoria TEXT,
      origem_nome TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS apresentacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_id INTEGER NOT NULL,
      ean TEXT NOT NULL UNIQUE,
      descricao TEXT,
      dose TEXT,
      unidade TEXT,
      forma_farmaceutica TEXT,
      via_administracao TEXT,
      quantidade TEXT,
      volume TEXT,
      registro_ms TEXT,
      tarja TEXT,
      origem_dados TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_apresentacoes_produto_id ON apresentacoes(produto_id);

    CREATE TABLE IF NOT EXISTS farmacos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      nome_normalizado TEXT NOT NULL UNIQUE,
      slug TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS produto_farmacos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_id INTEGER NOT NULL,
      farmaco_id INTEGER NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE,
      FOREIGN KEY (farmaco_id) REFERENCES farmacos(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_produto_farmacos_unique ON produto_farmacos(produto_id, farmaco_id);
    CREATE INDEX IF NOT EXISTS idx_produto_farmacos_produto_id ON produto_farmacos(produto_id);
    CREATE INDEX IF NOT EXISTS idx_produto_farmacos_farmaco_id ON produto_farmacos(farmaco_id);

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

    CREATE TABLE IF NOT EXISTS solicitacoes_revisao (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      ean TEXT,
      dados_atuais TEXT NOT NULL,
      dados_sugeridos TEXT NOT NULL,
      diff_campos TEXT NOT NULL,
      motivo TEXT NOT NULL,
      resumo_ia TEXT,
      confidence_score REAL,
      fonte TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_by TEXT,
      reviewed_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_solicitacoes_revisao_status ON solicitacoes_revisao(status);
    CREATE INDEX IF NOT EXISTS idx_solicitacoes_revisao_ean ON solicitacoes_revisao(ean);

    CREATE TABLE IF NOT EXISTS eans_nao_encontrados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ean TEXT NOT NULL UNIQUE,
      nome_recebido TEXT,
      dados_brutos TEXT NOT NULL,
      fontes_tentadas TEXT,
      motivo_nao_encontrado TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_review',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS historico_alteracoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      solicitacao_revisao_id INTEGER NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      antes TEXT NOT NULL,
      depois TEXT NOT NULL,
      aplicado_por TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_historico_alteracoes_revisao_id ON historico_alteracoes(solicitacao_revisao_id);
  `);

  db.close();
}

module.exports = { initDatabase };
