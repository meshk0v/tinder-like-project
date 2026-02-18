import pg from "pg";
import { DB } from "./config.js";

const { Pool } = pg;
export const db = new Pool({ connectionString: DB.url });

export async function query(text, values = []) {
  const result = await db.query(text, values);
  return result;
}
