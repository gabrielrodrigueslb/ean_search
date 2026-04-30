const OpenAI = require("openai");
const env = require("../config/env");
const { diffObjects } = require("../utils/diffObjects");
const { logger } = require("../utils/logger");

class AiService {
  constructor() {
    this.client = env.openAiApiKey ? new OpenAI({ apiKey: env.openAiApiKey }) : null;
  }

  buildMockResponse({ atual, sugerido }) {
    const currentFlat = {
      produto: atual?.produto || {},
      apresentacao: atual?.apresentacoes?.[0] || {},
      farmacos: atual?.farmacos || [],
    };

    const suggestedFlat = {
      produto: sugerido?.produto || {},
      apresentacao: sugerido?.apresentacoes?.[0] || {},
      farmacos: sugerido?.farmacos || [],
    };

    const diffCampos = [
      ...diffObjects(currentFlat.produto, suggestedFlat.produto),
      ...diffObjects(currentFlat.apresentacao, suggestedFlat.apresentacao),
    ];

    const precisaAtualizar = diffCampos.length > 0;

    return {
      mesmo_produto: true,
      sugerir_atualizacao: precisaAtualizar,
      resumo: precisaAtualizar
        ? "Foram encontradas diferencas relevantes entre o cadastro atual e os dados enriquecidos."
        : "O cadastro atual ja esta compativel com os dados enriquecidos.",
      confidence_score: precisaAtualizar ? 0.72 : 0.95,
      dados_sugeridos: sugerido,
      diff_campos: diffCampos.map((item) => ({
        ...item,
        motivo: "Comparacao automatica local",
        source: "mock_ai",
      })),
    };
  }

  async analisarDivergencia({ atual, sugerido, contexto }) {
    if (!this.client) {
      logger.info("OPENAI_API_KEY ausente, usando analise mock local", {
        ean: contexto?.ean,
      });
      return this.buildMockResponse({ atual, sugerido, contexto });
    }

    logger.info("Enviando comparacao para OpenAI", {
      ean: contexto?.ean,
      model: env.openAiModel,
    });
    const response = await this.client.responses.create({
      model: env.openAiModel,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "Voce analisa cadastros de produtos de farmacia. Responda apenas JSON valido com as chaves mesmo_produto, sugerir_atualizacao, resumo, confidence_score, dados_sugeridos e diff_campos.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({ atual, sugerido, contexto }),
            },
          ],
        },
      ],
    });

    const output = response.output_text;
    logger.info("Resposta da OpenAI recebida", {
      ean: contexto?.ean,
    });
    return JSON.parse(output);
  }
}

module.exports = { AiService };
