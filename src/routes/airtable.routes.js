import express from "express";
import {
	getBases,
	getTables,
	getPages,
} from "../controllers/airtableController.js";

const router = express.Router();

router.get("/bases", getBases);
router.get("/bases/:baseId/tables", getTables);
router.get("/bases/:baseId/:tableId/pages", getPages);

export default router;
