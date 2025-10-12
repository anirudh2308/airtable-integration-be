import mongoose from "mongoose";

const ScraperSchema = new mongoose.Schema({
	recordId: { type: String, required: true },
	data: [
		{
			uuid: { type: String, required: true },
			issueId: String,
			columnType: String,
			oldValue: String,
			newValue: String,
			createdDate: Date,
			authoredBy: String,
		},
	],
});

export default mongoose.model("Scraper", ScraperSchema);
