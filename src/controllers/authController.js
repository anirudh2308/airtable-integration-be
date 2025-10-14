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
		res.send(`
			<html>
				<body style="font-family: sans-serif; text-align: center; padding-top: 30px;">
					<h3>OAuth successful! You can close this window.</h3>
					<script>
						window.opener && window.opener.postMessage('oauth-success', '*');
						window.close();
					</script>
				</body>
			</html>
		`);
	} catch (err) {
		console.error(
			"OAuth token exchange failed:",
			err.response?.data || err.message
		);
		res.status(500).send("OAuth failed.");
	}
};

export const airtableStatus = async (req, res) => {
	try {
		const integration = await Integration.findOne();
		if (!integration)
			return res.json({
				connected: false,
				tokenValid: false,
				message: "Not connected: no stored integration.",
			});

		const accessToken = integration.access_token;

		try {
			const resp = await axios.get("https://api.airtable.com/v0/meta/bases", {
				headers: { Authorization: `Bearer ${accessToken}` },
			});

			if (resp.status === 200) {
				return res.json({
					connected: true,
					tokenValid: true,
					connectedAt: integration.createdAt || new Date(),
					message: "Token valid and connection active.",
				});
			}
		} catch (err) {
			if (err.response?.status === 401) {
				console.warn("Airtable token expired or revoked.");
				return res.json({
					connected: true,
					tokenValid: false,
					connectedAt: integration.createdAt || new Date(),
					message: "Token expired or unauthorized.",
				});
			}
			throw err;
		}
	} catch (err) {
		console.error("Status check failed:", err.message);
		res.status(500).json({
			connected: false,
			tokenValid: false,
			message: "Server error while checking Airtable status.",
		});
	}
};
