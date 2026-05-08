import { parse } from "csv-parse/sync";
import { BaseImportAdapter } from "./base-import.adapter.js";
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

export { CsvImportAdapter };
