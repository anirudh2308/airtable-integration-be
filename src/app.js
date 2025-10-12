import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.routes.js";
import airtableRoutes from "./routes/airtable.routes.js";
import scraperRoutes from "./routes/scraper.routes.js";

dotenv.config();

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/airtable", airtableRoutes);
app.use("/api/scraper", scraperRoutes);

export default app;
