import express from "express";
import fs from "fs";
import * as cheerio from "cheerio";
import puppeteer from "puppeteer";
import Page from "../models/page.model.js";
import Base from "../models/base.model.js";
import Scraper from "../models/scraper.model.js";

const router = express.Router();

/* --------------------------------------------------
 * 🧩 Optimized login with MFA (fast + async)
 * -------------------------------------------------- */
async function loginAndSaveSession(mfaCode = null) {
	const browser = await puppeteer.launch({
		headless: false,
		args: [
			"--no-sandbox",
			"--disable-setuid-sandbox",
			"--disable-blink-features=AutomationControlled",
			"--window-size=1280,800",
		],
	});

	const page = await browser.newPage();
	await page.setViewport({ width: 1280, height: 800 });
	await page.setUserAgent(
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
	);

	console.log("🌐 Navigating to Airtable login...");
	await page.goto("https://airtable.com/login", {
		waitUntil: "domcontentloaded",
	});

	await page.waitForSelector('input[name="email"]', { visible: true });
	await page.type('input[name="email"]', process.env.AIRTABLE_EMAIL, {
		delay: 40,
	});
	await page.click('button[type="submit"]');

	await page.waitForSelector('input[name="password"]', { visible: true });
	await page.type('input[name="password"]', process.env.AIRTABLE_PASSWORD, {
		delay: 40,
	});
	await page.click('button[type="submit"]');

	try {
		await page.waitForSelector('input[name="code"]', {
			visible: true,
			timeout: 10000,
		});
		if (!mfaCode) throw new Error("MFA code required but not provided");
		console.log("🔐 Entering MFA code...");
		await page.type('input[name="code"]', mfaCode, { delay: 40 });
		await Promise.any([
			page.click("div.link-quiet.text-white.pointer").catch(() => {}),
			page.keyboard.press("Enter"),
		]);
	} catch {
		console.log("⚠️ MFA prompt not detected or skipped");
	}

	try {
		await page.waitForSelector('[data-testid="baseDashboard"]', {
			timeout: 10000,
		});
		console.log("✅ Dashboard detected");
	} catch {
		console.warn("⚠️ Dashboard not detected quickly — continuing anyway");
	}

	console.log("💾 Extracting session data...");
	const cookies = await page.cookies();
	const localStorageData = await page.evaluate(() => ({
		...window.localStorage,
	}));

	fs.writeFileSync("cookies.json", JSON.stringify(cookies, null, 2));
	fs.writeFileSync(
		"localStorage.json",
		JSON.stringify(localStorageData, null, 2)
	);

	console.log(`✅ Saved ${cookies.length} cookies and localStorage data`);
	await browser.close();
	console.log("🔒 Browser closed — session refreshed");
}

/* --------------------------------------------------
 * 🔍 Scrape a single record
 * -------------------------------------------------- */
async function scrapeRecord(page, recordId, baseId) {
	const cookies = JSON.parse(fs.readFileSync("cookies.json", "utf8"));
	const localStorageData = JSON.parse(
		fs.readFileSync("localStorage.json", "utf8")
	);

	await page.goto("about:blank");
	await page.setCookie(...cookies);

	await page.goto(`https://airtable.com/${baseId}`, {
		waitUntil: "domcontentloaded",
	});
	await page.evaluate((data) => {
		for (const [key, value] of Object.entries(data)) {
			localStorage.setItem(key, value);
		}
	}, localStorageData);

	const url = `https://airtable.com/v0.3/row/${recordId}/readRowActivitiesAndComments?stringifiedObjectParams=${encodeURIComponent(
		JSON.stringify({
			limit: 10,
			offsetV2: null,
			shouldReturnDeserializedActivityItems: true,
			shouldIncludeRowActivityOrCommentUserObjById: true,
		})
	)}`;

	const headers = {
		accept: "application/json, text/javascript, */*; q=0.01",
		"x-airtable-application-id": baseId,
		"x-requested-with": "XMLHttpRequest",
		"x-user-locale": "en",
		"x-time-zone": "America/Toronto",
		referer: `https://airtable.com/${baseId}`,
	};

	const responseText = await page.evaluate(
		async ({ url, headers }) => {
			const resp = await fetch(url, { headers, credentials: "include" });
			if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
			return await resp.text();
		},
		{ url, headers }
	);

	return JSON.parse(responseText);
}

/* --------------------------------------------------
 * 🔐 Login endpoint — responds immediately
 * -------------------------------------------------- */
router.post("/login", async (req, res) => {
	try {
		const mfaCode = req.body.code || req.query.code;
		if (!mfaCode) {
			return res
				.status(400)
				.json({ success: false, message: "MFA code is required" });
		}

		// respond immediately so Angular doesn’t timeout
		res.status(200).json({
			success: true,
			message: "MFA login initiated — saving session in background.",
		});

		// run login asynchronously
		loginAndSaveSession(mfaCode)
			.then(() => console.log("✅ Background login finished."))
			.catch((err) => console.error("❌ Background login error:", err.message));
	} catch (err) {
		console.error("❌ Login failed:", err);
		res.status(500).json({ success: false, message: "Login failed." });
	}
});

