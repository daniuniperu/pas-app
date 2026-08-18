import { getDb } from "./db/connection";
import app from "./app";

// Initialize DB (runs migrations) at startup
getDb();

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => {
  console.log(`PAS API listening on http://localhost:${PORT}`);
});

export default app;
