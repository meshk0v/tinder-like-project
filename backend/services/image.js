import express from "express";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { PORTS } from "../common/config.js";
import { query } from "../common/db.js";
import { waitFor } from "../common/startup.js";
import { ensureBucket, putObject, deleteObject, objectUrl } from "../common/s3.js";

const app = express();
app.use(express.json({ limit: "10mb" }));

function colorFor(value) {
  const palette = [
    "#ff4a72",
    "#ff8a4c",
    "#a78bfa",
    "#7dd3fc",
    "#6ee7b7",
    "#fca5a5",
    "#c4b5fd",
    "#fdba74"
  ];
  const digest = createHash("sha1").update(value).digest("hex");
  const idx = Number.parseInt(digest.slice(0, 2), 16) % palette.length;
  return palette[idx];
}

function makeSvgPhoto(label, c1, c2) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1300" viewBox="0 0 900 1300">\n<defs>\n<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">\n<stop offset="0%" stop-color="${c1}"/>\n<stop offset="100%" stop-color="${c2}"/>\n</linearGradient>\n</defs>\n<rect width="900" height="1300" fill="url(#g)"/>\n<circle cx="450" cy="470" r="170" fill="rgba(255,255,255,0.26)"/>\n<rect x="220" y="700" width="460" height="330" rx="36" fill="rgba(255,255,255,0.18)"/>\n<text x="450" y="920" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="88" fill="#ffffff" font-weight="700">${label}</text>\n</svg>`;
}

async function seedImages() {
  const profiles = await query(
    "SELECT user_id, name FROM profiles WHERE user_id ~ '^u[0-9]+$' ORDER BY CAST(SUBSTRING(user_id FROM 2) AS INT) LIMIT 100"
  );
  const counts = await query("SELECT user_id, COUNT(*)::INT AS count FROM images GROUP BY user_id");
  const countMap = new Map(counts.rows.map((r) => [r.user_id, r.count]));

  for (const profile of profiles.rows) {
    const current = countMap.get(profile.user_id) || 0;
    if (current >= 2) continue;

    for (let n = current + 1; n <= 2; n += 1) {
      const imageId = `seed-${profile.user_id}-${n}`;
      const objectKey = `${profile.user_id}/${imageId}.svg`;
      const c1 = colorFor(`${profile.user_id}:${n}:1`);
      const c2 = colorFor(`${profile.user_id}:${n}:2`);
      const initials = (profile.name || profile.user_id || "U")
        .split(" ")
        .map((x) => x[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase();
      const body = Buffer.from(makeSvgPhoto(initials || "U", c1, c2), "utf8");

      await putObject({ key: objectKey, body, contentType: "image/svg+xml" });
      await query(
        `INSERT INTO images (image_id, user_id, object_key, object_url, mime_type)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (image_id) DO NOTHING`,
        [imageId, profile.user_id, objectKey, objectUrl(objectKey), "image/svg+xml"]
      );
    }
  }
}

async function bootstrap() {
  await waitFor("postgres", async () => {
    await query("SELECT 1");
  });

  await waitFor("image schema", async () => {
    await query("SELECT 1 FROM profiles LIMIT 1");
    await query("SELECT 1 FROM images LIMIT 1");
  });

  await waitFor("minio", async () => {
    await ensureBucket();
  });

  await seedImages();
}

app.get("/health", (_, res) => res.json({ ok: true, service: "image" }));

app.post("/users/:userId/images", async (req, res) => {
  const { filename = "image.jpg", content_base64, mime_type = "image/jpeg" } = req.body;
  if (!content_base64) {
    return res.status(400).json({ error: "content_base64 is required" });
  }

  const imageId = randomUUID();
  const userId = req.params.userId;
  const ext = path.extname(filename) || ".jpg";
  const objectKey = `${userId}/${imageId}${ext}`;
  const data = Buffer.from(content_base64, "base64");

  await putObject({ key: objectKey, body: data, contentType: mime_type });
  const url = objectUrl(objectKey);

  await query(
    `INSERT INTO images (image_id, user_id, object_key, object_url, mime_type)
     VALUES ($1,$2,$3,$4,$5)`,
    [imageId, userId, objectKey, url, mime_type]
  );

  return res.status(201).json({
    image_id: imageId,
    user_id: userId,
    object_url: url,
    mime_type,
    created_at: new Date().toISOString()
  });
});

app.get("/users/:userId/images", async (req, res) => {
  const result = await query(
    "SELECT image_id, user_id, object_url, mime_type, created_at FROM images WHERE user_id = $1 ORDER BY created_at ASC",
    [req.params.userId]
  );
  res.json({ items: result.rows });
});

app.delete("/users/:userId/images/:imageId", async (req, res) => {
  const result = await query(
    "SELECT object_key FROM images WHERE user_id = $1 AND image_id = $2",
    [req.params.userId, req.params.imageId]
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ error: "image not found" });
  }

  await deleteObject(result.rows[0].object_key);
  await query("DELETE FROM images WHERE user_id = $1 AND image_id = $2", [req.params.userId, req.params.imageId]);
  res.json({ ok: true });
});

bootstrap()
  .then(() => {
    app.listen(PORTS.image, () => {
      console.log(`Image service listening on ${PORTS.image}`);
    });
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
