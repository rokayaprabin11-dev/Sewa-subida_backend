// server.js — GreenScape API
// Routes consumed by admin.html:
//   POST   /api/login
//   GET    /api/gallery
//   POST   /api/gallery
//   PATCH  /api/gallery/:id
//   DELETE /api/gallery/:id
//   GET    /api/pricing
//   POST   /api/pricing
//   PATCH  /api/pricing/:id
//   DELETE /api/pricing/:id

require("dotenv").config();

const express = require("express");
const cors    = require("cors");
const jwt     = require("jsonwebtoken");
const { Pool } = require("pg");

const app  = express();
const PORT = process.env.PORT || 8080;

// ─── DATABASE ─────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // required for Railway
});

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: "*", // tighten this to your domain after deployment
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json());

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing token" });
  }
  const token = header.slice(7);
  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
// POST /api/login  { password }  → { token }
app.post("/api/login", (req, res) => {
  const { password } = req.body;
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Incorrect password" });
  }
  const token = jwt.sign({ role: "admin" }, process.env.JWT_SECRET, { expiresIn: "8h" });
  res.json({ token });
});

// ─── GALLERY ──────────────────────────────────────────────────────────────────

// GET /api/gallery  — public (portfolio.html reads this)
app.get("/api/gallery", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM gallery ORDER BY sort_order ASC, id ASC"
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/gallery  — admin only
app.post("/api/gallery", requireAuth, async (req, res) => {
  const { title, cat, description, service, duration, location, budget, height, bg, image, sort_order } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO gallery (title, cat, description, service, duration, location, budget, height, bg, image, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [title, cat, description, service, duration, location, budget, height, bg, image, sort_order ?? 0]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/gallery/:id  — admin only
app.patch("/api/gallery/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const fields = req.body;
  const allowed = ["title", "cat", "description", "service", "duration", "location", "budget", "height", "bg", "image", "sort_order"];
  const updates = Object.keys(fields).filter(k => allowed.includes(k));
  if (updates.length === 0) return res.status(400).json({ error: "No valid fields to update" });

  const setClauses = updates.map((k, i) => `${k} = $${i + 1}`).join(", ");
  const values     = updates.map(k => fields[k]);
  values.push(id);

  try {
    const { rows } = await pool.query(
      `UPDATE gallery SET ${setClauses} WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/gallery/:id  — admin only
app.delete("/api/gallery/:id", requireAuth, async (req, res) => {
  try {
    await pool.query("DELETE FROM gallery WHERE id = $1", [req.params.id]);
    res.status(204).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── PRICING ──────────────────────────────────────────────────────────────────

// GET /api/pricing  — public (services.html reads this)
app.get("/api/pricing", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM pricing ORDER BY sort_order ASC, id ASC"
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/pricing  — admin only
app.post("/api/pricing", requireAuth, async (req, res) => {
  const { name, icon, description, price, period, note, popular, cta_style, features, sort_order } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO pricing (name, icon, description, price, period, note, popular, cta_style, features, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [name, icon, description, price, period, note, popular ?? false, cta_style ?? "outline", JSON.stringify(features ?? []), sort_order ?? 0]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/pricing/:id  — admin only
app.patch("/api/pricing/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const fields  = req.body;
  const allowed = ["name", "icon", "description", "price", "period", "note", "popular", "cta_style", "features", "sort_order"];
  const updates = Object.keys(fields).filter(k => allowed.includes(k));
  if (updates.length === 0) return res.status(400).json({ error: "No valid fields to update" });

  const setClauses = updates.map((k, i) => {
    // Cast features to JSONB explicitly
    return k === "features" ? `${k} = $${i + 1}::jsonb` : `${k} = $${i + 1}`;
  }).join(", ");
  const values = updates.map(k => k === "features" ? JSON.stringify(fields[k]) : fields[k]);
  values.push(id);

  try {
    const { rows } = await pool.query(
      `UPDATE pricing SET ${setClauses} WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/pricing/:id  — admin only
app.delete("/api/pricing/:id", requireAuth, async (req, res) => {
  try {
    await pool.query("DELETE FROM pricing WHERE id = $1", [req.params.id]);
    res.status(204).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "connected" });
  } catch (e) {
    res.status(500).json({ status: "error", db: e.message });
  }
});

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ GreenScape API running on http://localhost:${PORT}`);
  console.log(`   DB: ${process.env.DATABASE_URL?.slice(0, 40)}...`);
});
