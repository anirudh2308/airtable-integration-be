import express from "express";
import fs from "fs";
import * as cheerio from "cheerio";
import puppeteer from "puppeteer";
import Scraper from "../models/scraper.model.js";

const router = express.Router();

router.get("/login", async (req, res) => {
	try {
		const browser = await puppeteer.launch({
			headless: false,
			defaultViewport: null,
			args: ["--start-maximized"],
		});

		const page = await browser.newPage();
		await page.goto("https://airtable.com/login", {
			waitUntil: "networkidle2",
		});

		await page.waitForSelector('input[name="email"]', {
			visible: true,
			timeout: 15000,
		});
		await page.type('input[name="email"]', process.env.AIRTABLE_EMAIL, {
			delay: 50,
		});
		await page.click('button[type="submit"]');

		await page.waitForSelector('input[name="password"]', {
			visible: true,
			timeout: 15000,
		});
		await page.type('input[name="password"]', process.env.AIRTABLE_PASSWORD, {
			delay: 50,
		});
		await page.click('button[type="submit"]');

		await page.waitForNavigation({ waitUntil: "networkidle2" });

		const cookies = await page.cookies();
		const localStorageData = await page.evaluate(() =>
			Object.assign({}, window.localStorage)
		);

		fs.writeFileSync("cookies.json", JSON.stringify(cookies, null, 2));
		fs.writeFileSync(
			"localStorage.json",
			JSON.stringify(localStorageData, null, 2)
		);

		console.log(`Saved ${cookies.length} cookies and localStorage.json`);

		await browser.close();
		res.send("Logged in and saved session");
	} catch (err) {
		console.error("Puppeteer login failed:", err);
		res.status(500).send("Scraper login failed");
	}
});

router.get("/:recordId", async (req, res) => {
	const { recordId } = req.params;

	try {
		const cookies = JSON.parse(fs.readFileSync("cookies.json", "utf8"));
		const localStorageData = JSON.parse(
			fs.readFileSync("localStorage.json", "utf8")
		);

		const browser = await puppeteer.launch({ headless: true });
		const page = await browser.newPage();

		await page.goto("about:blank");
		await page.setCookie(...cookies);

		const baseId = "apprR2ayoUZ0PVCgJ";
		const viewUrl = `https://airtable.com/${baseId}`;
		await page.goto(viewUrl, { waitUntil: "networkidle2" });

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
		)}&requestId=req${Math.random()
			.toString(36)
			.slice(2)}&secretSocketId=soc${Math.random().toString(36).slice(2)}`;

		const headers = {
			accept: "application/json, text/javascript, */*; q=0.01",
			"x-airtable-application-id": baseId,
			"x-requested-with": "XMLHttpRequest",
			"x-user-locale": "en",
			"x-time-zone": "America/Toronto",
			referer: `https://airtable.com/${baseId}/tblZ9qJBBTo6hNUCf/viwojDzncHQnXC4z3/${recordId}?blocks=hide`,
		};

		const responseText = await page.evaluate(
			async ({ url, headers }) => {
				const resp = await fetch(url, {
					method: "GET",
					headers,
					credentials: "include",
				});
				if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
				return await resp.text();
			},
			{ url, headers }
		);

		const data = JSON.parse(responseText);

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

		await browser.close();
		res.json({ count: parsed.length, data: parsed });
	} catch (err) {
		res.status(500).send(`Scraper failed: ${err.message}`);
	}
});

export default router;
