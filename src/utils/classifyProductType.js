import { normalizeText } from "./normalizeText.js";
const COMMERCIAL_PERFUMARIA_KEYWORDS = [
  "polvilho",
  "talco",
  "shampoo",
  "condicionador",
  "sabonete",
  "sabonete liquido",
  "creme dental",
  "escova dental",
  "fio dental",
  "desodorante",
  "antitranspirante",
  "protetor solar",
  "hidratante",
  "oleo corporal",
  "lenco umedecido",
  "lencos umedecidos",
  "fralda",
  "absorvente",
  "cotonete",
  "cosmetico",
  "perfume",
];

const PERFUMARIA_CONTEXT_KEYWORDS = [
  "perfum",
  "higiene",
  "cosmet",
  "dermocosmet",
  "cuidados pessoais",
];

function containsAnyKeyword(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function classifyProductType({ raw = {}, ptResult = null, searchResult = null, detail = null } = {}) {
  const info = detail?.info || {};
  const joinedText = normalizeText([
    raw.tipo,
    raw.categoria,
    raw.departamento,
    raw.grupo,
    raw.nome,
    raw.nome_produto,
    raw.nome_exibicao,
    raw.nome_trier,
    raw.nome_exibicao_trier,
    ptResult?.nome,
    searchResult?.produto,
    searchResult?.apresentacao,
    searchResult?.laboratorio,
    info.produto,
    info.apresentacao,
    info.classe,
    info.categoria,
    info.forma_farmaceutica,
    info.tarja,
    info.tipo_receita,
    info.receita,
  ].filter(Boolean).join(" "));

  if (containsAnyKeyword(joinedText, COMMERCIAL_PERFUMARIA_KEYWORDS)) {
    return "perfumaria";
  }

  if (containsAnyKeyword(joinedText, PERFUMARIA_CONTEXT_KEYWORDS)) {
    return "perfumaria";
  }

  const incomingType = normalizeText(raw.tipo || raw.categoria || raw.departamento);
  if (incomingType.includes("medic")) {
    return "medicamento";
  }

  if (searchResult || detail?.info?.medicamentoid) {
    return "medicamento";
  }

  if (ptResult) {
    return incomingType === "outro" || !incomingType ? "perfumaria" : normalizeTipo(raw.tipo || raw.categoria || raw.departamento);
  }

  return normalizeTipo(raw.tipo || raw.categoria || raw.departamento);
}

function normalizeTipo(value) {
  const normalized = normalizeText(value);

  if (normalized.includes("medic")) {
    return "medicamento";
  }

  if (
    normalized.includes("perfum") ||
    normalized.includes("higiene") ||
    normalized.includes("cosmet")
  ) {
    return "perfumaria";
  }

  return "outro";
}

export { classifyProductType, normalizeTipo, };