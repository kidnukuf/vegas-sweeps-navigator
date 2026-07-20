/**
 * Email Templates & Safeguards Tests
 *
 * Comprehensive test suite for:
 * - HTML template generation
 * - Plain text template generation
 * - Duplicate send prevention
 * - Opt-out handling
 * - Email validation
 * - Unsubscribe URL generation
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  generateHtmlTemplate,
  generatePlainTextTemplate,
  checkDuplicateSend,
  isOptedOut,
  markOptedOut,
  logInvitationSend,
  isValidEmail,
  generateUnsubscribeUrl,
  initializeEmailInvitationTable,
} from "./emailTemplates";
import { rawExec, rawQuery } from "./db";

// Mock database functions
vi.mock("./db", () => ({
  rawExec: vi.fn(),
  rawQuery: vi.fn(),
}));

describe("emailTemplates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("HTML template generation", () => {
    it("generates valid HTML with all event details", () => {
      const html = generateHtmlTemplate({
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        eventName: "Vegas Bowling Championship",
        eventDate: "Saturday, July 20, 2026",
        eventLocation: "The Orleans Hotel, Las Vegas",
        rsrvpUrl: "https://example.com/rsvp/123",
      });

      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("John");
      expect(html).toContain("Vegas Bowling Championship");
      expect(html).toContain("Saturday, July 20, 2026");
      expect(html).toContain("The Orleans Hotel, Las Vegas");
      expect(html).toContain("https://example.com/rsvp/123");
      expect(html).toContain("Confirm Your RSVP");
    });

    it("includes custom message when provided", () => {
      const html = generateHtmlTemplate({
        firstName: "Jane",
        lastName: "Smith",
        email: "jane@example.com",
        eventName: "Summer Bowling",
        eventDate: "July 25, 2026",
        eventLocation: "Bowling Alley",
        rsrvpUrl: "https://example.com/rsvp/456",
        customMessage: "Special early-bird discount available!",
      });

      expect(html).toContain("Special early-bird discount available!");
    });

    it("includes unsubscribe link when provided", () => {
      const html = generateHtmlTemplate({
        firstName: "Bob",
        lastName: "Johnson",
        email: "bob@example.com",
        eventName: "Bowling Event",
        eventDate: "August 1, 2026",
        eventLocation: "Venue",
        rsrvpUrl: "https://example.com/rsvp/789",
        unsubscribeUrl: "https://example.com/unsubscribe?email=bob@example.com",
      });

      expect(html).toContain("Unsubscribe from event invitations");
      expect(html).toContain("https://example.com/unsubscribe?email=bob@example.com");
    });

    it("escapes HTML special characters in user input", () => {
      const html = generateHtmlTemplate({
        firstName: "John<script>",
        lastName: "Doe&Co",
        email: "john@example.com",
        eventName: 'Event "Quotes"',
        eventDate: "July 20, 2026",
        eventLocation: "Location & Venue",
        rsrvpUrl: "https://example.com/rsvp/123",
      });

      expect(html).toContain("John&lt;script&gt;");
      expect(html).toContain("Event &quot;Quotes&quot;");
      expect(html).toContain("Location &amp; Venue");
      expect(html).not.toContain("<script>");
    });

    it("includes responsive design styles", () => {
      const html = generateHtmlTemplate({
        firstName: "Test",
        lastName: "User",
        email: "test@example.com",
        eventName: "Event",
        eventDate: "Date",
        eventLocation: "Location",
        rsrvpUrl: "https://example.com",
      });

      expect(html).toContain("@media (max-width: 600px)");
      expect(html).toContain("max-width: 600px");
      expect(html).toContain("viewport");
    });
  });

  describe("plain text template generation", () => {
    it("generates valid plain text with all event details", () => {
      const text = generatePlainTextTemplate({
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        eventName: "Vegas Bowling Championship",
        eventDate: "Saturday, July 20, 2026",
        eventLocation: "The Orleans Hotel, Las Vegas",
        rsrvpUrl: "https://example.com/rsvp/123",
      });

      expect(text).toContain("Hi John");
      expect(text).toContain("Vegas Bowling Championship");
      expect(text).toContain("Saturday, July 20, 2026");
      expect(text).toContain("The Orleans Hotel, Las Vegas");
      expect(text).toContain("https://example.com/rsvp/123");
    });

    it("includes custom message in plain text", () => {
      const text = generatePlainTextTemplate({
        firstName: "Jane",
        lastName: "Smith",
        email: "jane@example.com",
        eventName: "Summer Bowling",
        eventDate: "July 25, 2026",
        eventLocation: "Bowling Alley",
        rsrvpUrl: "https://example.com/rsvp/456",
        customMessage: "Early bird special!",
      });

      expect(text).toContain("Early bird special!");
      expect(text).toContain("SPECIAL MESSAGE");
    });

    it("includes unsubscribe link in plain text", () => {
      const text = generatePlainTextTemplate({
        firstName: "Bob",
        lastName: "Johnson",
        email: "bob@example.com",
        eventName: "Bowling Event",
        eventDate: "August 1, 2026",
        eventLocation: "Venue",
        rsrvpUrl: "https://example.com/rsvp/789",
        unsubscribeUrl: "https://example.com/unsubscribe?email=bob@example.com",
      });

      expect(text).toContain("Unsubscribe");
      expect(text).toContain("https://example.com/unsubscribe?email=bob@example.com");
    });

    it("does not include HTML tags", () => {
      const text = generatePlainTextTemplate({
        firstName: "Test",
        lastName: "User",
        email: "test@example.com",
        eventName: "Event",
        eventDate: "Date",
        eventLocation: "Location",
        rsrvpUrl: "https://example.com",
      });

      expect(text).not.toContain("<");
      expect(text).not.toContain(">");
      expect(text).not.toContain("DOCTYPE");
    });
  });

  describe("duplicate send prevention", () => {
    it("returns isDuplicate=false when no previous send found", async () => {
      vi.mocked(rawQuery).mockResolvedValue([]);

      const result = await checkDuplicateSend("john@example.com", "Event 1");

      expect(result.isDuplicate).toBe(false);
      expect(result.lastSentAt).toBeUndefined();
    });

    it("returns isDuplicate=true when send found within 24 hours", async () => {
      const sentTime = Date.now() - 12 * 60 * 60 * 1000; // 12 hours ago
      vi.mocked(rawQuery).mockResolvedValue([{ sent_at: sentTime }]);

      const result = await checkDuplicateSend("john@example.com", "Event 1");

      expect(result.isDuplicate).toBe(true);
      expect(result.lastSentAt).toBe(sentTime);
    });

    it("returns isDuplicate=false when previous send is older than 24 hours", async () => {
      vi.mocked(rawQuery).mockResolvedValue([]);

      const result = await checkDuplicateSend("john@example.com", "Event 1");

      expect(result.isDuplicate).toBe(false);
    });

    it("handles database errors gracefully", async () => {
      vi.mocked(rawQuery).mockRejectedValue(new Error("DB error"));

      const result = await checkDuplicateSend("john@example.com", "Event 1");

      expect(result.isDuplicate).toBe(false);
    });
  });

  describe("opt-out handling", () => {
    it("returns false when bowler is not opted out", async () => {
      vi.mocked(rawQuery).mockResolvedValue([]);

      const result = await isOptedOut("john@example.com");

      expect(result).toBe(false);
    });

    it("returns true when bowler is opted out", async () => {
      vi.mocked(rawQuery).mockResolvedValue([{ opt_out: true }]);

      const result = await isOptedOut("john@example.com");

      expect(result).toBe(true);
    });

    it("handles database errors gracefully", async () => {
      vi.mocked(rawQuery).mockRejectedValue(new Error("DB error"));

      const result = await isOptedOut("john@example.com");

      expect(result).toBe(false);
    });

    it("marks bowler as opted out", async () => {
      vi.mocked(rawExec).mockResolvedValue(undefined);

      await markOptedOut("john@example.com");

      expect(vi.mocked(rawExec)).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE email_invitations SET opt_out = TRUE"),
        ["john@example.com"]
      );
    });
  });

  describe("email validation", () => {
    it("validates correct email format", () => {
      expect(isValidEmail("john@example.com")).toBe(true);
      expect(isValidEmail("jane.smith+tag@example.co.uk")).toBe(true);
      expect(isValidEmail("test.email@subdomain.example.com")).toBe(true);
    });

    it("rejects invalid email formats", () => {
      expect(isValidEmail("invalid")).toBe(false);
      expect(isValidEmail("invalid@")).toBe(false);
      expect(isValidEmail("@example.com")).toBe(false);
      expect(isValidEmail("invalid @example.com")).toBe(false);
      expect(isValidEmail("")).toBe(false);
    });

    it("rejects emails exceeding 255 characters", () => {
      const longEmail = "a".repeat(250) + "@example.com";
      expect(isValidEmail(longEmail)).toBe(false);
    });
  });

  describe("unsubscribe URL generation", () => {
    it("generates valid unsubscribe URL", () => {
      const url = generateUnsubscribeUrl("https://example.com", "john@example.com");

      expect(url).toContain("https://example.com/api/email/unsubscribe");
      expect(url).toContain("email=john%40example.com");
    });

    it("properly encodes email in URL", () => {
      const url = generateUnsubscribeUrl("https://example.com", "john+tag@example.com");

      expect(url).toContain("john%2Btag%40example.com");
    });
  });

  describe("logging", () => {
    it("logs invitation send to database", async () => {
      vi.mocked(rawExec).mockResolvedValue(undefined);

      await logInvitationSend("John Doe", "john@example.com", "Event 1", "msg-123", false);

      expect(vi.mocked(rawExec)).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO email_invitations"),
        expect.arrayContaining(["John Doe", "john@example.com", "Event 1"])
      );
    });

    it("logs dry-run invitations", async () => {
      vi.mocked(rawExec).mockResolvedValue(undefined);

      await logInvitationSend("Jane Smith", "jane@example.com", "Event 2", null, true);

      expect(vi.mocked(rawExec)).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO email_invitations"),
        expect.arrayContaining([true])
      );
    });

    it("handles logging errors gracefully", async () => {
      vi.mocked(rawExec).mockRejectedValue(new Error("DB error"));

      // Should not throw
      await expect(
        logInvitationSend("John Doe", "john@example.com", "Event 1", "msg-123", false)
      ).resolves.toBeUndefined();
    });
  });

  describe("table initialization", () => {
    it("creates email_invitations table", async () => {
      vi.mocked(rawExec).mockResolvedValue(undefined);

      await initializeEmailInvitationTable();

      expect(vi.mocked(rawExec)).toHaveBeenCalledWith(
        expect.stringContaining("CREATE TABLE IF NOT EXISTS email_invitations")
      );
    });

    it("handles table creation errors gracefully", async () => {
      vi.mocked(rawExec).mockRejectedValue(new Error("Table exists"));

      // Should not throw
      await expect(initializeEmailInvitationTable()).resolves.toBeUndefined();
    });
  });
});
