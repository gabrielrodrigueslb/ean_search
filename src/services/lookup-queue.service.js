import env from "../config/env.js";
import { logger } from "../utils/logger.js";

class LookupQueueService {
  constructor({ maxConcurrent } = {}) {
    this.queue = [];
    this.activeCount = 0;
    this.maxConcurrent = Math.min(10, Math.max(1, Number(maxConcurrent || env.lookupQueueConcurrency || 10)));
    this.jobSequence = 0;
  }

  enqueue({ lookupKey = null, handler }) {
    if (typeof handler !== "function") {
      return Promise.reject(new Error("Lookup queue requer um handler valido."));
    }

    return new Promise((resolve, reject) => {
      const job = {
        id: this.jobSequence += 1,
        lookupKey,
        handler,
        resolve,
        reject,
      };

      this.queue.push(job);

      logger.info("Lookup enfileirado", {
        job_id: job.id,
        ean: lookupKey || null,
        fila_pendente: this.queue.length,
        jobs_ativos: this.activeCount,
        max_concorrencia: this.maxConcurrent,
      });

      setImmediate(() => {
        this.runNext().catch((error) => {
          logger.error("Falha ao processar fila de lookup", {
            error: error.message,
          });
        });
      });
    });
  }

  async runNext() {
    while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
      const job = this.queue.shift();
      this.activeCount += 1;

      logger.info("Lookup retirado da fila para processamento", {
        job_id: job.id,
        ean: job.lookupKey || null,
        jobs_ativos: this.activeCount,
        fila_restante: this.queue.length,
        max_concorrencia: this.maxConcurrent,
      });

      Promise.resolve()
        .then(() => job.handler())
        .then((result) => {
          job.resolve(result);
        })
        .catch((error) => {
          logger.error("Falha em job da fila de lookup", {
            job_id: job.id,
            ean: job.lookupKey || null,
            error: error.message,
          });
          job.reject(error);
        })
        .finally(() => {
          this.activeCount -= 1;

          logger.info("Job de lookup finalizado", {
            job_id: job.id,
            ean: job.lookupKey || null,
            jobs_ativos: this.activeCount,
            fila_restante: this.queue.length,
            max_concorrencia: this.maxConcurrent,
          });

          this.runNext().catch((error) => {
            logger.error("Falha ao continuar fila de lookup", {
              error: error.message,
            });
          });
        });
    }
  }
}

const lookupQueueService = new LookupQueueService();

export { LookupQueueService, lookupQueueService };
