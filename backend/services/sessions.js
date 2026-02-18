import express from "express";
import { PORTS } from "../common/config.js";
import { redis } from "../common/redis.js";
import { waitFor } from "../common/startup.js";

const app = express();
app.use(express.json({ limit: "2mb" }));

function sessionKey(userId) {
  return `session:${userId}`;
}

async function bootstrap() {
  await waitFor("redis", async () => {
    await redis.ping();
  });
}

app.get("/health", (_, res) => res.json({ ok: true, service: "sessions" }));

app.post("/sessions/connect", async (req, res) => {
  const { user_id, connection_id, server_node } = req.body;
  if (!user_id || !connection_id) {
    return res.status(400).json({ error: "user_id and connection_id required" });
  }

  const entry = {
    user_id,
    connection_id,
    server_node: server_node || "messaging-local",
    last_heartbeat: new Date().toISOString()
  };

  await redis.set(sessionKey(user_id), JSON.stringify(entry), "EX", 24 * 3600);
  return res.status(201).json({ ok: true });
});

app.post("/sessions/disconnect", async (req, res) => {
  const { user_id } = req.body;
  if (user_id) {
    await redis.del(sessionKey(user_id));
  }
  res.json({ ok: true });
});

app.get("/sessions/:userId", async (req, res) => {
  const raw = await redis.get(sessionKey(req.params.userId));
  if (!raw) {
    return res.status(404).json({ online: false });
  }
  return res.json({ online: true, ...JSON.parse(raw) });
});

bootstrap()
  .then(() => {
    app.listen(PORTS.sessions, () => {
      console.log(`Sessions service listening on ${PORTS.sessions}`);
    });
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
