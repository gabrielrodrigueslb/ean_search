const { getHealthStatus } = require("../modules/health/health.service");

async function getHealth(_req, res) {
  const healthStatus = await getHealthStatus();
  res.json(healthStatus);
}

module.exports = {
  getHealth,
};
