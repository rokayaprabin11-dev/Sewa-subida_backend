// api/health.js  →  GET /api/health
const { getPool, setCors } = require("./_lib");

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    await getPool().query("SELECT 1");
    return res.status(200).json({ status: "ok", db: "connected" });
  } catch (e) {
    return res.status(500).json({ status: "error", db: e.message });
  }
};
