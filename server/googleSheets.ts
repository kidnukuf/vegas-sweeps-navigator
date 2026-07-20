import { google } from "googleapis";

let _sheetsClient: any = null;

export async function getSheetsClient() {
  if (!_sheetsClient) {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    _sheetsClient = google.sheets({ version: "v4", auth });
  }
  return _sheetsClient;
}
