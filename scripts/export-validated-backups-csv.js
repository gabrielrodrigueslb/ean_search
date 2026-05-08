import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
const TRUSTED_NAME_SOURCES = new Set([
  "pt_product_search",
  "farmaindex",
  "barcode_lookup",
  "pt_product_search_browser",
  "barcode_lookup_browser",
]);

function formatToday() {
  return new Date().toISOString().slice(0, 10);
}

function printUsage() {
  console.log(`
Uso:
  node scripts/export-validated-backups-csv.js [opcoes]

Opcoes:
  --output=ARQUIVO       Caminho do CSV de saida.
  --report=ARQUIVO       Caminho do JSON de relatorio.
  --include-legacy       Tenta incluir linhas de backups legados sem catalog_items.
  --help                 Mostra esta ajuda.
`);
}

function parseArgs(argv) {
  const options = {
    output: path.resolve(process.cwd(), `produtos_validados_todos_backups_${formatToday()}.csv`),
    report: path.resolve(process.cwd(), `produtos_validados_todos_backups_${formatToday()}.report.json`),
    includeLegacy: false,
  };

  for (const arg of argv) {
    if (arg === "--help") {
      options.help = true;
      continue;
    }

    if (arg === "--include-legacy") {
      options.includeLegacy = true;
      continue;
    }

    if (arg.startsWith("--output=")) {
      options.output = path.resolve(process.cwd(), arg.slice("--output=".length));
      continue;
    }

    if (arg.startsWith("--report=")) {
      options.report = path.resolve(process.cwd(), arg.slice("--report=".length));
    }
  }

  return options;
}

function listBackupFiles() {
  const backupsDir = path.resolve(process.cwd(), "prisma", "backups");
  return fs.readdirSync(backupsDir)
    .filter((entry) => entry.endsWith(".db"))
    .map((entry) => path.join(backupsDir, entry))
    .sort((left, right) => right.localeCompare(left));
}

function tableExists(db, tableName) {
  const row = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
  ).get(tableName);
  return Boolean(row);
}

function hasPopulatedCatalogItems(db) {
  if (!tableExists(db, "catalog_items")) {
    return false;
  }

  const row = db.prepare("SELECT COUNT(*) AS total FROM catalog_items").get();
  return Number(row?.total || 0) > 0;
}

function getCatalogRows(db) {
  return db.prepare(`
    SELECT
      ean,
      description AS descricaoProduto,
      active_ingredient AS principioAtivo,
      classification AS classificacao,
      social_name AS nomeSocial,
      manufacturer AS fabricante,
      details AS detalhes
    FROM catalog_items
    WHERE ean IS NOT NULL AND trim(ean) <> ''
      AND description IS NOT NULL AND trim(description) <> ''
      AND active_ingredient IS NOT NULL AND trim(active_ingredient) <> ''
      AND classification IS NOT NULL AND trim(classification) <> '' AND classification <> 'NAO DEFINIDO'
      AND social_name IS NOT NULL AND trim(social_name) <> ''
      AND manufacturer IS NOT NULL AND trim(manufacturer) <> ''
      AND details IS NOT NULL AND trim(details) <> ''
    ORDER BY ean
  `).all();
}

function normalizeJoinedIngredient(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .join(", ");
}

function buildLegacyDetails(row) {
  return JSON.stringify({
    ean: String(row.ean),
    dose: row.dose || null,
    unidade: row.unidade || null,
    forma_farmaceutica: row.forma_farmaceutica || null,
    via_administracao: row.via_administracao || null,
    quantidade: row.quantidade || null,
    volume: row.volume || null,
    registro_ms: row.registro_ms || null,
    tarja: row.tarja || null,
    origem_nome: row.origem_nome || null,
    origem_dados: row.origem_dados || row.origem_nome || "legado",
    farmacos: row.farmacos
      ? row.farmacos.split(",").map((item) => item.trim()).filter(Boolean)
      : null,
    legado: true,
  });
}

