const { createApp } = require("./app");
const { config } = require("./config");
const { closePool, pool } = require("./db");
const { ensureSchema } = require("./modules/database/schema.service");

async function bootstrap() {
  await ensureSchema(pool, config.vectorDimensions);

  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(
      `Servidor iniciado na porta ${config.port} com pgvector de ${config.vectorDimensions} dimensoes e embeddings ${config.openAiEmbeddingModel}.`,
    );
  });

  async function shutdown(signal) {
    console.log(`Encerrando servidor apos sinal ${signal}...`);

    server.close(async () => {
      await closePool();
      process.exit(0);
    });
  }

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

bootstrap().catch((error) => {
  console.error("Falha ao iniciar o servidor:", error);
  process.exit(1);
});
