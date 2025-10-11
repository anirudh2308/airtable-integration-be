import mongoose from "mongoose";

const IntegrationSchema = new mongoose.Schema({
	access_token: String,
	refresh_token: String,
	token_type: String,
	scope: String,
	expires_in: Number,
	created_at: { type: Date, default: Date.now },
});

export default mongoose.model("Integration", IntegrationSchema);
