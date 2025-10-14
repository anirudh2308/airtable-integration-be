import express from "express";
import { fetchAll, getAllFromDB } from "../controllers/airtableController.js";

const router = express.Router();

router.get("/fetch-all", fetchAll);
router.get("/get-all", getAllFromDB);

export default router;
