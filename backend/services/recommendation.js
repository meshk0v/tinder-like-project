import express from "express";
import { PORTS, SERVICES } from "../common/config.js";
import { jsonRequest } from "../common/http.js";

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_, res) => res.json({ ok: true, service: "recommendation" }));

app.get("/recommendations", async (req, res) => {
  const { user_id, limit = 20 } = req.query;
  if (!user_id) {
    return res.status(400).json({ error: "user_id required" });
  }

  const meResp = await jsonRequest(`${SERVICES.profile}/profiles/${user_id}`);
  if (!meResp.ok) {
    return res.status(404).json({ error: "profile not found" });
  }

  const allResp = await jsonRequest(`${SERVICES.profile}/profiles`);
  if (!allResp.ok) {
    return res.status(502).json({ error: "failed to load candidate pool" });
  }

  const me = meResp.body;
  const candidates = allResp.body.items
    .filter((p) => p.user_id !== user_id)
    .filter((p) => p.location_cell === me.location_cell)
    .filter((p) => !me.interested_in || p.gender === me.interested_in)
    .slice(0, Number(limit));

  return res.json({ user_id, items: candidates });
});

app.listen(PORTS.recommendation, () => {
  console.log(`Recommendation service listening on ${PORTS.recommendation}`);
});
