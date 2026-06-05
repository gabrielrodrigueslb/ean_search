import fs from "fs";
import { parse } from "csv-parse/sync";
import env from "../config/env.js";
import { normalizeText } from "../utils/normalizeText.js";

function toTokenSet(value) {
  return new Set(
    normalizeText(value)
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean),
  );
}

function joinPath(entry = {}) {
  return [
    entry.departamento,
    entry.categoria,
    entry.subcategoria,
    entry.segmento,
    entry.subsegmento,
  ].filter(Boolean).join(" > ");
}

class MercadologicalTreeService {
  constructor({ csvPath } = {}) {
    this.csvPath = csvPath || env.mercadologicalTreeCsvPath;
    this.entries = null;
  }

  isConfigured() {
    return Boolean(this.csvPath && fs.existsSync(this.csvPath));
  }

  loadEntries() {
    if (this.entries) {
      return this.entries;
    }

    if (!this.isConfigured()) {
      this.entries = [];
      return this.entries;
    }

    const csv = fs.readFileSync(this.csvPath, "utf8");
    const rows = parse(csv, {
      columns: true,
      delimiter: ";",
      skip_empty_lines: true,
      trim: true,
    });

    this.entries = rows.map((row, index) => {
      const entry = {
        id: `taxonomy_${index + 1}`,
        departamento: row.Departamento || null,
        categoria: row.Categoria || null,
        subcategoria: row.Subcategoria || null,
        segmento: row.Segmento || null,
        subsegmento: row.Subsegmento || null,
        qtdCodigosBarras: Number(row.Qtd_Codigos_Barras || 0) || 0,
      };
      const path = joinPath(entry);

      return {
        ...entry,
        path,
        normalizedPath: normalizeText(path),
        tokenSet: toTokenSet(path),
      };
    });

    return this.entries;
  }

  findExactPath(match = {}) {
    const target = normalizeText([
      match.departamento,
      match.categoria,
      match.subcategoria,
      match.segmento,
      match.subsegmento,
    ].filter(Boolean).join(" > "));

    if (!target) {
      return null;
    }

    return this.loadEntries().find((entry) => entry.normalizedPath === target) || null;
  }

  scoreEntry(entry, signals = {}) {
    let score = 0;
    const signalTokens = toTokenSet(signals.searchText);

    for (const token of signalTokens) {
      if (entry.tokenSet.has(token)) {
        score += 4;
      }
    }

    if (normalizeText(signals.departamento) === normalizeText(entry.departamento)) {
      score += 80;
    }

    if (normalizeText(signals.categoria) === normalizeText(entry.categoria)) {
      score += 90;
    }

    if (normalizeText(signals.subcategoria) === normalizeText(entry.subcategoria)) {
      score += 100;
    }

    if (normalizeText(signals.segmento) === normalizeText(entry.segmento)) {
      score += 110;
    }

    if (normalizeText(signals.subsegmento) === normalizeText(entry.subsegmento)) {
      score += 120;
    }

    score += Math.min(entry.qtdCodigosBarras, 25) / 25;

    return score;
  }

  findCandidates(signals = {}, limit = env.mercadologicalAiCandidateLimit) {
    return this.loadEntries()
      .map((entry) => ({
        ...entry,
        score: this.scoreEntry(entry, signals),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || b.qtdCodigosBarras - a.qtdCodigosBarras)
      .slice(0, limit)
      .map(({ tokenSet, normalizedPath, ...entry }) => entry);
  }
}

export { MercadologicalTreeService };
