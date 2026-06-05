import path from "path";
import Database from "better-sqlite3";
import { BancoUnicoService } from "../src/services/banco-unico.service.js";
function printUsage() {
  console.log(`
Uso:
  npm run publish:banco-unico -- [caminho-do-banco] [opcoes]

Exemplos:
  npm run publish:banco-unico -- .\\prisma\\backups\\dev-20260505-110801-before-api-publish-flow.db
  npm run publish:banco-unico -- .\\prisma\\backups\\dev-20260505-110801-before-api-publish-flow.db --limit=50 --batch-size=10
  npm run publish:banco-unico -- .\\prisma\\backups\\dev-20260505-110801-before-api-publish-flow.db --dry-run

Opcoes:
  --limit=N            Limita quantos produtos publicar.
  --offset=N           Pula os primeiros N produtos elegiveis.
  --batch-size=N       Quantidade por lote. Default: 50.
  --base-url=URL       Sobrescreve a base URL da API.
  --authorization=VAL  Envia cabecalho Authorization.
  --include-incomplete Inclui produtos com campos faltando. Default: false.
  --dry-run            Nao publica; apenas mostra o que seria enviado.
  --help               Mostra esta ajuda.
`);
}

function parseArgs(argv) {
  const options = {
    sourceDbPath: null,
    limit: null,
    offset: 0,
    batchSize: 50,
    baseUrl: null,
    authorization: null,
    includeIncomplete: false,
    dryRun: false,
  };

  for (const arg of argv) {
    if (!arg.startsWith("--") && !options.sourceDbPath) {
      options.sourceDbPath = arg;
      continue;
    }

    if (arg === "--help") {
      options.help = true;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--include-incomplete") {
      options.includeIncomplete = true;
      continue;
    }

    if (arg.startsWith("--limit=")) {
      options.limit = Number(arg.split("=")[1]);
      continue;
    }

    if (arg.startsWith("--offset=")) {
      options.offset = Number(arg.split("=")[1]);
      continue;
    }

    if (arg.startsWith("--batch-size=")) {
      options.batchSize = Number(arg.split("=")[1]);
      continue;
    }

    if (arg.startsWith("--base-url=")) {
      options.baseUrl = arg.slice("--base-url=".length);
      continue;
    }

    if (arg.startsWith("--authorization=")) {
      options.authorization = arg.slice("--authorization=".length);
      continue;
    }
  }

  if (!Number.isInteger(options.offset) || options.offset < 0) {
    throw new Error("O valor de --offset precisa ser um inteiro maior ou igual a zero.");
  }

  if (!Number.isInteger(options.batchSize) || options.batchSize <= 0) {
    throw new Error("O valor de --batch-size precisa ser um inteiro maior que zero.");
  }

  if (options.limit !== null && (!Number.isInteger(options.limit) || options.limit <= 0)) {
    throw new Error("O valor de --limit precisa ser um inteiro maior que zero.");
  }

  return options;
}

function resolveDbPath(sourceDbPath) {
  if (!sourceDbPath) {
    throw new Error("Informe o caminho do banco SQLite de origem.");
  }

  return path.resolve(process.cwd(), sourceDbPath);
}

function buildWhereClause(includeIncomplete) {
  if (includeIncomplete) {
    return "WHERE ean IS NOT NULL AND trim(ean) <> '' AND description IS NOT NULL AND trim(description) <> ''";
  }

  return `
WHERE ean IS NOT NULL AND trim(ean) <> ''
  AND description IS NOT NULL AND trim(description) <> ''
  AND active_ingredient IS NOT NULL AND trim(active_ingredient) <> ''
  AND classification IS NOT NULL AND trim(classification) <> '' AND classification <> 'NAO DEFINIDO'
  AND social_name IS NOT NULL AND trim(social_name) <> ''
  AND manufacturer IS NOT NULL AND trim(manufacturer) <> ''
  AND details IS NOT NULL AND trim(details) <> ''
`;
}

