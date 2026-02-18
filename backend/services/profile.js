import express from "express";
import { createHash, randomUUID } from "node:crypto";
import { PORTS } from "../common/config.js";
import { query } from "../common/db.js";
import { waitFor } from "../common/startup.js";

const app = express();
app.use(express.json({ limit: "2mb" }));

function hashPassword(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function newToken(userId) {
  return `tkn_${userId}_${randomUUID()}`;
}

function newUserId() {
  return `u_${randomUUID().slice(0, 12)}`;
}


app.get("/health", (_, res) => res.json({ ok: true, service: "profile" }));

app.get("/auth/people", async (_, res) => {
  const result = await query("SELECT user_id, name, age, gender, location_cell, bio FROM profiles ORDER BY user_id");
  res.json({ total_count: result.rowCount, items: result.rows });
});

app.post("/auth/register", async (req, res) => {
  const { email, password, name, age, gender, interested_in, location_cell, bio } = req.body;

  if (!email || !password || !name || !age || !gender || !location_cell) {
    return res.status(400).json({ error: "email, password, name, age, gender, location_cell required" });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const exists = await query("SELECT 1 FROM auth_users WHERE email = $1", [normalizedEmail]);
  if (exists.rowCount > 0) {
    return res.status(409).json({ error: "email already exists" });
  }

  const userId = newUserId();

  await query(
    `INSERT INTO profiles (user_id, name, age, gender, interested_in, location_cell, bio)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      userId,
      String(name).trim(),
      Number(age),
      String(gender).trim(),
      interested_in ? String(interested_in).trim() : null,
      String(location_cell).trim(),
      bio ? String(bio).trim() : ""
    ]
  );

  await query("INSERT INTO auth_users (user_id, email, password_hash) VALUES ($1,$2,$3)", [
    userId,
    normalizedEmail,
    hashPassword(password)
  ]);

  const token = newToken(userId);
  await query("INSERT INTO auth_tokens (token, user_id) VALUES ($1,$2)", [token, userId]);

  return res.status(201).json({ token, user_id: userId });
});

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "email and password required" });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const result = await query("SELECT user_id, password_hash FROM auth_users WHERE email = $1", [normalizedEmail]);

  if (result.rowCount === 0 || result.rows[0].password_hash !== hashPassword(password)) {
    return res.status(401).json({ error: "invalid credentials" });
  }

  const userId = result.rows[0].user_id;
  const token = newToken(userId);
  await query("INSERT INTO auth_tokens (token, user_id) VALUES ($1,$2)", [token, userId]);

  return res.json({ token, user_id: userId });
});

app.post("/auth/validate", async (req, res) => {
  const { token } = req.body;
  const result = await query("SELECT user_id FROM auth_tokens WHERE token = $1", [token]);
  if (result.rowCount === 0) {
    return res.status(401).json({ valid: false });
  }
  return res.json({ valid: true, user_id: result.rows[0].user_id });
});

app.get("/profiles/:userId", async (req, res) => {
  const result = await query("SELECT * FROM profiles WHERE user_id = $1", [req.params.userId]);
  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Not found" });
  }
  return res.json(result.rows[0]);
});

app.put("/profiles/:userId", async (req, res) => {
  const existing = await query("SELECT * FROM profiles WHERE user_id = $1", [req.params.userId]);
  const current = existing.rowCount > 0 ? existing.rows[0] : null;
  const merged = {
    name: req.body.name ?? current?.name ?? "User",
    age: req.body.age ?? current?.age ?? 25,
    gender: req.body.gender ?? current?.gender ?? "other",
    interested_in: req.body.interested_in ?? current?.interested_in ?? null,
    location_cell: req.body.location_cell ?? current?.location_cell ?? "unknown",
    bio: req.body.bio ?? current?.bio ?? ""
  };

  await query(
    `INSERT INTO profiles (user_id, name, age, gender, interested_in, location_cell, bio)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id)
     DO UPDATE SET
       name = EXCLUDED.name,
       age = EXCLUDED.age,
       gender = EXCLUDED.gender,
       interested_in = EXCLUDED.interested_in,
       location_cell = EXCLUDED.location_cell,
       bio = EXCLUDED.bio`,
    [
      req.params.userId,
      merged.name,
      merged.age,
      merged.gender,
      merged.interested_in,
      merged.location_cell,
      merged.bio
    ]
  );

  const updated = await query("SELECT * FROM profiles WHERE user_id = $1", [req.params.userId]);
  return res.json(updated.rows[0]);
});

app.get("/profiles", async (_, res) => {
  const result = await query("SELECT * FROM profiles ORDER BY user_id");
  res.json({ items: result.rows });
});

async function bootstrap() {
  await waitFor("profile schema", async () => {
    await query("SELECT 1 FROM profiles LIMIT 1");
    await query("SELECT 1 FROM auth_users LIMIT 1");
    await query("SELECT 1 FROM auth_tokens LIMIT 1");
  });
}

bootstrap()
  .then(() => {
    app.listen(PORTS.profile, () => {
      console.log(`Profile service listening on ${PORTS.profile}`);
    });
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