function getLegacyRows(db) {
  return db.prepare(`
    SELECT
      a.ean,
      a.nome_exibicao AS descricaoProduto,
      fa.active_ingredient AS principioAtivo,
      p.categoria AS classificacao,
      p.nome AS nomeSocial,
      p.laboratorio AS fabricante,
      a.dose,
      a.unidade,
      a.forma_farmaceutica,
      a.via_administracao,
      a.quantidade,
      a.volume,
      a.registro_ms,
      a.tarja,
      a.origem_dados,
      p.origem_nome,
      fa.active_ingredient AS farmacos
    FROM apresentacoes a
    JOIN produtos p ON p.id = a.produto_id
    LEFT JOIN (
      SELECT
        pf.produto_id,
        GROUP_CONCAT(DISTINCT f.nome) AS active_ingredient
      FROM produto_farmacos pf
      JOIN farmacos f ON f.id = pf.farmaco_id
      WHERE f.nome IS NOT NULL AND trim(f.nome) <> ''
      GROUP BY pf.produto_id
    ) fa ON fa.produto_id = p.id
    WHERE a.ean IS NOT NULL AND trim(a.ean) <> ''
      AND a.nome_exibicao IS NOT NULL AND trim(a.nome_exibicao) <> ''
      AND p.nome IS NOT NULL AND trim(p.nome) <> ''
      AND p.categoria IS NOT NULL AND trim(p.categoria) <> '' AND p.categoria <> 'NAO DEFINIDO'
      AND p.laboratorio IS NOT NULL AND trim(p.laboratorio) <> ''
      AND p.origem_nome IS NOT NULL
      AND fa.active_ingredient IS NOT NULL AND trim(fa.active_ingredient) <> ''
    ORDER BY a.ean
  `).all()
    .filter((row) => TRUSTED_NAME_SOURCES.has(row.origem_nome))
    .map((row) => ({
      ean: row.ean,
      descricaoProduto: row.descricaoProduto,
      principioAtivo: normalizeJoinedIngredient(row.principioAtivo),
      classificacao: row.classificacao,
      nomeSocial: row.nomeSocial,
      fabricante: row.fabricante,
      detalhes: buildLegacyDetails(row),
    }));
}

function csvEscape(value) {
  const stringValue = value === null || value === undefined ? "" : String(value);
  if (stringValue.includes(",") || stringValue.includes("\"") || stringValue.includes("\n") || stringValue.includes("\r")) {
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }
  return stringValue;
}

function toCsv(rows) {
  const header = [
    "descricaoProduto",
    "ean",
    "principioAtivo",
    "classificacao",
    "nomeSocial",
    "fabricante",
    "detalhes",
  ];

  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(header.map((column) => csvEscape(row[column])).join(","));
  }
  return lines.join("\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const dedupedByEan = new Map();
  const report = {
    backups: [],
    totals: {
      includedRows: 0,
      uniqueRows: 0,
      duplicateRowsSkipped: 0,
      legacyRowsFound: 0,
      legacyRowsIncluded: 0,
      legacyRowsSkipped: 0,
    },
  };

  for (const backupPath of listBackupFiles()) {
    const db = new Database(backupPath, { readonly: true });
    try {
      if (hasPopulatedCatalogItems(db)) {
        const rows = getCatalogRows(db);
        let included = 0;
        let duplicates = 0;

        for (const row of rows) {
          if (dedupedByEan.has(row.ean)) {
            duplicates += 1;
            continue;
          }
          dedupedByEan.set(row.ean, row);
          included += 1;
        }

        report.backups.push({
          path: backupPath,
          mode: "catalog_items",
          rowsFound: rows.length,
          rowsIncluded: included,
          duplicatesSkipped: duplicates,
        });
        report.totals.includedRows += included;
        report.totals.duplicateRowsSkipped += duplicates;
        continue;
      }

      const legacyRows = getLegacyRows(db);
      let included = 0;
      let duplicates = 0;

      if (options.includeLegacy) {
        for (const row of legacyRows) {
          if (dedupedByEan.has(row.ean)) {
            duplicates += 1;
            continue;
          }
          dedupedByEan.set(row.ean, row);
          included += 1;
        }
      }

      report.backups.push({
        path: backupPath,
        mode: "legacy_reconstructed",
        rowsFound: legacyRows.length,
        rowsIncluded: included,
        duplicatesSkipped: duplicates,
        skippedByDefault: !options.includeLegacy,
      });

      report.totals.legacyRowsFound += legacyRows.length;
      report.totals.legacyRowsIncluded += included;
      report.totals.legacyRowsSkipped += options.includeLegacy
        ? legacyRows.length - included - duplicates
        : legacyRows.length;
      report.totals.duplicateRowsSkipped += duplicates;
      report.totals.includedRows += included;
    } finally {
      db.close();
    }
  }

  const rows = Array.from(dedupedByEan.values()).sort((left, right) => left.ean.localeCompare(right.ean));
  report.totals.uniqueRows = rows.length;

  fs.writeFileSync(options.output, `\uFEFF${toCsv(rows)}`, "utf-8");
  fs.writeFileSync(options.report, `${JSON.stringify(report, null, 2)}\n`, "utf-8");

  console.log(JSON.stringify({
    output: options.output,
    report: options.report,
    uniqueRows: report.totals.uniqueRows,
    duplicateRowsSkipped: report.totals.duplicateRowsSkipped,
    legacyRowsFound: report.totals.legacyRowsFound,
    legacyRowsIncluded: report.totals.legacyRowsIncluded,
    legacyRowsSkipped: report.totals.legacyRowsSkipped,
  }, null, 2));
}

main();
