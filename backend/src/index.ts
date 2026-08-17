import express from "express";
import cors from "cors";
import { getDb } from "./db";
import endorsementsRouter from "./routes/endorsements";
import paymentsRouter from "./routes/payments";
import policiesRouter from "./routes/policies";
import ledgerRouter from "./routes/ledger";
import historyRouter from "./routes/history";

const app = express();

app.use(cors());
app.use(express.json());

// Initialize DB (runs migrations) at startup
getDb();

// Routes
app.use("/api/policies/:policyId/endorsements", endorsementsRouter);
app.use("/api/policies/:policyId/payments", paymentsRouter);
app.use("/api/policies/:policyId/ledger", ledgerRouter);
app.use("/api/policies/:policyId/history/verify", historyRouter);
app.use("/api/policies/:policyId", policiesRouter);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", ts: new Date().toISOString() });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => {
  console.log(`PAS API listening on http://localhost:${PORT}`);
});

export default app;
