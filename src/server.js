import env from "./config/env.js";
import prisma from "./lib/prisma.js";
import { createApp } from "./app.js";
import { initDatabase } from "./lib/initDatabase.js";
import { logger } from "./utils/logger.js";
const app = createApp();

async function start() {
  await prisma.$connect();
  await initDatabase(prisma);

  app.listen(env.port, () => {
    logger.info("Servidor rodando", { url: `http://localhost:${env.port}` });
  });
}

start().catch(async (error) => {
  logger.error("Falha ao iniciar a aplicacao", {
    error: error.message,
  });
  await prisma.$disconnect();
  process.exit(1);
});
