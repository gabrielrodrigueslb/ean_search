import env from "../config/env.js";
import { logger } from "../utils/logger.js";
class ImportQueueService {
  constructor() {
    this.queue = [];
    this.activeCount = 0;
    this.maxConcurrent = Math.max(1, env.importQueueConcurrency || 1);
  }

  enqueue(job) {
    this.queue.push(job);

    logger.info("Importacao enfileirada", {
      importacao_id: job.importacaoId,
      fila_pendente: this.queue.length,
      jobs_ativos: this.activeCount,
    });

    setImmediate(() => {
      this.runNext().catch((error) => {
        logger.error("Falha ao processar fila de importacoes", {
          error: error.message,
        });
      });
    });
  }

  async runNext() {
    while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
      const job = this.queue.shift();
      this.activeCount += 1;

      logger.info("Importacao retirada da fila para processamento", {
        importacao_id: job.importacaoId,
        jobs_ativos: this.activeCount,
        fila_restante: this.queue.length,
      });

      Promise.resolve()
        .then(() => job.handler())
        .catch((error) => {
          logger.error("Falha em job da fila de importacoes", {
            importacao_id: job.importacaoId,
            error: error.message,
          });
        })
        .finally(() => {
          this.activeCount -= 1;
          logger.info("Job da fila finalizado", {
            importacao_id: job.importacaoId,
            jobs_ativos: this.activeCount,
            fila_restante: this.queue.length,
          });

          this.runNext().catch((error) => {
            logger.error("Falha ao continuar processamento da fila", {
              error: error.message,
            });
          });
        });
    }
  }
}

const importQueueService = new ImportQueueService();

export { importQueueService };