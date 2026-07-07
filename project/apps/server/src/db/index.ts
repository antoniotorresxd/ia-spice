import { drizzle } from "drizzle-orm/neon-http";

import env from "@/lib/env";

import * as schema from "./schema";

export const db = drizzle(env.DATA_BASE_URL_POOL, { schema });
