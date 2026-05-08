import fs from "fs";
import path from "path";
import prisma from "../src/lib/prisma.js";
import { initDatabase } from "../src/lib/initDatabase.js";
import { CsvImportAdapter } from "../src/adapters/csv-import.adapter.js";
import { ImportService } from "../src/services/import.service.js";
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
