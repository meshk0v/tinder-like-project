import Redis from "ioredis";
import { REDIS } from "./config.js";

export const redis = new Redis(REDIS.url);
