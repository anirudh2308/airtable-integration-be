import axios from "axios";
import dotenv from "dotenv";
import { generatePKCE } from "../utils/keygen.js";
import Integration from "../models/integration.model.js";

dotenv.config();

const { AIRTABLE_CLIENT_ID, AIRTABLE_REDIRECT_URI } = process.env;

export const airtableLogin = (req, res) => {
	const state = "airtable_demo_state";
	const { codeVerifier, codeChallenge } = generatePKCE();

	res.cookie("code_verifier", codeVerifier, { httpOnly: true });

	const scopes = [
		"data.records:read",
		"data.records:write",
		"schema.bases:read",
		"user.email:read",
	].join("+");

	const authUrl = `https://airtable.com/oauth2/v1/authorize?client_id=${AIRTABLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(
		AIRTABLE_REDIRECT_URI
	)}&response_type=code&scope=${scopes}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;

	res.redirect(authUrl);
};

export const airtableCallback = async (req, res) => {
	const { code, state } = req.query;
	const codeVerifier = req.cookies.code_verifier;

	if (!code) return res.status(400).send("No code provided");
	if (state !== "airtable_demo_state")
		return res.status(400).send("Invalid state");

	try {
		const tokenResponse = await axios.post(
			"https://airtable.com/oauth2/v1/token",
			new URLSearchParams({
				grant_type: "authorization_code",
				code,
				client_id: AIRTABLE_CLIENT_ID,
				redirect_uri: AIRTABLE_REDIRECT_URI,
				code_verifier: codeVerifier,
			}),
			{
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
			}
		);

		const tokenData = tokenResponse.data;
		await Integration.deleteMany({});
		await Integration.create(tokenData);

		console.log("Airtable token stored successfully!");
		res.send("OAuth successful! Token saved to DB, you can close this tab.");
	} catch (err) {
		console.error(
			"OAuth token exchange failed:",
			err.response?.data || err.message
		);
		res.status(500).send("OAuth failed.");
	}
};
