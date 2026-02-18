import express from "express";
import { PORTS } from "../common/config.js";
import { query } from "../common/db.js";
import { waitFor } from "../common/startup.js";

const app = express();
app.use(express.json({ limit: "2mb" }));


app.get("/health", (_, res) => res.json({ ok: true, service: "matches" }));

app.post("/swipes", async (req, res) => {
  const { from_user_id, to_user_id, direction } = req.body;
  if (!from_user_id || !to_user_id || !direction) {
    return res.status(400).json({ error: "from_user_id, to_user_id, direction required" });
  }

  await query(
    `INSERT INTO swipes (from_user_id, to_user_id, direction)
     VALUES ($1, $2, $3)
     ON CONFLICT (from_user_id, to_user_id)
     DO UPDATE SET direction = EXCLUDED.direction, swiped_at = NOW()`,
    [from_user_id, to_user_id, direction]
  );

  if (direction !== "right") {
    return res.json({ matched: false, reason: "left swipe" });
  }

  const reverse = await query(
    `SELECT 1 FROM swipes
     WHERE from_user_id = $1 AND to_user_id = $2 AND direction = 'right'`,
    [to_user_id, from_user_id]
  );

  if (reverse.rowCount > 0) {
    await query(
      `INSERT INTO matches (user_id, matched_user_id)
       VALUES ($1,$2),($2,$1)
       ON CONFLICT (user_id, matched_user_id) DO NOTHING`,
      [from_user_id, to_user_id]
    );
    return res.json({ matched: true, users: [from_user_id, to_user_id] });
  }

  return res.json({ matched: false });
});

app.get("/matches/exists", async (req, res) => {
  const { u1, u2 } = req.query;
  if (!u1 || !u2) {
    return res.status(400).json({ error: "u1 and u2 required" });
  }

  const result = await query(
    "SELECT 1 FROM matches WHERE user_id = $1 AND matched_user_id = $2",
    [String(u1), String(u2)]
  );

  res.json({ matched: result.rowCount > 0 });
});

app.get("/matches/:userId", async (req, res) => {
  const result = await query(
    "SELECT matched_user_id FROM matches WHERE user_id = $1 ORDER BY matched_at DESC",
    [req.params.userId]
  );
  res.json({ user_id: req.params.userId, matches: result.rows.map((r) => r.matched_user_id) });
});

async function bootstrap() {
  await waitFor("matches schema", async () => {
    await query("SELECT 1 FROM swipes LIMIT 1");
    await query("SELECT 1 FROM matches LIMIT 1");
  });
}

bootstrap()
  .then(() => {
    app.listen(PORTS.matches, () => {
      console.log(`Matches service listening on ${PORTS.matches}`);
    });
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
