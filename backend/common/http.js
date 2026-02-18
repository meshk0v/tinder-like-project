export async function jsonRequest(url, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const response = await fetch(url, { ...options, headers });
  const text = await response.text();

  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }

  return { ok: response.ok, status: response.status, body };
}

export function requireAuthHeader(req, res) {
  const value = req.header("authorization") || "";
  if (!value.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing bearer token" });
    return null;
  }
  return value.slice(7).trim();
}
