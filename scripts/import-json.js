const fs = require("fs");
const path = require("path");
const prisma = require("../src/lib/prisma");
const { initDatabase } = require("../src/lib/initDatabase");
const { ImportService } = require("../src/services/import.service");

async function main() {
  const inputPath = process.argv[2];

  if (!inputPath) {
    throw new Error("Informe o caminho do JSON. Ex.: npm run import:json -- .\\arquivo.json");
  }

  const absolutePath = path.resolve(process.cwd(), inputPath);
  const payload = JSON.parse(fs.readFileSync(absolutePath, "utf-8"));
  const items = Array.isArray(payload) ? payload : payload.items;

  if (!Array.isArray(items) || !items.length) {
    throw new Error("O JSON precisa ser um array ou um objeto com a chave items.");
  }

  await prisma.$connect();
  await initDatabase(prisma);

  const normalizedItems = items.map((item) => ({
    ean: item.ean,
    nome_recebido: item.nome_recebido || item.nome || null,
    dados_brutos: item,
    fonte: "json",
  }));

  const service = new ImportService();
  const result = await service.runItemsNow({ fonte: "json", items: normalizedItems });

  console.log(JSON.stringify({
    importacao_id: result.id,
    status: result.status,
    total_itens: normalizedItems.length,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
