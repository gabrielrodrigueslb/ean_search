function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function computeCheckDigit(base) {
  let sum = 0;
  for (let index = 0; index < base.length; index += 1) {
    const digit = Number(base[index]);
    const weight = index % 2 === 0 ? 1 : 3;
    sum += digit * weight;
  }
  return (10 - (sum % 10)) % 10;
}

function validateEAN(value) {
  const ean = onlyDigits(value);

  if (![8, 12, 13, 14].includes(ean.length)) {
    return { isValid: false, ean, reason: "EAN deve ter 8, 12, 13 ou 14 digitos." };
  }

  const body = ean.slice(0, -1);
  const checkDigit = Number(ean.slice(-1));
  const expected = computeCheckDigit(body);

  if (checkDigit !== expected) {
    return { isValid: false, ean, reason: "Digito verificador invalido." };
  }

  return { isValid: true, ean, reason: null };
}

module.exports = { validateEAN, onlyDigits };
