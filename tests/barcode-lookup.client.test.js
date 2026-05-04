const { BarcodeLookupClient } = require("../src/integrations/barcode-lookup.client");

describe("BarcodeLookupClient", () => {
  test("extrai o nome do produto do h4 em product-details", () => {
    const client = new BarcodeLookupClient();
    const html = `
      <div class="col-50 product-details">
        <h1>EAN 7896023705397</h1>
        <h4>Agua Inglesa Frasco Com 500ml</h4>
      </div>
    `;

    expect(client.parseNameFromHtml(html)).toBe("Agua Inglesa Frasco Com 500ml");
  });

  test("cai para a meta description quando o h4 nao existe", () => {
    const client = new BarcodeLookupClient();
    const html = `
      <html>
        <head>
          <meta name="description" content="Barcode Lookup provides info on EAN 7896023705397 - Agua Inglesa Frasco Com 500ml.">
        </head>
        <body></body>
      </html>
    `;

    expect(client.parseNameFromHtml(html)).toBe("Agua Inglesa Frasco Com 500ml");
  });
});
