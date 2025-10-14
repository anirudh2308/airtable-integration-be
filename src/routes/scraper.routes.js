import express from "express";
import {
	fetchAll,
	getProgress,
	getStatus,
	mfaLogin,
	runAll,
} from "../controllers/scraperController.js";

const router = express.Router();

router.post("/login", mfaLogin);
router.get("/status", getStatus);
router.get("/progress", getProgress);
router.get("/all", fetchAll);
router.get("/run-all", runAll);

export default router;
