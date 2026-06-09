function hasLookupSourceErrors(fontesConsultadas = {}) {
  return Object.entries(fontesConsultadas || {}).some(([key, value]) => (
    /_busca_error$/.test(key) && typeof value === "string" && value.trim()
  ));
}

export { hasLookupSourceErrors };
