import mongoose from "mongoose";

const ScraperSchema = new mongoose.Schema({
	uuid: { type: String, required: true },
	issueId: String,
	columnType: String,
	oldValue: String,
	newValue: String,
	createdDate: Date,
	authoredBy: String,
});

export default mongoose.model("Scraper", ScraperSchema);
