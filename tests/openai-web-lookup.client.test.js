import { describe, expect, jest, test } from "@jest/globals";
import { OpenAiWebLookupClient } from "../src/integrations/openai-web-lookup.client.js";

function createStructuredResponse(payload) {
  return {
    data: {
      output_text: JSON.stringify(payload),
      output: [],
    },
  };
}

describe("OpenAiWebLookupClient", () => {
  test("instrui a IA a expandir abreviacoes no nome final quando houver evidencia", () => {
    const client = new OpenAiWebLookupClient({
      apiKey: "test-key",
      httpClient: { post: jest.fn() },
    });

    const payload = client.buildRequestPayload({
      ean: "7891234567890",
      rawName: "SH PALMOLIVE 350ML NUTRI LISS",
    });

    expect(payload.input[0].content[0].text).toContain(
      "trate as abreviacoes como pista de busca",
    );
    expect(payload.input[0].content[0].text).toContain(
      "Nao devolva nome final abreviado ou truncado",
    );
    expect(payload.input[0].content[0].text).toContain(
      "SAB LIQ, REF, ENV, PENT, TRAT, CP, CPS, CPD, UND, UNDS, C/100",
    );
    expect(payload.input[0].content[0].text).toContain(
      "Nao tente expandir siglas legitimas",
    );
  });

  test("faz retry em 429 usando retry-after e reaproveita variacoes do nome bruto", async () => {
    const post = jest
      .fn()
      .mockRejectedValueOnce({
        message: "Request failed with status code 429",
        response: {
          status: 429,
          headers: {
            "retry-after": "1",
          },
        },
      })
      .mockResolvedValueOnce(createStructuredResponse({
        found: true,
        confidence: 0.95,
        produto: "Arflex Retard 200mg",
        nome_exibicao: "Arflex Retard 200mg 12 Cps",
        apresentacao: "12 capsulas",
        laboratorio: "Diffucap",
        categoria: "Medicamento",
        registro_ms: null,
        tarja: null,
        forma_farmaceutica: "Capsula",
        via_administracao: "Oral",
        quantidade: "12 capsulas",
        principio_ativo: ["Nimesulida"],
        evidence: [{
          title: "Pagina publica",
          url: "https://example.com/arflex",
          matched_ean: true,
          note: "EAN encontrado",
        }],
        rationale: "Produto confirmado por EAN.",
      }));
    const sleepFn = jest.fn(async () => {});
    const client = new OpenAiWebLookupClient({
      apiKey: "test-key",
      httpClient: { post },
      sleepFn,
      maxRetries: 2,
      retryBaseDelayMs: 500,
      retryMaxDelayMs: 3000,
      minConfidence: 0.7,
    });

    const result = await client.lookupProduct({
      ean: "7898096577345",
      rawName: "ARFLEX RETARD 200MG 12CAP GEL",
    });

    expect(post).toHaveBeenCalledTimes(2);
    expect(sleepFn).toHaveBeenCalledWith(1000);
    expect(JSON.parse(post.mock.calls[0][1].input[1].content[0].text).query_variants).toEqual(
      expect.arrayContaining([
        "ARFLEX RETARD 200MG 12CAP GEL",
        expect.stringContaining("capsulas"),
      ]),
    );
    expect(result.accepted).toBe(true);
  });
});
