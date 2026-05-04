const { EnrichmentService } = require("../src/services/enrichment.service");

describe("FarmaIndex enrichment", () => {
  test("extrai farmacos estruturados do detalhe", () => {
    const service = new EnrichmentService();

    expect(service.extractFarmacos({
      info: {
        farmacos: [
          { farmaco: "Cafeína Anidra", slug: "cafeina-anidra" },
          { farmaco: "Dipirona Monoidratada", slug: "dipirona-monoidratada" },
        ],
      },
    })).toEqual([
      {
        nome: "Cafeína Anidra",
        nome_normalizado: "cafeina anidra",
        slug: "cafeina-anidra",
      },
      {
        nome: "Dipirona Monoidratada",
        nome_normalizado: "dipirona monoidratada",
        slug: "dipirona-monoidratada",
      },
    ]);
  });

  test("monta snapshot priorizando dados do FarmaIndex", () => {
    const service = new EnrichmentService();
    const snapshot = service.buildSnapshot({
      item: {
        ean: "7891058017507",
        nome_recebido: "DORFLEX 300+35+50MG C36",
        dados_brutos: { nome: "DORFLEX 300+35+50MG C36" },
      },
      ptResult: {
        nome: "Dorflex Com 36 Comprimidos",
      },
      searchResult: {
        produto: "Dorflex",
        apresentacao: "300mg + 35mg + 50mg 36 Comprimidos",
        laboratorio: "OPELLA HEALTHCARE",
        tipo: "NOVO",
        tarja: "VENDA LIVRE",
      },
      detail: {
        info: {
          produto: "Dorflex",
          apresentacao: "300mg + 35mg + 50mg 36 Comprimidos",
          registro: "1862000080116",
          tarja: "VENDA LIVRE",
          laboratorio: "Opella Healthcare Brazil Ltda",
          forma_farmaceutica: "COMPRIMIDOS",
          via_adm: "Oral",
          qtde_fs: "36",
          tipo: "Novo",
          classe: "Relaxante Muscular de Ação Central",
          farmacos: [
            { farmaco: "Dipirona Monoidratada", slug: "dipirona-monoidratada" },
          ],
        },
      },
    });

    expect(snapshot.nome_recebido).toBe("Dorflex Com 36 Comprimidos");
    expect(snapshot.dados_brutos.nome).toBe("Dorflex");
    expect(snapshot.dados_brutos.origem_nome).toBe("pt_product_search");
    expect(snapshot.dados_brutos.origem_dados).toBe("farmaindex");
    expect(snapshot.dados_brutos.forma_farmaceutica).toBe("COMPRIMIDOS");
    expect(snapshot.dados_brutos.via_administracao).toBe("Oral");
    expect(snapshot.dados_brutos.farmacos).toEqual([
      {
        nome: "Dipirona Monoidratada",
        nome_normalizado: "dipirona monoidratada",
        slug: "dipirona-monoidratada",
      },
    ]);
  });

  test("quando so o PT responde, assume perfumaria por padrao", () => {
    const service = new EnrichmentService();
    const snapshot = service.buildSnapshot({
      item: {
        ean: "7890000000000",
        nome_recebido: "Shampoo Dove 400ml",
        dados_brutos: {},
      },
      ptResult: {
        nome: "Shampoo Dove 400ml",
      },
      searchResult: null,
      detail: null,
    });

    expect(snapshot.dados_brutos.nome).toBe("Shampoo Dove 400ml");
    expect(snapshot.dados_brutos.tipo).toBe("perfumaria");
    expect(snapshot.dados_brutos.origem_nome).toBe("pt_product_search");
    expect(snapshot.dados_brutos.origem_dados).toBe("pt_product_search");
  });

  test("nao usa nome bruto da Trier como fallback no snapshot", () => {
    const service = new EnrichmentService();
    const snapshot = service.buildSnapshot({
      item: {
        ean: "7890000000000",
        nome_recebido: "LENCOS UMED.BABY WIPES C500 AZ",
        dados_brutos: {
          nome_trier: "LENCOS UMED.BABY WIPES C500 AZ",
          origem_nome: "trier",
        },
      },
      ptResult: null,
      searchResult: null,
      detail: null,
    });

    expect(snapshot.nome_recebido).toBeNull();
    expect(snapshot.dados_brutos.nome).toBeNull();
  });

  test("usa BarcodeLookup como fallback final de nome", () => {
    const service = new EnrichmentService();
    const snapshot = service.buildSnapshot({
      item: {
        ean: "7896023705397",
        nome_recebido: "AGUA ING",
        dados_brutos: {
          nome_trier: "AGUA ING",
          origem_nome: "trier",
        },
      },
      ptResult: null,
      searchResult: null,
      detail: null,
      barcodeLookupResult: {
        nome: "Agua Inglesa Frasco Com 500ml",
      },
    });

    expect(snapshot.nome_recebido).toBe("Agua Inglesa Frasco Com 500ml");
    expect(snapshot.dados_brutos.nome).toBe("Agua Inglesa Frasco Com 500ml");
    expect(snapshot.dados_brutos.origem_nome).toBe("barcode_lookup");
    expect(snapshot.dados_brutos.origem_dados).toBe("barcode_lookup");
  });

  test("classifica polvilho granado como perfumaria na taxonomia comercial", () => {
    const service = new EnrichmentService();
    const snapshot = service.buildSnapshot({
      item: {
        ean: "7896512904126",
        nome_recebido: "Polvilho Antisseptico Granado Sport",
        dados_brutos: {
          nome_trier: "POLVILHO ANTISSEPTICO GRANADO SPORT",
          categoria: "Higiene",
        },
      },
      ptResult: null,
      searchResult: {
        produto: "Polvilho Antisseptico Granado Sport",
        apresentacao: "3,0g + 0,352g + 17,602g + 11,735g po",
        laboratorio: "Casa Granado",
      },
      detail: {
        info: {
          medicamentoid: 123,
          produto: "Polvilho Antisseptico Granado Sport",
          apresentacao: "3,0g + 0,352g + 17,602g + 11,735g po",
          classe: "Antissepticos E Desinfetantes, Exceto Produtos Para as Maos",
          laboratorio: "Casa Granado Laboratorios, Farmacias E Drogarias S/A",
          tipo_receita: "Prescricao Branca Comum",
          tarja: "Prescricao Branca Comum",
        },
      },
      barcodeLookupResult: null,
    });

    expect(snapshot.dados_brutos.tipo).toBe("perfumaria");
  });
});
