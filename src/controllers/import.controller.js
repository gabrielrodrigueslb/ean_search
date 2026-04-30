const { ImportService } = require("../services/import.service");
const { CsvImportAdapter } = require("../adapters/csv-import.adapter");
const { logger } = require("../utils/logger");

class ImportController {
  constructor() {
    this.importService = new ImportService();
  }

  importCsv = async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "Arquivo CSV nao enviado." });
    }

    const adapter = new CsvImportAdapter(req.file.buffer);
    const items = await adapter.parse();
    const result = await this.importService.processItems({
      fonte: "csv",
      items,
    });

    logger.info("Importacao CSV finalizada", {
      importacao_id: result.id,
      total_itens: items.length,
      filename: req.file.originalname,
      status: result.status,
    });

    return res.status(202).json(result);
  };

  importJson = async (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const normalizedItems = items.map((item) => ({
      ean: item.ean,
      nome_recebido: item.nome_recebido || item.nome || null,
      dados_brutos: item,
      fonte: "json",
    }));

    const result = await this.importService.processItems({
      fonte: "json",
      items: normalizedItems,
    });

    logger.info("Importacao JSON finalizada", {
      importacao_id: result.id,
      total_itens: normalizedItems.length,
      status: result.status,
    });

    return res.status(202).json(result);
  };

  getImportacao = async (req, res) => {
    const result = await this.importService.getImportacao(Number(req.params.id));
    if (!result) {
      return res.status(404).json({ error: "Importacao nao encontrada." });
    }

    return res.json(result);
  };
}

module.exports = { ImportController };
