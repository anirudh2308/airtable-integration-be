import express from "express";
import fs from "fs";
import * as cheerio from "cheerio";
import puppeteer from "puppeteer";
import Page from "../models/page.model.js";
import Scraper from "../models/scraper.model.js";

const router = express.Router();

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

	await page.goto("https://airtable.com/login", { waitUntil: "networkidle2" });

	await page.waitForSelector('input[name="email"]', {
		visible: true,
		timeout: 30000,
	});
	await page.type('input[name="email"]', process.env.AIRTABLE_EMAIL, {
		delay: 50,
	});
	await page.click('button[type="submit"]');

	await page.waitForSelector('input[name="password"]', {
		visible: true,
		timeout: 30000,
	});
	await page.type('input[name="password"]', process.env.AIRTABLE_PASSWORD, {
		delay: 50,
	});
	await page.click('button[type="submit"]');

	// wait for MFA input field
	try {
		await page.waitForSelector('input[name="code"]', {
			visible: true,
			timeout: 15000,
		});

		if (!mfaCode) {
			throw new Error("MFA code required but not provided");
		}

		console.log("🔐 Entering MFA code...");
		await page.type('input[name="code"]', mfaCode, { delay: 50 });
		try {
			// Wait for the visible "Submit" div (blue button)
			await page.waitForSelector("div.link-quiet.text-white.pointer", {
				visible: true,
				timeout: 5000,
			});
			console.log("🔘 Clicking MFA Submit button...");
			await page.click("div.link-quiet.text-white.pointer");
		} catch (e) {
			console.warn("⚠️ Could not find MFA button, pressing Enter instead...");
			await page.keyboard.press("Enter");
		}

		// Now wait for navigation or dashboard to load
		try {
			await page.waitForNavigation({
				waitUntil: "networkidle2",
				timeout: 20000,
			});
		} catch {
			console.warn("⚠️ No navigation after MFA — continuing anyway...");
		}
	} catch (err) {
		if (!err.message.includes("MFA code"))
			console.log("No MFA prompt detected, continuing...");
	}

	// Wait until the Airtable dashboard (base list) appears
	try {
		await page.waitForSelector(
			'[data-testid="baseDashboard"], [data-testid="baseGrid"]',
			{
				visible: true,
				timeout: 20000,
			}
		);
		console.log("✅ Dashboard detected — extracting cookies...");
	} catch {
		console.warn("⚠️ Dashboard not detected; saving cookies anyway...");
	}

	// collect cookies + localStorage
	const cookies = await page.cookies();
	const localStorageData = await page.evaluate(() =>
		Object.assign({}, window.localStorage)
	);

	fs.writeFileSync("cookies.json", JSON.stringify(cookies, null, 2));
	fs.writeFileSync(
		"localStorage.json",
		JSON.stringify(localStorageData, null, 2)
	);

	console.log(`💾 Saved ${cookies.length} cookies`);
	await browser.close();
	console.log("✅ Session refreshed and saved");
}

async function scrapeRecord(page, recordId) {
	const cookies = JSON.parse(fs.readFileSync("cookies.json", "utf8"));
	const localStorageData = JSON.parse(
		fs.readFileSync("localStorage.json", "utf8")
	);

	await page.goto("about:blank");
	await page.setCookie(...cookies);

	const baseId = "apprR2ayoUZ0PVCgJ";
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

router.post("/login", async (req, res) => {
	try {
		const mfaCode = req.body.code || req.query.code;
		if (!mfaCode) {
			return res.status(400).send("MFA code is required");
		}

		await loginAndSaveSession(mfaCode);
		res.send("✅ Logged in with MFA and cookies refreshed");
	} catch (err) {
		console.error("❌ Login failed:", err);
		res.status(500).send("Login failed");
	}
});

router.get("/run-all", async (req, res) => {
	try {
		const pages = await Page.find({});
		if (!pages.length) return res.status(404).send("No pages found");

		// launch one browser for all scrapes
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

		const baseId = "apprR2ayoUZ0PVCgJ";

		for (const doc of pages) {
			const recordId = doc.id;
			console.log(`🧩 Scraping record ${recordId}...`);
			try {
				let data;
				try {
					data = await scrapeRecord(page, recordId);
				} catch (err) {
					if (err.message.includes("HTTP 401")) {
						console.log("🔄 Session expired — refreshing login...");
						await loginAndSaveSession();
						data = await scrapeRecord(page, recordId);
					} else throw err;
				}

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
					const columnType =
						$(".historicalCellValue").attr("data-columntype") || null;
					const oldValue =
						$(".colors-background-negative").text().trim() || null;
					const newValue =
						$(".colors-background-success").text().trim() || null;

					if (["collaborator", "select"].includes(columnType)) {
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
				}

				await Scraper.create({ recordId, data: parsed });
				console.log(`✅ Saved ${parsed.length} activities for ${recordId}`);

				// small delay to avoid throttling
				await new Promise((r) => setTimeout(r, 1500));
			} catch (err) {
				console.error(`❌ Error scraping ${recordId}:`, err.message);
			}
		}

		await browser.close();
		res.send("✅ Finished scraping all pages (shared browser mode)");
	} catch (err) {
		console.error("❌ run-all error:", err);
		res.status(500).send(`Scraper failed: ${err.message}`);
	}
});

router.get("/:recordId", async (req, res) => {
	const { recordId } = req.params;
	try {
		let data;
		try {
			data = await scrapeRecord(recordId);
		} catch (err) {
			if (err.message.includes("HTTP 401")) {
				console.log("🔄 Session expired — refreshing...");
				await loginAndSaveSession();
				data = await scrapeRecord(recordId);
			} else {
				throw err;
			}
		}

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
			const columnType =
				$(".historicalCellValue").attr("data-columntype") || null;
			const oldValue = $(".colors-background-negative").text().trim() || null;
			const newValue = $(".colors-background-success").text().trim() || null;

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

		res.json({ count: parsed.length, data: parsed });
	} catch (err) {
		console.error("❌ Scraper error:", err);
		res.status(500).send(`Scraper failed: ${err.message}`);
	}
});

export default router;
