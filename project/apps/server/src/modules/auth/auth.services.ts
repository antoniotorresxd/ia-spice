import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { openAPI } from "better-auth/plugins";
import { dash } from "@better-auth/infra";

import { db } from "@/db";
import env from "@/lib/env";

import * as authModel from "./auth.model";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: authModel,
  }),
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: env.CORS_ALLOWED_ORIGINS,
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  advanced: {
    defaultCookieAttributes: {
      sameSite: env.NODE_ENV === "production" ? "none" : "lax",
      secure: env.NODE_ENV === "production",
    },
  },
  socialProviders: {
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
  },
  plugins: [
    openAPI(),
    dash(),
  ],
});
