import express from "express";
import {
	airtableLogin,
	airtableCallback,
} from "../controllers/authController.js";

const router = express.Router();

router.get("/login", airtableLogin);
router.get("/callback", airtableCallback);

export default router;
