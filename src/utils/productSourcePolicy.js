const DEFAULT_TRUSTED_NAME_SOURCES = ["convertize", "drogasil"];
const DEFAULT_PREFERRED_NAME_SOURCES = ["convertize", "drogasil"];
const DEFAULT_PREFERRED_DATA_SOURCES = ["convertize", "drogasil"];
const DEFAULT_PASS_THROUGH_SOURCES = ["vtex"];

const SOURCE_LABELS = {
  convertize: "Convertize",
  drogasil: "Drogasil",
  farmaindex: "FarmaIndex",
  openai_web: "OpenAI Web",
  vtex: "VTEX",
};

function normalizeSourceKey(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeSourceKeys(values = []) {
  return Array.from(new Set(
    values
      .map((value) => normalizeSourceKey(value))
      .filter(Boolean),
  ));
}

function includesSource(sourceList = [], source) {
  const normalizedSource = normalizeSourceKey(source);
  if (!normalizedSource) {
    return false;
  }

  return normalizeSourceKeys(sourceList).includes(normalizedSource);
}

function isTrustedNameSource(source, trustedSources = DEFAULT_TRUSTED_NAME_SOURCES) {
  return includesSource(trustedSources, source);
}

function isPassThroughSource(source, passThroughSources = DEFAULT_PASS_THROUGH_SOURCES) {
  return includesSource(passThroughSources, source);
}

function isPublishableNameSource(
  source,
  {
    trustedSources = DEFAULT_TRUSTED_NAME_SOURCES,
    passThroughSources = DEFAULT_PASS_THROUGH_SOURCES,
  } = {},
) {
  return isTrustedNameSource(source, trustedSources)
    || isPassThroughSource(source, passThroughSources);
}

function formatSourceLabel(source) {
  const normalizedSource = normalizeSourceKey(source);

  if (!normalizedSource) {
    return "fonte desconhecida";
  }

  if (SOURCE_LABELS[normalizedSource]) {
    return SOURCE_LABELS[normalizedSource];
  }

  return normalizedSource
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((token) => token[0].toUpperCase() + token.slice(1))
    .join(" ");
}

function formatSourceList(sources = []) {
  const labels = normalizeSourceKeys(sources).map((source) => formatSourceLabel(source));

  if (!labels.length) {
    return "fontes externas";
  }

  if (labels.length === 1) {
    return labels[0];
  }

  if (labels.length === 2) {
    return `${labels[0]} ou ${labels[1]}`;
  }

  return `${labels.slice(0, -1).join(", ")} ou ${labels[labels.length - 1]}`;
}

export {
  DEFAULT_PASS_THROUGH_SOURCES,
  DEFAULT_PREFERRED_DATA_SOURCES,
  DEFAULT_PREFERRED_NAME_SOURCES,
  DEFAULT_TRUSTED_NAME_SOURCES,
  formatSourceLabel,
  formatSourceList,
  isPassThroughSource,
  isPublishableNameSource,
  isTrustedNameSource,
  normalizeSourceKey,
  normalizeSourceKeys,
};
