import { ProductLookupSourceContract } from "../../contracts/product-lookup-source.contract.js";
import { HtmlScraperClient } from "../../integrations/html-scraper.client.js";
import { tokenize } from "../../utils/catalogItem.js";
import { normalizeText } from "../../utils/normalizeText.js";
import axios from "axios";
import * as cheerio from "cheerio";

function pickFirstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function decodeDuckDuckGoUrl(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return null;
  }

  const absoluteUrl = rawValue.startsWith("//")
    ? `https:${rawValue}`
    : rawValue;

  if (!absoluteUrl.includes("duckduckgo.com/l/?")) {
    return absoluteUrl;
  }

  const parsed = new URL(absoluteUrl);
  const target = parsed.searchParams.get("uddg");
  return pickFirstString(target ? decodeURIComponent(target) : null, absoluteUrl);
}

function cleanupTitle(value) {
  const source = pickFirstString(value);
  if (!source) {
    return null;
  }

  return source
    .replace(/^bula do\s+/i, "")
    .replace(/^comprar\s+/i, "")
    .replace(/\s*[|\-–]\s*(compre|menor preco|delivery|ofertas|farmacia|droga).*/i, "")
    .replace(/\s*[|\-–]\s*cliniguia$/i, "")
    .replace(/\s+gtin\/ean:\s*[0-9]+$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCandidateSpacing(value) {
  return String(value || "")
    .replace(/[._/|]+/g, " ")
    .replace(/(\d)([A-Za-zÀ-ÿ])/g, "$1 $2")
    .replace(/([A-Za-zÀ-ÿ])(\d)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanupResidualMarketplaceNoise(value) {
  return String(value || "")
    .replace(/\s+gtin ean:\s*[0-9]+/gi, "")
    .replace(/\s+ean:\s*[0-9]+/gi, "")
    .replace(/\s*[|\-]\s*cosmos$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function preserveCommercialLineTokens(value) {
  return String(value || "")
    .replace(/\bDs\b/g, "DS")
    .replace(/\bAz\b/g, "AZ")
    .replace(/\bQ10\b/g, "Q10")
    .replace(/\bD3\b/g, "D3")
    .replace(/\bB5\b/g, "B5")
    .replace(/\bFps\b/g, "FPS")
    .replace(/\bUv\b/g, "UV");
}

function expandAbbreviations(value) {
  const replacements = [
    [/\bPO\b/gi, "Po"],
    [/\bDESCOL\b/gi, "Descolorante"],
    [/\bDESC\b/gi, "Descolorante"],
    [/\bCOND\b/gi, "Condicionador"],
    [/\bSH\b/gi, "Shampoo"],
    [/\bTINT\b/gi, "Tintura"],
    [/\bCPR\b/gi, "Comprimidos"],
    [/\bCP\b/gi, "Comprimidos"],
    [/\bCAPS?\b/gi, "Capsulas"],
    [/\bCX\b/gi, "Caixa"],
    [/\bAMP\b/gi, "Ampola"],
  ];

  let normalized = normalizeCandidateSpacing(value);
  for (const [pattern, replacement] of replacements) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized
    .replace(/\s+/g, " ")
    .trim();
}

function applyContextualNameFixes(value) {
  return String(value || "")
    .replace(/\bPo Descolorante\b/gi, "Pó Descolorante")
    .replace(/\bPo\b(?=\s+Descolorante\b)/gi, "Pó")
    .replace(/\bMg\b/g, "mg")
    .replace(/\bMl\b/g, "ml")
    .replace(/\bG\b(?=$|\s)/g, "g");
}

function toTitleCase(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token[0].toUpperCase() + token.slice(1).toLowerCase())
    .join(" ");
}

function isGenericProductLabel(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return true;
  }

  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length < 2) {
    return true;
  }

  return /\b(site|home|inicio|pagina)\b/.test(normalized);
}

function isPromotionalProductLabel(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return true;
  }

  return [
    /\bachei\b.*\bmais barato\b/,
    /\bconfira precos?\b/,
    /\bcompre online\b/,
    /\bmenor preco\b/,
    /\bdescontos?\b/,
    /\bdelivery\b/,
    /\bofertas?\b/,
    /\bgtin ean\b.*\bproduto\b/,
  ].some((pattern) => pattern.test(normalized));
}

function getTokenOverlapScore(rawName, targetText) {
  const rawTokens = tokenize(rawName).filter((token) => token.length > 2);
  const targetTokens = new Set(tokenize(targetText));

  if (!rawTokens.length || !targetTokens.size) {
    return 0;
  }

  const matches = rawTokens.filter((token) => targetTokens.has(token)).length;
  return matches / rawTokens.length;
}

function extractDosageTokens(value) {
  return String(value || "")
    .match(/\b\d+(?:[.,]\d+)?\s*(?:mg|mcg|g|ml|ui|capsulas|capsula|comprimidos|comprimido)\b/gi) || [];
}

function hasStrongDosageMatch(rawName, targetText) {
  const dosageTokens = extractDosageTokens(rawName).map((token) => normalizeText(token));
  if (!dosageTokens.length) {
    return false;
  }

  const normalizedTargetText = normalizeText(targetText);
  return dosageTokens.some((token) => normalizedTargetText.includes(token));
}

function buildQueries(ean, rawName) {
  const queries = new Set([String(ean || "").trim()]);
  const cleanName = pickFirstString(rawName);

  if (cleanName) {
    queries.add(`${ean} ${cleanName}`);
    queries.add(cleanName);
  }

  return [...queries].filter(Boolean);
}

function trimText(value, limit = 600) {
  const normalized = pickFirstString(String(value || "").replace(/\s+/g, " ").trim());
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, limit);
}

function extractProductNameFromSnippet(value) {
  const source = pickFirstString(value);
  if (!source) {
    return null;
  }

  const match = source.match(/([A-Za-zÀ-ÿ0-9 ,.-]{8,140}?)(?=\s+(?:C[ÓO]DIGO DO PRODUTO|GTIN|EAN|\/\s*Marca:|\|Marca:))/i);
  return pickFirstString(match?.[1]);
}

function buildNormalizedProductLabel(value) {
  const cleaned = cleanupTitle(value);
  if (!cleaned) {
    return null;
  }

  return applyContextualNameFixes(
    preserveCommercialLineTokens(
      toTitleCase(cleanupResidualMarketplaceNoise(expandAbbreviations(cleaned))),
    ),
  );
}

function isAcceptedDisplayLabel(label, rawName = null) {
  if (!label) {
    return false;
  }

  if (isGenericProductLabel(label) || isPromotionalProductLabel(label)) {
    return false;
  }

  if (rawName && getTokenOverlapScore(rawName, label) < 0.25 && isGenericProductLabel(label)) {
    return false;
  }

  return true;
}

class PublicSearchLookupSource extends ProductLookupSourceContract {
  constructor({ client, searchHttp, maxCandidates = 5, maxFetches = 3 } = {}) {
    super();
    this.client = client || new HtmlScraperClient();
    this.maxCandidates = Math.max(1, maxCandidates);
    this.maxFetches = Math.max(1, maxFetches);
    this.searchHttp = searchHttp || axios.create({
      timeout: 20000,
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });
  }

  getSourceKey() {
    return "public_search";
  }

  async lookupByEan(ean, context = {}) {
    try {
      const normalizedEan = String(ean || "").trim();
      if (!normalizedEan) {
        return {
          key: this.getSourceKey(),
          result: null,
          detail: null,
          error: null,
        };
      }

      const rawName = pickFirstString(context.rawName);
      const candidates = await this.fetchCandidates(normalizedEan, rawName);
      const acceptedCandidate = this.pickAcceptedCandidate(candidates, rawName);

      if (!acceptedCandidate) {
        return {
          key: this.getSourceKey(),
          result: null,
          detail: null,
          error: null,
        };
      }

      const displayName = this.buildDisplayName(acceptedCandidate, rawName);

      return {
        key: this.getSourceKey(),
        result: {
          ean: normalizedEan,
          nome: displayName,
          nome_produto: displayName,
          nome_exibicao: displayName,
          produto: displayName,
          laboratorio: null,
          categoria: null,
          url: acceptedCandidate.url,
          raw: {
            source: this.getSourceKey(),
            score: acceptedCandidate.score,
            evidence: candidates.slice(0, this.maxCandidates).map((candidate) => ({
              title: candidate.title,
              url: candidate.url,
              score: candidate.score,
              accepted: candidate.accepted,
              ean_match: candidate.hasEanMatch,
            })),
          },
        },
        detail: {
          info: {
            produto: displayName,
          },
          raw: {
            source: this.getSourceKey(),
            accepted_candidate: {
              title: acceptedCandidate.title,
              url: acceptedCandidate.url,
              snippet: acceptedCandidate.snippet,
              page_title: acceptedCandidate.pageTitle,
              page_h1: acceptedCandidate.pageH1,
              score: acceptedCandidate.score,
              ean_match: acceptedCandidate.hasEanMatch,
            },
          },
        },
        error: null,
      };
    } catch (error) {
      return {
        key: this.getSourceKey(),
        result: null,
        detail: null,
        error: error.message,
      };
    }
  }

  async fetchCandidates(ean, rawName) {
    const queries = buildQueries(ean, rawName);
    const candidates = [];
    let fetches = 0;

    for (const query of queries) {
      const document = await this.fetchSearchDocument(query);
      const searchResults = document.$(".result").slice(0, this.maxCandidates).toArray();

      for (const element of searchResults) {
        const $result = document.$(element);
        const href = decodeDuckDuckGoUrl($result.find(".result__a").first().attr("href"));
        const title = trimText($result.find(".result__title").text(), 220);
        const snippet = trimText($result.find(".result__snippet").text(), 350);

        if (!href || !title) {
          continue;
        }

        const candidate = {
          query,
          title,
          snippet,
          url: href,
          pageTitle: null,
          pageH1: null,
          pageDescription: null,
          score: 0,
          hasEanMatch: false,
          accepted: false,
        };

        if (fetches < this.maxFetches && !/\.pdf($|\?)/i.test(href)) {
          fetches += 1;
          try {
            const page = await this.client.fetchDocument({ url: href });
            candidate.pageTitle = trimText(
              pickFirstString(
                page.$("title").first().text(),
                page.$('meta[property="og:title"]').attr("content"),
              ),
              220,
            );
            candidate.pageH1 = trimText(page.$("h1").first().text(), 220);
            candidate.pageDescription = trimText(
              pickFirstString(
                page.$('meta[name="description"]').attr("content"),
                page.$('meta[property="og:description"]').attr("content"),
              ),
              350,
            );
          } catch {
          }
        }

        const evidenceText = [
          candidate.title,
          candidate.snippet,
          candidate.pageTitle,
          candidate.pageH1,
          candidate.pageDescription,
          candidate.url,
        ].filter(Boolean).join(" | ");

        candidate.hasEanMatch = evidenceText.includes(ean);
        const overlapScore = getTokenOverlapScore(rawName, evidenceText);
        const dosageMatch = hasStrongDosageMatch(rawName, evidenceText);

        candidate.score += candidate.hasEanMatch ? 5 : 0;
        candidate.score += overlapScore >= 0.6 ? 3 : overlapScore >= 0.35 ? 2 : overlapScore >= 0.2 ? 1 : 0;
        candidate.score += dosageMatch ? 1 : 0;
        candidate.accepted = candidate.hasEanMatch && (overlapScore >= 0.35 || !rawName);
        candidates.push(candidate);
      }
    }

    return candidates
      .sort((left, right) => right.score - left.score)
      .slice(0, this.maxCandidates);
  }

  async fetchSearchDocument(query) {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await this.searchHttp.get(url);

    return {
      url,
      html: response.data,
      $: cheerio.load(response.data),
    };
  }

  pickAcceptedCandidate(candidates, rawName) {
    const acceptedCandidates = candidates.filter((candidate) => candidate.accepted);
    if (!acceptedCandidates.length) {
      return null;
    }

    return acceptedCandidates.find((candidate) => {
      const label = this.buildCandidateDisplayName(candidate);
      return isAcceptedDisplayLabel(label, rawName);
    })
      || null;
  }

  buildCandidateDisplayName(candidate) {
    const preferredValues = [
      candidate.pageH1,
      cleanupTitle(candidate.title),
      cleanupTitle(candidate.pageTitle),
      extractProductNameFromSnippet(candidate.snippet),
      candidate.title,
    ];

    for (const value of preferredValues) {
      const label = buildNormalizedProductLabel(value);
      if (!label) {
        continue;
      }

      return label;
    }

    return buildNormalizedProductLabel(candidate.title);
  }

  buildDisplayName(candidate, rawName) {
    const label = this.buildCandidateDisplayName(candidate);
    if (isAcceptedDisplayLabel(label, rawName)) {
      return label;
    }

    return null;
  }
}

export { PublicSearchLookupSource };
