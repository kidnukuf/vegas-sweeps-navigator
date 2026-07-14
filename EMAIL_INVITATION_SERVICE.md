# Email Invitation Service

## Overview

The email invitation service enables event directors to send professional invitation emails to bowlers directly from the Vegas Sweeps Navigator application. The service integrates with Google Sheets to fetch bowler contact information and uses nodemailer for reliable SMTP delivery.

## Architecture

### Components

1. **emailInvitation.ts** — Core service logic
   - Google Sheets integration (reads bowler emails from column C)
   - SMTP transporter management
   - Rate limiting (configurable per hour)
   - Email template generation
   - Database logging

2. **routers/emailInvitation.ts** — tRPC endpoints
   - `sendInvitation` — Send invitation to a bowler
   - `sendTest` — Test SMTP configuration
   - `list` — View invitation history
   - `status` — Check service configuration

3. **emailInvitation.test.ts** — Comprehensive test suite
   - 14 tests covering all major flows
   - Error handling validation
   - Configuration validation

## Configuration

### Environment Variables

Required for production:

```bash
SMTP_HOST=smtp.gmail.com          # SMTP server hostname
SMTP_PORT=587                      # SMTP port (587 for TLS, 465 for SSL)
SMTP_USER=your-email@gmail.com    # SMTP authentication username
SMTP_PASS=app-password            # SMTP authentication password (use app-specific password for Gmail)
SMTP_FROM=noreply@vegas-sweeps.local  # Sender email address (optional)
EMAIL_RATE_LIMIT_PER_HOUR=100     # Max emails per hour (optional, default: 100)
```

### Gmail Configuration (Recommended)

1. Enable 2-Factor Authentication on your Gmail account
2. Generate an App Password: https://myaccount.google.com/apppasswords
3. Use the generated password as `SMTP_PASS`

### Other Email Providers

- **SendGrid**: Use `smtp.sendgrid.net` with port 587
- **Mailgun**: Use `smtp.mailgun.org` with port 587
- **AWS SES**: Use `email-smtp.{region}.amazonaws.com` with port 587

## Google Sheets Integration

### Email Column Mapping

The service reads bowler emails from **Column C** (no color = director data) in the Google Sheet.

**Column Layout:**
- Column A (Bowler ID) — Written by app
- Column B (Phone) — Written by app
- **Column C (Email)** — **← Read by email service**
- Columns D-W — Director-supplied data (purple)
- Columns X+ — App-written QR codes and status

### Sheet Target Resolution

The service resolves sheet targets in this order:

1. **Event-specific sheet** (if configured in Event Settings)
2. **Fallback sheet** (if set in `FALLBACK_SPREADSHEET_ID` in googleSheets.ts)
3. **Error** if neither is available

## API Usage

### Send Invitation Email

```typescript
// tRPC endpoint: emailInvitation.sendInvitation
const result = await trpc.emailInvitation.sendInvitation.mutate({
  firstName: "John",
  lastName: "Doe",
  eventName: "Vegas Sweeps 2026",
  eventDate: "July 15, 2026",
  eventLocation: "Bowling Center",
  rsrvpUrl: "https://vegas-sweeps.local/events/123/rsvp",
  customMessage: "We're excited to see you there!", // Optional
  spreadsheetId: "custom-sheet-id", // Optional (overrides default)
  sheetName: "Sheet1", // Optional (overrides default)
});

// Response:
// {
//   success: true,
//   email: "john@example.com",
//   message: "Invitation sent to john@example.com"
// }
```

### Send Test Email

```typescript
// Verify SMTP configuration is working
const result = await trpc.emailInvitation.sendTest.mutate({
  testEmail: "your-email@example.com"
});

// Response:
// {
//   success: true,
//   message: "Test email sent successfully to your-email@example.com. Message ID: ..."
// }
```

### List Invitation History

```typescript
// View recent invitations sent
const invitations = await trpc.emailInvitation.list.query({
  limit: 50,
  eventName: "Vegas Sweeps 2026" // Optional filter
});

// Response:
// [
//   {
//     id: 1,
//     bowlerName: "John Doe",
//     email: "john@example.com",
//     eventName: "Vegas Sweeps 2026",
//     sentAt: 1720000000000,
//     status: "sent"
//   },
//   ...
// ]
```

### Check Service Status

```typescript
// View SMTP configuration status
const status = await trpc.emailInvitation.status.query();

// Response:
// {
//   configured: true,
//   smtpHost: "sm***om",
//   smtpPort: 587,
//   smtpFrom: "noreply@vegas-sweeps.local",
//   message: "SMTP is configured and ready to send emails"
// }
```

## Email Template

The service generates a professional HTML email with:

- Event name, date, and location
- RSVP link/instructions
- Optional custom message
- Professional styling
- Mobile-responsive layout

**Template includes:**
- Gradient header with "You're Invited! 🎳"
- Event details in a highlighted box
- Clear call-to-action button
- Professional footer

## Rate Limiting

### How It Works

