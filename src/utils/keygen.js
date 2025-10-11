import crypto from "crypto";

export const generatePKCE = () => {
	const codeVerifier = crypto.randomBytes(32).toString("base64url");
	const hash = crypto
		.createHash("sha256")
		.update(codeVerifier)
		.digest("base64url");
	const codeChallenge = hash;
	return { codeVerifier, codeChallenge };
};
