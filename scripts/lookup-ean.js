import { EnrichmentService } from "../src/services/enrichment.service.js";

async function main() {
  const ean = String(process.argv[2] || "").trim();
  const nomeRecebido = String(process.argv[3] || "").trim() || null;

  if (!ean) {
    throw new Error("Informe o EAN. Ex.: npm run lookup:ean -- 7891058017507");
  }

  const service = new EnrichmentService();
  const result = await service.enrichImportedItem({
    ean,
    fonte: "cli",
    nome_recebido: nomeRecebido,
    dados_brutos: {
      ean,
      ...(nomeRecebido
        ? {
          nome: nomeRecebido,
          nome_produto: nomeRecebido,
          nome_exibicao: nomeRecebido,
        }
        : {}),
    },
  });

  console.log(JSON.stringify({
    ean,
    enriched: result.enriched,
    requiresApproval: result.requiresApproval,
    approvalReason: result.approvalReason,
    fontes_consultadas: result.fontes_consultadas,
    item: result.item,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