/* --------------------------------------------------
 * 🧩 Run scraper for all bases & pages
 * -------------------------------------------------- */
router.get("/run-all", async (req, res) => {
	try {
		const bases = await Base.find({});
		if (!bases.length) return res.status(404).send("No bases found");

		const browser = await puppeteer.launch({
			headless: true,
			args: [
				"--no-sandbox",
				"--disable-setuid-sandbox",
				"--disable-blink-features=AutomationControlled",
				"--window-size=1280,800",
			],
		});

		const page = await browser.newPage();
		await page.setViewport({ width: 1280, height: 800 });
		await page.setUserAgent(
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
		);

		let totalParsed = 0;

		for (const base of bases) {
			const baseId = base.id;
			const pages = await Page.find({ baseId });
			if (!pages.length) continue;

			console.log(
				`📂 Scraping ${pages.length} records from base ${base.name}...`
			);

			for (const doc of pages) {
				const recordId = doc.id;
				console.log(`🧩 Scraping record ${recordId}...`);
				try {
					const data = await scrapeRecord(page, recordId, baseId);
					const info = data.data;
					const ordered = info.orderedActivityAndCommentIds || [];
					const activities = info.rowActivityInfoById || {};
					const users = info.rowActivityOrCommentUserObjById || {};

					const parsed = [];
					for (const id of ordered) {
						const a = activities[id];
						if (!a) continue;
						const user = users[a.originatingUserId];
						const $ = cheerio.load(a.diffRowHtml);
						const cell = $(".historicalCellValue");

						const columnType = cell.attr("data-columntype") || null;
						if (!["collaborator", "select"].includes(columnType)) continue;

						let oldValue =
							$(".colors-background-negative").text().trim() || null;
						let newValue =
							$(".colors-background-success").text().trim() || null;

						// fallback for plain text diffs
						if (!oldValue && !newValue && cell.length) {
							const text = cell.text().trim();
							if (text) newValue = text;
						}

						parsed.push({
							uuid: id,
							issueId: recordId,
							columnType,
							oldValue,
							newValue,
							createdDate: new Date(a.createdTime),
							authoredBy: user?.name || a.originatingUserId,
						});
					}

					// ✅ Upsert instead of create
					await Scraper.findOneAndUpdate(
						{ recordId },
						{ recordId, baseId, data: parsed },
						{ upsert: true, new: true }
					);

					totalParsed += parsed.length;
					console.log(`✅ Saved ${parsed.length} activities for ${recordId}`);
					await new Promise((r) => setTimeout(r, 800)); // short delay
				} catch (err) {
					console.error(`❌ Error scraping ${recordId}:`, err.message);
				}
			}
		}

		await browser.close();
		console.log("✅ Finished scraping all bases.");
		res.json({ success: true, message: "Scraper complete", totalParsed });
	} catch (err) {
		console.error("❌ run-all error:", err);
		res.status(500).json({ success: false, message: err.message });
	}
});

/* --------------------------------------------------
 * 🧾 Scrape one record (manual test)
 * -------------------------------------------------- */
router.get("/:recordId", async (req, res) => {
	const { recordId } = req.params;
	try {
		const pageDoc = await Page.findOne({ id: recordId });
		if (!pageDoc) return res.status(404).send("Record not found");

		const baseId = pageDoc.baseId;

		const browser = await puppeteer.launch({ headless: true });
		const page = await browser.newPage();

		const data = await scrapeRecord(page, recordId, baseId);
		const info = data.data;
		const ordered = info.orderedActivityAndCommentIds || [];
		const activities = info.rowActivityInfoById || {};
		const users = info.rowActivityOrCommentUserObjById || {};

		const parsed = [];
		for (const id of ordered) {
			const a = activities[id];
			if (!a) continue;
			const user = users[a.originatingUserId];
			const $ = cheerio.load(a.diffRowHtml);
			const cell = $(".historicalCellValue");

			const columnType = cell.attr("data-columntype") || null;
			if (!["collaborator", "select"].includes(columnType)) continue;

			let oldValue = $(".colors-background-negative").text().trim() || null;
			let newValue = $(".colors-background-success").text().trim() || null;

			if (!oldValue && !newValue && cell.length) {
				const text = cell.text().trim();
				if (text) newValue = text;
			}

			parsed.push({
				uuid: id,
				issueId: recordId,
				columnType,
				oldValue,
				newValue,
				createdDate: new Date(a.createdTime),
				authoredBy: user?.name || a.originatingUserId,
			});
		}

		await browser.close();
		res.json({ count: parsed.length, data: parsed });
	} catch (err) {
		console.error("❌ Scraper error:", err);
		res.status(500).send(`Scraper failed: ${err.message}`);
	}
});

export default router;
