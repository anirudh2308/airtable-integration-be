import mongoose from "mongoose";

const FieldSchema = new mongoose.Schema(
	{
		id: { type: String },
		name: { type: String },
		type: { type: String },
	},
	{ _id: false }
);

const TableSchema = new mongoose.Schema({
	id: { type: String, required: true, unique: true },
	baseId: { type: String, required: true },
	name: String,
	primaryFieldId: String,
	fields: { type: [FieldSchema], default: [] },
});

export default mongoose.model("Table", TableSchema);
