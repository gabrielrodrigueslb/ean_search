function serializeMeta(meta) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return "";
  }

  const filtered = Object.entries(meta).reduce((acc, [key, value]) => {
    if (value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {});

  if (!Object.keys(filtered).length) {
    return "";
  }

  return ` ${JSON.stringify(filtered)}`;
}

function log(level, message, meta) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level}] ${message}${serializeMeta(meta)}`;

  if (level === "ERROR") {
    console.error(line);
    return;
  }

  if (level === "WARN") {
    console.warn(line);
    return;
  }

  console.log(line);
}

const logger = {
  info(message, meta) {
    log("INFO", message, meta);
  },
  warn(message, meta) {
    log("WARN", message, meta);
  },
  error(message, meta) {
    log("ERROR", message, meta);
  },
};

module.exports = { logger };
