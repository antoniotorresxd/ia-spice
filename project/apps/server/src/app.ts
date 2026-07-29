import createApp from "@/lib/create-app";
import configureOpenAPI from "@/lib/configure-open-api";
import { authRouter } from "@/modules/auth/auth.index";
import { llmRouter } from "@/modules/llm/llm.index";
import { workspaceRouter } from "@/modules/workspace/workspace.index";

const app = createApp();

configureOpenAPI(app);

app.get("/", (c) => c.text("Hello Hono!"));

const routes = app.route("/", authRouter).route("/", llmRouter).route("/", workspaceRouter);

export type AppType = typeof routes;

export default app;
