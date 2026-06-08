const { pool } = require("../../db");

async function getHealthStatus() {
  await pool.query("SELECT 1");

  return {
    status: "ok",
  };
}

module.exports = {
  getHealthStatus,
};
