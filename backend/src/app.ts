import express from "express";
import cors from "cors";
import endorsementsRouter from "./routes/endorsements";
import paymentsRouter from "./routes/payments";
import policiesRouter from "./routes/policies";
import ledgerRouter from "./routes/ledger";
import historyRouter from "./routes/history";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/policies/:policyId/endorsements", endorsementsRouter);
app.use("/api/policies/:policyId/payments", paymentsRouter);
app.use("/api/policies/:policyId/ledger", ledgerRouter);
app.use("/api/policies/:policyId/history/verify", historyRouter);
app.use("/api/policies/:policyId", policiesRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", ts: new Date().toISOString() });
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

export default app;
