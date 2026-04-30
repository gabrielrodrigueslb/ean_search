const env = require("./config/env");
const prisma = require("./lib/prisma");
const { createApp } = require("./app");
const { initDatabase } = require("./lib/initDatabase");
const { logger } = require("./utils/logger");

const app = createApp();

async function start() {
  initDatabase();
  await prisma.$connect();

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
