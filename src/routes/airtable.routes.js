import express from "express";
import axios from "axios";
import Integration from "../models/integration.model.js";
import Base from "../models/base.model.js";
import Table from "../models/table.model.js";
import Page from "../models/page.model.js";

const router = express.Router();

// Getting Bases
router.get("/bases", async (req, res) => {
	try {
		const integration = await Integration.findOne();
		if (!integration) return res.status(401).send("No access token found");

		const accessToken = integration.access_token;
		let allBases = [];
		let offset = null;

		do {
			const url = `https://api.airtable.com/v0/meta/bases${
				offset ? `?offset=${offset}` : ""
			}`;
			const response = await axios.get(url, {
				headers: { Authorization: `Bearer ${accessToken}` },
			});

			const bases = response.data.bases || [];
			allBases.push(...bases);
			offset = response.data.offset;

			for (const b of bases) {
				await Base.findOneAndUpdate(
					{ id: b.id },
					{
						name: b.name,
						permissionLevel: b.permissionLevel,
					},
					{ upsert: true, new: true }
				);
			}
		} while (offset);

		console.log(`Stored ${allBases.length} bases.`);
		res.json(allBases);
	} catch (err) {
		console.error("Error fetching bases:", err.response?.data || err.message);
		res.status(500).send("Failed to fetch bases");
	}
});

// Getting Tables for a Base
router.get("/bases/:baseId/tables", async (req, res) => {
	const { baseId } = req.params;

	try {
		const integration = await Integration.findOne();
		if (!integration) return res.status(401).send("No access token found");

		const accessToken = integration.access_token;
		let allTables = [];
		let offset = null;

		do {
			const url = `https://api.airtable.com/v0/meta/bases/${baseId}/tables${
				offset ? `?offset=${offset}` : ""
			}`;
			const response = await axios.get(url, {
				headers: { Authorization: `Bearer ${accessToken}` },
			});

			const tables = response.data.tables || [];
			allTables.push(...tables);
			offset = response.data.offset;

			for (const t of tables) {
				await Table.findOneAndUpdate(
					{ id: t.id },
					{
						baseId,
						name: t.name,
						primaryFieldId: t.primaryFieldId,
						fields: t.fields,
					},
					{ upsert: true, new: true, runValidators: true }
				);
			}
		} while (offset);

		console.log(`Stored ${allTables.length} tables for base ${baseId}`);
		res.json(allTables);
	} catch (err) {
		console.error("Error fetching tables:", err.response?.data || err.message);
		res.status(500).send("Failed to fetch tables");
	}
});

// Getting pages (records) for a Table in a Base
router.get("/bases/:baseId/:tableId/pages", async (req, res) => {
	const { baseId, tableId } = req.params;

	try {
		const integration = await Integration.findOne();
		if (!integration) return res.status(401).send("No access token found");

		const accessToken = integration.access_token;
		let allRecords = [];
		let offset = null;

		do {
			const url = `https://api.airtable.com/v0/${baseId}/${tableId}${
				offset ? `?offset=${offset}` : ""
			}`;

			const response = await axios.get(url, {
				headers: { Authorization: `Bearer ${accessToken}` },
			});

			const records = response.data.records || [];
			allRecords.push(...records);
			offset = response.data.offset;

			for (const r of records) {
				await Page.findOneAndUpdate(
					{ id: r.id },
					{
						baseId,
						tableId,
						fields: r.fields,
						createdTime: r.createdTime,
					},
					{ upsert: true, new: true }
				);
			}
		} while (offset);

		console.log(
			`Stored ${allRecords.length} pages (records) for table ${tableId}`
		);
		res.json({ count: allRecords.length });
	} catch (err) {
		console.error("Error fetching pages:", err.response?.data || err.message);
		res.status(500).send("Failed to fetch pages");
	}
});

export default router;