function loadProducts(db, options) {
  const whereClause = buildWhereClause(options.includeIncomplete);
  const sql = `
    SELECT
      ean,
      description,
      active_ingredient,
      classification,
      social_name,
      manufacturer,
      details
    FROM catalog_items
    ${whereClause}
    ORDER BY ean
    LIMIT @limit OFFSET @offset
  `;

  const effectiveLimit = options.limit ?? -1;

  function parseDetailsJson(value) {
    if (!String(value || "").trim()) {
      return null;
    }

    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  return db.prepare(sql).all({
    limit: effectiveLimit,
    offset: options.offset,
  }).map((row) => {
    const details = parseDetailsJson(row.details);
    const finalStructure = details?.estrutura_final || null;

    return {
      descricaoProduto: row.description,
      ean: row.ean,
      principioAtivo: row.active_ingredient,
      classificacao: row.classification,
      nomeSocial: row.social_name,
      fabricante: row.manufacturer,
      departamento: finalStructure?.departamento || details?.departamento || null,
      categoria: finalStructure?.categoria || details?.categoria || null,
      subcategoria: finalStructure?.subcategoria || details?.subcategoria || null,
      segmento: finalStructure?.segmento || details?.segmento || null,
      subsegmento: finalStructure?.subsegmento || details?.subsegmento || null,
      detalhes: row.details,
    };
  });
}

function chunk(items, batchSize) {
  const batches = [];

  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }

  return batches;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    return;
  }

  const sourceDbPath = resolveDbPath(options.sourceDbPath);
  const db = new Database(sourceDbPath, { readonly: true });

  try {
    const products = loadProducts(db, options);

    if (!products.length) {
      throw new Error("Nenhum produto elegivel foi encontrado no banco de origem.");
    }

    console.log(`Banco origem: ${sourceDbPath}`);
    console.log(`Produtos elegiveis: ${products.length}`);
    console.log(`Modo: ${options.dryRun ? "dry-run" : "publicacao real"}`);

    if (options.dryRun) {
      console.log(JSON.stringify({
        total: products.length,
        products: products.map((product) => ({
          ean: product.ean,
          descricaoProduto: product.descricaoProduto,
          principioAtivo: product.principioAtivo,
          classificacao: product.classificacao,
          nomeSocial: product.nomeSocial,
          fabricante: product.fabricante,
          departamento: product.departamento,
          categoria: product.categoria,
          subcategoria: product.subcategoria,
          segmento: product.segmento,
          subsegmento: product.subsegmento,
        })),
      }, null, 2));
      return;
    }

    const service = new BancoUnicoService();
    const config = {
      ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
      ...(options.authorization ? { authorization: options.authorization } : {}),
    };

    const batches = chunk(products, options.batchSize);
    const publishedProducts = [];

    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index];
      console.log(`Publicando lote ${index + 1}/${batches.length} com ${batch.length} produtos...`);
      const response = await service.publishProducts(batch, config);

      if (Array.isArray(response.products)) {
        publishedProducts.push(...response.products);
      }
    }

    console.log(JSON.stringify({
      sourceDbPath,
      totalSelecionados: products.length,
      totalPublicados: publishedProducts.length,
      eans: products.map((product) => product.ean),
      products: products.map((product) => ({
        ean: product.ean,
        descricaoProduto: product.descricaoProduto,
        principioAtivo: product.principioAtivo,
        classificacao: product.classificacao,
        nomeSocial: product.nomeSocial,
        fabricante: product.fabricante,
        departamento: product.departamento,
        categoria: product.categoria,
        subcategoria: product.subcategoria,
        segmento: product.segmento,
        subsegmento: product.subsegmento,
      })),
    }, null, 2));
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  if (error.details) {
    console.error(JSON.stringify(error.details, null, 2));
  }
  process.exitCode = 1;
});
