import express from "express";
import {
	airtableLogin,
	airtableCallback,
	airtableStatus,
} from "../controllers/authController.js";

const router = express.Router();

router.get("/login", airtableLogin);
router.get("/callback", airtableCallback);
router.get("/status", airtableStatus);

export default router;
