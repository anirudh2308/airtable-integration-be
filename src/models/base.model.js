import mongoose from "mongoose";

const BaseSchema = new mongoose.Schema({
	id: { type: String, required: true, unique: true },
	name: String,
	permissionLevel: String,
});

export default mongoose.model("Base", BaseSchema);