- **Per-email limit**: Tracks emails sent to each address within a 1-hour window
- **Hourly reset**: Limit counter resets every hour
- **In-memory cache**: Uses fast in-memory cache (no database overhead)
- **Configurable**: Set `EMAIL_RATE_LIMIT_PER_HOUR` env var (default: 100)

### Example

With `EMAIL_RATE_LIMIT_PER_HOUR=100`:

```
Hour 1 (00:00-01:00):
  - john@example.com: 50 emails ✓
  - jane@example.com: 50 emails ✓
  - john@example.com: 51st email ✗ (rate limited)

Hour 2 (01:00-02:00):
  - john@example.com: 1 email ✓ (counter reset)
```

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "Sheet target not configured" | No spreadsheet ID or sheet name | Set event sheet in Event Settings |
| "Bowler not found in sheet" | Name doesn't match sheet data | Verify bowler name spelling |
| "No email found for..." | Email column is empty | Add email to column C in sheet |
| "SMTP transporter not available" | SMTP config incomplete | Set SMTP_HOST, SMTP_USER, SMTP_PASS |
| "Rate limit exceeded" | Too many emails to same address | Wait 1 hour or increase EMAIL_RATE_LIMIT_PER_HOUR |

### Logging

All operations are logged with `[emailInvitation]` prefix:

```
[emailInvitation] Email sent to john@example.com (John Doe): <message-id>
[emailInvitation] Bowler not found in sheet: John Doe
[emailInvitation] Failed to fetch email from sheet (row 5): Error: ...
[emailInvitation] SMTP transporter initialized: smtp.gmail.com:587
```

## Database Schema

### email_invitations Table

```sql
CREATE TABLE email_invitations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bowler_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  event_name VARCHAR(255) NOT NULL,
  sent_at BIGINT NOT NULL,
  status VARCHAR(50) DEFAULT 'sent',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_event (event_name),
  INDEX idx_sent_at (sent_at)
);
```

**Columns:**
- `id` — Unique identifier
- `bowler_name` — Full name of bowler
- `email` — Email address sent to
- `event_name` — Event name from invitation
- `sent_at` — Timestamp when email was sent (milliseconds)
- `status` — Email status (currently always 'sent')
- `created_at` — Database record creation time

## Testing

### Run Tests

```bash
pnpm test server/emailInvitation.test.ts
```

### Test Coverage

- ✅ SMTP configuration validation
- ✅ Google Sheets integration
- ✅ Rate limiting logic
- ✅ Email template generation
- ✅ Database logging
- ✅ Error handling
- ✅ Configuration validation

### Manual Testing

1. **Configure SMTP** (see Configuration section above)
2. **Send test email**:
   ```typescript
   await trpc.emailInvitation.sendTest.mutate({
     testEmail: "your-email@example.com"
   });
   ```
3. **Check email** — Should arrive within 1-2 minutes
4. **Send real invitation**:
   ```typescript
   await trpc.emailInvitation.sendInvitation.mutate({
     firstName: "John",
     lastName: "Doe",
     eventName: "Test Event",
     eventDate: "July 15, 2026",
     eventLocation: "Test Center",
     rsrvpUrl: "https://example.com/rsvp"
   });
   ```

## Security Considerations

### Best Practices

1. **Use app-specific passwords** for Gmail (not your main password)
2. **Store SMTP credentials in environment variables** (never commit to git)
3. **Rate limit prevents abuse** (default 100 emails/hour per address)
4. **Email addresses are validated** before sending
5. **All operations are logged** for audit trail

### Production Deployment

1. Set all SMTP environment variables via Manus Secrets UI
2. Test with `sendTest` endpoint before bulk sending
3. Monitor invitation history via `list` endpoint
4. Check logs for any delivery failures

## Troubleshooting

### "SMTP transporter not available"

**Check:**
```bash
echo $SMTP_HOST
echo $SMTP_USER
echo $SMTP_PASS
```

**Fix:** Set all three environment variables

### "Bowler not found in sheet"

**Check:**
1. Bowler name matches exactly (case-insensitive)
2. Bowler is in the correct sheet
3. Event sheet is configured in Event Settings

**Fix:** Verify bowler name in sheet, update Event Settings if needed

### "No email found for..."

**Check:**
1. Email column (C) has a value for the bowler
2. Email is not the header "Email"

**Fix:** Add email to column C for the bowler

### Email not arriving

**Check:**
1. Test email works: `sendTest` endpoint
2. SMTP credentials are correct
3. Recipient email is not in spam folder
4. Email address is not rate-limited

**Fix:** 
- Verify SMTP credentials with email provider
- Check spam folder
- Wait 1 hour if rate-limited

## Future Enhancements

- [ ] Bulk invitation sending with progress tracking
- [ ] Email template customization per event
- [ ] Delivery status tracking (bounces, opens)
- [ ] Scheduled sending (send at specific time)
- [ ] Personalized email variables (bowler rank, team, etc.)
- [ ] Email preview before sending
- [ ] Resend failed invitations
- [ ] Unsubscribe management

## Support

For issues or questions:

1. Check the Troubleshooting section above
2. Review logs in `.manus-logs/devserver.log`
3. Run `pnpm test server/emailInvitation.test.ts` to verify service
4. Contact support with error message and logs
