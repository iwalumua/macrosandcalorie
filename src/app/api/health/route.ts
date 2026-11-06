import { sql } from "drizzle-orm";
import { getDb } from "../../../db/client";

export const dynamic = "force-dynamic";

/** Liveness + database connectivity check. */
export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ status: "ok", db: "up" });
  } catch {
    return Response.json({ status: "degraded", db: "down" }, { status: 503 });
  }
}
