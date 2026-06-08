import express from "express";
import importRoutes from "./routes/import.routes.js";
import lookupRoutes from "./routes/lookup.routes.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestLogger } from "./middleware/requestLogger.js";
function createApp() {
  const app = express();

  app.use(requestLogger);
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/imports", importRoutes);
  app.use("/lookup", lookupRoutes);

  app.use(errorHandler);

  return app;
}

export { createApp };
