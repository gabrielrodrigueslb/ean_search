function diffObjects(current, suggested) {
  const keys = new Set([
    ...Object.keys(current || {}),
    ...Object.keys(suggested || {}),
  ]);

  const diffs = [];

  for (const key of keys) {
    const currentValue = current?.[key] ?? null;
    const suggestedValue = suggested?.[key] ?? null;

    if (JSON.stringify(currentValue) !== JSON.stringify(suggestedValue)) {
      diffs.push({
        campo: key,
        atual: currentValue,
        sugerido: suggestedValue,
      });
    }
  }

  return diffs;
}

module.exports = { diffObjects };
