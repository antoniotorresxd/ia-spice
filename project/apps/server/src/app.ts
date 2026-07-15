import createApp from "@/lib/create-app";
import configureOpenAPI from "@/lib/configure-open-api";
import { authRouter } from "@/modules/auth/auth.index";
import { llmRouter } from "@/modules/llm/llm.index";

const app = createApp();

configureOpenAPI(app);

app.get("/", (c) => c.text("Hello Hono!"));

const routes = app.route("/", authRouter).route("/", llmRouter);

export type AppType = typeof routes;

export default app;
