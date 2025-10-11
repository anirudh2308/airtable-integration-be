import mongoose from "mongoose";

const PageSchema = new mongoose.Schema({
	id: { type: String, required: true, unique: true },
	baseId: { type: String, required: true },
	tableId: { type: String, required: true },
	fields: mongoose.Schema.Types.Mixed,
	createdTime: Date,
});

export default mongoose.model("Page", PageSchema);
