import express, { type Express, type ErrorRequestHandler } from "express";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// Keep this anonymous AI endpoint's body bounded and its parser failures within
// the same structured error contract as validation/provider errors.
const chatBodyError: ErrorRequestHandler = (error, _req, res, next) => {
  if (error?.type !== "entity.too.large" && error?.type !== "entity.parse.failed") {
    next(error);
    return;
  }
  res.status(error.type === "entity.too.large" ? 413 : 400).json({
    error: {
      code: error.type === "entity.too.large" ? "REQUEST_TOO_LARGE" : "INVALID_JSON",
      message: error.type === "entity.too.large" ? "Chat request body is too large." : "Chat request must contain valid JSON.",
    },
  });
};
app.use("/api/insights-chat", express.json({ limit: "32kb" }), chatBodyError);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

// Keep failures from upstream middleware within the public chat JSON contract.
const chatServiceError: ErrorRequestHandler = (error, req, res, next) => {
  if (req.path !== "/api/insights-chat" || res.headersSent) {
    next(error);
    return;
  }
  req.log.error({ err: error }, "Insights chat middleware failed");
  res.status(503).set("Cache-Control", "no-store").json({
    error: {
      code: "UNAVAILABLE",
      message: "The Insights Guide is temporarily unavailable. Please try again shortly.",
    },
  });
};
app.use(chatServiceError);

export default app;
