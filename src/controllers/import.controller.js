const { ImportService } = require("../services/import.service");
const { CsvImportAdapter } = require("../adapters/csv-import.adapter");
const { logger } = require("../utils/logger");

function serializeImportacaoResponse(importacao) {
  if (!importacao) {
    return importacao;
  }

  return {
    ...importacao,
    importacao_id: importacao.id,
  };
}

function parseProductApi(raw) {
  if (!raw) {
    return {};
  }

  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch (error) {
      return {};
    }
  }

  return raw;
}

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
    if (!items.length) {
      return res.status(400).json({ error: "CSV vazio ou sem linhas validas.", details: null });
    }

    const result = await this.importService.enqueueItems({
      fonte: "csv",
      items,
      productApi: parseProductApi(req.body?.productApi),
    });

    logger.info("Importacao CSV aceita para processamento", {
      importacao_id: result.id,
      total_itens: items.length,
      filename: req.file.originalname,
      status: result.status,
    });

    return res.status(202).json(serializeImportacaoResponse(result));
  };

  importJson = async (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) {
      return res.status(400).json({ error: "Nenhum item enviado para importacao JSON.", details: null });
    }

    const normalizedItems = items.map((item) => ({
      ean: item.ean,
      nome_recebido: item.nome_recebido || item.nome || null,
      dados_brutos: item,
      fonte: "json",
    }));

    const result = await this.importService.enqueueItems({
      fonte: "json",
      items: normalizedItems,
      productApi: parseProductApi(req.body?.productApi),
    });

    logger.info("Importacao JSON aceita para processamento", {
      importacao_id: result.id,
      total_itens: normalizedItems.length,
      status: result.status,
    });

    return res.status(202).json(serializeImportacaoResponse(result));
  };

  importTrier = async (req, res) => {
    const {
      baseUrl,
      bearerToken,
      productApi,
      codigo,
      ean,
      nomeProduto,
      primeiroRegistro,
      quantidadeRegistros,
      ativo,
      integracaoEcommerce,
      processaCustoMedio,
    } = req.body || {};

    const result = await this.importService.enqueueTrierImport({
      baseUrl,
      bearerToken,
      productApi: parseProductApi(productApi),
      filters: {
        codigo,
        codigoBarras: ean,
        nomeProduto,
        primeiroRegistro,
        quantidadeRegistros,
        ativo,
        integracaoEcommerce,
        processaCustoMedio,
      },
    });

    logger.info("Importacao Trier aceita para processamento", {
      importacao_id: result.id,
      status: result.status,
      codigo,
      ean,
      nomeProduto,
    });

    return res.status(202).json(serializeImportacaoResponse(result));
  };

  importVetor = async (req, res) => {
    const {
      baseUrl,
      apiKey,
      productApi,
      filter,
      select,
      orderby,
      top,
      skip,
      count,
    } = req.body || {};

    const result = await this.importService.enqueueVetorImport({
      baseUrl,
      apiKey,
      productApi: parseProductApi(productApi),
      filters: {
        filter,
        select,
        orderby,
        top,
        skip,
        count,
      },
    });

    logger.info("Importacao Vetor aceita para processamento", {
      importacao_id: result.id,
      status: result.status,
      filter: filter || null,
      top: top || null,
      skip: skip || null,
    });

    return res.status(202).json(serializeImportacaoResponse(result));
  };

  getImportacao = async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Id de importacao invalido.", details: null });
    }

    const result = await this.importService.getImportacao(id);
    if (!result) {
      return res.status(404).json({ error: "Importacao nao encontrada." });
    }

    return res.json(serializeImportacaoResponse(result));
  };
}

module.exports = { ImportController };
