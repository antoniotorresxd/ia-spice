import createApp from "@/lib/create-app";
import configureOpenAPI from "@/lib/configure-open-api";
import { authRouter } from "@/modules/auth/auth.index";

const app = createApp();

configureOpenAPI(app);

app.get("/", (c) => c.text("Hello Hono!"));

const routes = app.route("/", authRouter);

export type AppType = typeof routes;

export default app;
