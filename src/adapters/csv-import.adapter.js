const { parse } = require("csv-parse/sync");
const { BaseImportAdapter } = require("./base-import.adapter");

class CsvImportAdapter extends BaseImportAdapter {
  constructor(buffer) {
    super("csv");
    this.buffer = buffer;
  }

  async parse() {
    const raw = this.buffer.toString("utf-8");
    const records = parse(raw, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      trim: true,
    });

    return records.map((record) => this.normalizeItem(record));
  }
}

module.exports = { CsvImportAdapter };
