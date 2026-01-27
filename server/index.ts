import "dotenv/config";
import express from "express";
import cors from "cors";

// Import routes
import authRoutes from "./routes/auth";
import localRoutes from "./routes/local";
import githubRoutes from "./routes/github";

const app = express();
const PORT = 3001;

// Middleware
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Mount routes
app.use("/api/auth", authRoutes);
app.use("/api", authRoutes); // For /api/config and /api/github-app/*
app.use("/api", localRoutes); // Local repo routes: /api/diff, /api/browse, etc.
app.use("/api", githubRoutes); // GitHub routes: /api/github-pr, etc.

// Start server
app.listen(PORT, () => {
  console.log(`Intent server running on http://localhost:${PORT}`);
});
