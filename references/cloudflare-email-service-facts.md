# Cloudflare Email Service facts used for claim verification

Sources consulted on 2026-10-08:

- https://developers.cloudflare.com/email-service/api/send-emails/rest-api/
- https://developers.cloudflare.com/email-service/get-started/send-emails/

Key verified requirements:

- REST sending uses `POST /accounts/{account_id}/email/sending/send` with `Authorization: Bearer <API_TOKEN>`.
- The API token must have Email Sending permission; an invalid or wrong token returns an authentication error.
- The sender domain/address must be onboarded for Email Sending in the Cloudflare account before outbound mail can be sent.
- Cloudflare onboarding may add bounce MX and SPF/DKIM/DMARC records for the sender domain.
- The API distinguishes invalid/unauthorized tokens (401), missing permission (403), account not entitled (403), and sending disabled (403).
- Email Sending is not the same as Cloudflare R2 storage credentials or an R2 endpoint.
