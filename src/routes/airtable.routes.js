import express from "express";
import { fetchAll } from "../controllers/airtableController.js";

const router = express.Router();

router.get("/fetch-all", fetchAll);

export default router;
