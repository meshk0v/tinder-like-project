function envInt(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const PORTS = {
  gateway: envInt("GATEWAY_PORT", 8080),
  profile: envInt("PROFILE_PORT", 8081),
  image: envInt("IMAGE_PORT", 8082),
  recommendation: envInt("RECOMMENDATION_PORT", 8083),
  matches: envInt("MATCHES_PORT", 8084),
  sessions: envInt("SESSIONS_PORT", 8085),
  messaging: envInt("MESSAGING_PORT", 8086)
};

export const SERVICES = {
  profile: process.env.PROFILE_SERVICE_URL || `http://localhost:${PORTS.profile}`,
  image: process.env.IMAGE_SERVICE_URL || `http://localhost:${PORTS.image}`,
  recommendation: process.env.RECOMMENDATION_SERVICE_URL || `http://localhost:${PORTS.recommendation}`,
  matches: process.env.MATCHES_SERVICE_URL || `http://localhost:${PORTS.matches}`,
  sessions: process.env.SESSIONS_SERVICE_URL || `http://localhost:${PORTS.sessions}`,
  messaging: process.env.MESSAGING_SERVICE_URL || `http://localhost:${PORTS.messaging}`
};

export const DB = {
  url: process.env.DATABASE_URL || "postgresql://tinder:tinder@localhost:5432/tinder"
};

export const REDIS = {
  url: process.env.REDIS_URL || "redis://localhost:6379"
};

export const S3 = {
  endpoint: process.env.S3_ENDPOINT || "http://localhost:9000",
  publicEndpoint: process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT || "http://localhost:9000",
  region: process.env.S3_REGION || "us-east-1",
  accessKeyId: process.env.S3_ACCESS_KEY || "minio",
  secretAccessKey: process.env.S3_SECRET_KEY || "minio123",
  bucket: process.env.S3_BUCKET || "tinder-images",
  forcePathStyle: (process.env.S3_FORCE_PATH_STYLE || "true") === "true"
};
