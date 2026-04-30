const { normalizeText } = require("./normalizeText");

function slugify(value) {
  return normalizeText(value).replace(/\s+/g, "-");
}

module.exports = { slugify };
