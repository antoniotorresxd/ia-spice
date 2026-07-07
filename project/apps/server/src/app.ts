import createApp from "@/lib/create-app";
import configureOpenAPI from "@/lib/configure-open-api";
import { authRouter } from "@/modules/auth/auth.index";

const app = createApp();

configureOpenAPI(app);

app.get("/", (c) => c.text("Hello Hono!"));

const routes = [authRouter] as const;

routes.forEach((route) => {
  app.route("/", route);
});

export default app;
