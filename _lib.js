// api/_lib.js
// Shared database pool, auth helper and CORS helper
// used by all Vercel serverless functions

const { Pool } = require("pg");
const jwt      = require("jsonwebtoken");

// ── DB pool (reused across warm invocations) ──────────────────────────────────
let pool;
function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }, // required for Railway
      max: 5,
    });
  }
  return pool;
}

// ── CORS headers ──────────────────────────────────────────────────────────────
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
}

// ── Auth check ────────────────────────────────────────────────────────────────
function verifyAuth(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) throw new Error("Missing token");
  const token = header.slice(7);
  return jwt.verify(token, process.env.JWT_SECRET); // throws if invalid
}

module.exports = { getPool, setCors, verifyAuth };
