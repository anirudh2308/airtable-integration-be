import axios from "axios";
import Integration from "../models/integration.model.js";
import Base from "../models/base.model.js";
import Table from "../models/table.model.js";
import Page from "../models/page.model.js";

export const fetchAll = async (req, res) => {
	try {
		const integration = await Integration.findOne();
		if (!integration) return res.status(401).send("No access token found");

		const accessToken = integration.access_token;
		const headers = { Authorization: `Bearer ${accessToken}` };

		let allBases = [];
		let allTables = [];
		let allRecords = [];

		console.log("Starting full Airtable sync...");

		let baseOffset = null;
		do {
			const url = `https://api.airtable.com/v0/meta/bases${
				baseOffset ? `?offset=${baseOffset}` : ""
			}`;
			const baseRes = await axios.get(url, { headers });
			const bases = baseRes.data.bases || [];
			allBases.push(...bases);
			baseOffset = baseRes.data.offset;

			for (const b of bases) {
				await Base.findOneAndUpdate(
					{ id: b.id },
					{ name: b.name, permissionLevel: b.permissionLevel },
					{ upsert: true, new: true }
				);
			}
		} while (baseOffset);

		console.log(`Stored ${allBases.length} bases.`);

		for (const base of allBases) {
			let tableOffset = null;
			do {
				const tableUrl = `https://api.airtable.com/v0/meta/bases/${
					base.id
				}/tables${tableOffset ? `?offset=${tableOffset}` : ""}`;
				const tableRes = await axios.get(tableUrl, { headers });
				const tables = tableRes.data.tables || [];
				const enrichedTables = tables.map((t) => ({ ...t, baseId: base.id }));
				allTables.push(...enrichedTables);

				tableOffset = tableRes.data.offset;

				for (const t of tables) {
					await Table.findOneAndUpdate(
						{ id: t.id },
						{
							baseId: base.id,
							name: t.name,
							primaryFieldId: t.primaryFieldId,
							fields: t.fields,
						},
						{ upsert: true, new: true }
					);
				}
			} while (tableOffset);

			console.log(`Stored ${allTables.length} tables for base ${base.name}`);
		}

		for (const table of allTables) {
			let recordOffset = null;
			let recordCount = 0;

			do {
				const recordUrl = `https://api.airtable.com/v0/${table.baseId}/${
					table.id
				}${recordOffset ? `?offset=${recordOffset}` : ""}`;
				const recordRes = await axios.get(recordUrl, { headers });
				const records = recordRes.data.records || [];
				allRecords.push(
					...records.map((r) => ({
						...r,
						baseId: table.baseId,
						tableId: table.id,
					}))
				);
				recordOffset = recordRes.data.offset;
				recordCount += records.length;

				for (const r of records) {
					await Page.findOneAndUpdate(
						{ id: r.id },
						{
							baseId: table.baseId,
							tableId: table.id,
							fields: r.fields,
							createdTime: r.createdTime,
						},
						{ upsert: true, new: true }
					);
				}
			} while (recordOffset);

			console.log(`Stored ${recordCount} records for table ${table.name}`);
		}

		console.log("Full Airtable sync complete!");
		res.json({
			success: true,
			message: "Full Airtable sync complete",
			bases: allBases,
			tables: allTables,
			records: allRecords,
		});
	} catch (err) {
		console.error("Error in fetchAll:", err.response?.data || err.message);
		res.status(500).send("Failed to fetch all Airtable data");
	}
};

export const getAllFromDB = async (req, res) => {
	try {
		const bases = await Base.find().lean();
		const tables = await Table.find().lean();
		const records = await Page.find().lean();

		res.json({
			success: true,
			bases,
			tables,
			records,
		});
	} catch (err) {
		console.error("Error fetching data from DB:", err.message);
		res.status(500).json({
			success: false,
			message: "Failed to fetch data from database",
		});
	}
};
