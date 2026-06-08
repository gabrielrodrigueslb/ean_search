const { Pool } = require("pg");

const { config } = require("./config");

const poolConfig = {
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
};

if (config.database.connectionString) {
  poolConfig.connectionString = config.database.connectionString;
} else {
  poolConfig.host = config.database.host;
  poolConfig.port = config.database.port;
  poolConfig.database = config.database.database;
  poolConfig.user = config.database.user;
  poolConfig.password = config.database.password;
}

const pool = new Pool(poolConfig);

async function closePool() {
  await pool.end();
}

module.exports = {
  pool,
  closePool,
};
