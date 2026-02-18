import express from "express";
import { WebSocketServer } from "ws";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { PORTS, SERVICES } from "../common/config.js";
import { jsonRequest } from "../common/http.js";
import { query } from "../common/db.js";
import { waitFor } from "../common/startup.js";

const app = express();
app.use(express.json({ limit: "2mb" }));

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

const liveByUser = new Map();

app.get("/health", (_, res) => res.json({ ok: true, service: "messaging" }));

app.get("/messages/:userA/:userB", async (req, res) => {
  const { userA, userB } = req.params;
  const result = await query(
    `SELECT message_id, from_user_id, to_user_id, body, sent_at
     FROM messages
     WHERE (from_user_id = $1 AND to_user_id = $2)
        OR (from_user_id = $2 AND to_user_id = $1)
     ORDER BY sent_at ASC`,
    [userA, userB]
  );
  res.json({ items: result.rows.map((row) => ({ type: "message", ...row })) });
});

wss.on("connection", async (ws, req) => {
  const url = new URL(req.url, `http://localhost:${PORTS.messaging}`);
  const userId = url.searchParams.get("user_id");

  if (!userId) {
    ws.close(1008, "Missing user_id");
    return;
  }

  const connectionId = randomUUID();
  liveByUser.set(userId, ws);

  ws.on("message", async (raw) => {
    let payload;
    try {
      payload = JSON.parse(raw.toString("utf8"));
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "invalid json" }));
      return;
    }

    if (payload.type !== "send_message") {
      ws.send(JSON.stringify({ type: "error", message: "unsupported type" }));
      return;
    }

    const { to_user_id, body } = payload;
    if (!to_user_id || !body) {
      ws.send(JSON.stringify({ type: "error", message: "to_user_id and body required" }));
      return;
    }

    const matchResp = await jsonRequest(
      `${SERVICES.matches}/matches/exists?u1=${encodeURIComponent(userId)}&u2=${encodeURIComponent(to_user_id)}`
    );

    if (!matchResp.ok || !matchResp.body.matched) {
      ws.send(JSON.stringify({ type: "rejected", reason: "users are not matched" }));
      return;
    }

    const messageId = randomUUID();
    const sentAt = new Date().toISOString();
    await query(
      "INSERT INTO messages (message_id, from_user_id, to_user_id, body, sent_at) VALUES ($1,$2,$3,$4,$5)",
      [messageId, userId, to_user_id, body, sentAt]
    );

    const event = {
      type: "message",
      message_id: messageId,
      from_user_id: userId,
      to_user_id,
      body,
      sent_at: sentAt
    };

    ws.send(JSON.stringify({ type: "ack", message_id: messageId }));

    const sessionResp = await jsonRequest(`${SERVICES.sessions}/sessions/${to_user_id}`);
    if (sessionResp.ok && sessionResp.body.online) {
      const target = liveByUser.get(to_user_id);
      if (target && target.readyState === target.OPEN) {
        target.send(JSON.stringify(event));
      }
    }
  });

  ws.on("close", async () => {
    liveByUser.delete(userId);
    await jsonRequest(`${SERVICES.sessions}/sessions/disconnect`, {
      method: "POST",
      body: JSON.stringify({ user_id: userId })
    });
  });

  await jsonRequest(`${SERVICES.sessions}/sessions/connect`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId, connection_id: connectionId, server_node: "messaging-local" })
  });

  ws.send(JSON.stringify({ type: "connected", user_id: userId, connection_id: connectionId }));
});

async function bootstrap() {
  await waitFor("messages schema", async () => {
    await query("SELECT 1 FROM messages LIMIT 1");
  });
}

bootstrap()
  .then(() => {
    httpServer.listen(PORTS.messaging, () => {
      console.log(`Messaging service listening on ${PORTS.messaging}`);
    });
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
