import express from "express";
import { PORTS, SERVICES } from "../common/config.js";
import { jsonRequest, requireAuthHeader } from "../common/http.js";

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  return next();
});

async function authenticate(req, res, next) {
  if (req.path === "/health" || req.path === "/auth/login" || req.path === "/auth/register" || req.path === "/auth/people")
    return next();

  const token = requireAuthHeader(req, res);
  if (!token) return;

  const authResp = await jsonRequest(`${SERVICES.profile}/auth/validate`, {
    method: "POST",
    body: JSON.stringify({ token })
  });

  if (!authResp.ok || !authResp.body.valid) {
    return res.status(401).json({ error: "Invalid token" });
  }

  req.user = { user_id: authResp.body.user_id };
  return next();
}

app.use(authenticate);

app.get("/health", (_, res) => res.json({ ok: true, service: "gateway" }));

app.post("/auth/login", async (req, res) => {
  const response = await jsonRequest(`${SERVICES.profile}/auth/login`, {
    method: "POST",
    body: JSON.stringify({ email: req.body.email, password: req.body.password })
  });
  res.status(response.status).json(response.body);
});

app.post("/auth/register", async (req, res) => {
  const response = await jsonRequest(`${SERVICES.profile}/auth/register`, {
    method: "POST",
    body: JSON.stringify(req.body)
  });
  res.status(response.status).json(response.body);
});

app.get("/auth/people", async (_, res) => {
  const response = await jsonRequest(`${SERVICES.profile}/auth/people`);
  res.status(response.status).json(response.body);
});

app.get("/profile/me", async (req, res) => {
  const response = await jsonRequest(`${SERVICES.profile}/profiles/${req.user.user_id}`);
  res.status(response.status).json(response.body);
});

app.put("/profile/me", async (req, res) => {
  const response = await jsonRequest(`${SERVICES.profile}/profiles/${req.user.user_id}`, {
    method: "PUT",
    body: JSON.stringify(req.body)
  });
  res.status(response.status).json(response.body);
});

app.get("/recommendations", async (req, res) => {
  const limit = Number(req.query.limit || 20);
  const response = await jsonRequest(
    `${SERVICES.recommendation}/recommendations?user_id=${encodeURIComponent(req.user.user_id)}&limit=${limit}`
  );
  res.status(response.status).json(response.body);
});

app.post("/swipes", async (req, res) => {
  const response = await jsonRequest(`${SERVICES.matches}/swipes`, {
    method: "POST",
    body: JSON.stringify({
      from_user_id: req.user.user_id,
      to_user_id: req.body.to_user_id,
      direction: req.body.direction
    })
  });
  res.status(response.status).json(response.body);
});

app.get("/matches", async (req, res) => {
  const response = await jsonRequest(`${SERVICES.matches}/matches/${req.user.user_id}`);
  res.status(response.status).json(response.body);
});

app.post("/images", async (req, res) => {
  const response = await jsonRequest(`${SERVICES.image}/users/${req.user.user_id}/images`, {
    method: "POST",
    body: JSON.stringify(req.body)
  });
  res.status(response.status).json(response.body);
});

app.get("/images", async (req, res) => {
  const response = await jsonRequest(`${SERVICES.image}/users/${req.user.user_id}/images`);
  res.status(response.status).json(response.body);
});

app.get("/chat/ws-info", (_, res) => {
  res.json({ ws_url: `ws://localhost:${PORTS.messaging}/ws?user_id={{user_id_from_token}}` });
});

app.get("/chat/history/:otherUserId", async (req, res) => {
  const response = await jsonRequest(
    `${SERVICES.messaging}/messages/${encodeURIComponent(req.user.user_id)}/${encodeURIComponent(req.params.otherUserId)}`
  );
  res.status(response.status).json(response.body);
});

app.listen(PORTS.gateway, () => {
  console.log(`Gateway listening on ${PORTS.gateway}`);
});
