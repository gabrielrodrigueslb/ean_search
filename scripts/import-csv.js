const fs = require("fs");
const path = require("path");
const prisma = require("../src/lib/prisma");
const { initDatabase } = require("../src/lib/initDatabase");
const { CsvImportAdapter } = require("../src/adapters/csv-import.adapter");
const { ImportService } = require("../src/services/import.service");

async function main() {
  const inputPath = process.argv[2];

  if (!inputPath) {
    throw new Error("Informe o caminho do CSV. Ex.: npm run import:csv -- .\\arquivo.csv");
  }

  const absolutePath = path.resolve(process.cwd(), inputPath);
  const buffer = fs.readFileSync(absolutePath);

  await prisma.$connect();
  await initDatabase(prisma);

  const adapter = new CsvImportAdapter(buffer);
  const items = await adapter.parse();
  const service = new ImportService();
  const result = await service.runItemsNow({ fonte: "csv", items });

  console.log(JSON.stringify({
    importacao_id: result.id,
    status: result.status,
    total_itens: items.length,
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
