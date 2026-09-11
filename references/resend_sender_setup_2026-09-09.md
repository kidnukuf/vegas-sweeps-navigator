# Resend Sender Setup Findings — 2026-09-09

- The Resend dashboard has been authenticated for the account associated with `n82424@gmail.com`.
- The initial MCP credential was restricted to sending email only, so domain inspection must be completed through the authenticated dashboard.
- The connected Resend account has no sender domains configured. The `bowlvegas.com` sender-domain form is open, but the domain has not been added and no DNS record has been changed.
- The next safe action is to add `bowlvegas.com` to Resend solely to obtain its provider-generated DNS records, then present those records for explicit review before any Cloudflare DNS write.

The `bowlvegas.com` domain was submitted in Resend solely to generate verification requirements. The dashboard response has not yet been read; no DNS modification or email delivery has occurred.

Resend generated the manual DNS verification requirements for `bowlvegas.com`: one DKIM TXT record, one sending MX record, one sending SPF TXT record, and an optional DMARC TXT record. Sending is enabled in Resend's setup view and receiving is not enabled. No Cloudflare DNS write has occurred; the generated values must be reviewed and explicitly approved before any change is made.

| Purpose | Type | Name | Content | TTL | Priority |
|---|---|---|---|---|---|
| Domain verification | TXT | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDVaoeNBPOnMn8uMXIY/omM4QsVxB2MMcthMfILNDQFHxphZpeTptaJy+o70maP3KBrzKjoeWItdI9jE9HxEw+1InRU5gWmt8kxQ3WZavcvJuYrpQdZFBIOjtKua7X/zK1St6S3jNFPmdLmXLHdu2lzqTFYNcURmp+fWnePy82VswIDAQAB` | Auto | — |
| Sending route | MX | `send` | `feedback-smtp.eu-west-1.amazonses.com` | Auto | 10 |
| Sending policy | TXT | `send` | `v=spf1 include:amazonses.com ~all` | Auto | — |
| Policy, optional | TXT | `_dmarc` | `v=DMARC1; p=none;` | Auto | — |

This preview was read from the authenticated Resend setup page. It is not a record of completed DNS changes. Before creating any of these records, inspect the active Cloudflare zone for existing records at the same names and obtain explicit user confirmation.
- Cloudflare and R2 credentials previously pasted into conversation remain out of scope and must not be reused for this workflow.

## Approved DNS change — 2026-09-09

The user explicitly confirmed the reviewed DNS change. A collision check had already confirmed that the names were unused in the active `bowlvegas.com` Cloudflare zone. The following four records were then created successfully with automatic TTL and no proxying: DKIM TXT at `resend._domainkey`, sending MX at `send` (priority 10), sending SPF TXT at `send`, and the optional monitoring-only DMARC TXT at `_dmarc`.

Resend’s authenticated domain page now lists `bowlvegas.com` as **pending** and reports that it is checking DNS. At the time checked, DKIM, the sending MX, and SPF remained pending. The provider cautions that propagation may take several hours. No inbound-email receiving setting was enabled, no website-routing record was touched, and no email was sent.
