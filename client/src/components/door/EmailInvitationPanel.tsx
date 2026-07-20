/**
 * EmailInvitationPanel — Bulk send event invitations to bowlers
 *
 * Allows doorman/ED to:
 * - Select individual bowlers or "Send All"
 * - Compose optional custom message
 * - Send invitations via backend email service (reads emails from Google Sheet column C)
 * - See success/failure feedback with Sonner toasts
 *
 * Respects existing Google Sheets reader patterns: backend fetches email from sheet,
 * frontend only passes bowler identity (first/last name).
 */

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { getAllGuests, type GuestRecord } from "@/lib/offlineDoorDb";

export function EmailInvitationPanel({
  eventId,
  eventName,
  mode,
}: {
  eventId: number;
  eventName: string;
  mode: "banquet" | "pool";
}) {
  const [guests, setGuests] = useState<GuestRecord[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set()); // token set
  const [customMessage, setCustomMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<
    | { kind: "idle" }
    | { kind: "sending"; count: number }
    | { kind: "success"; sent: number; failed: number }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const utils = trpc.useUtils();
  const sendInvitationMutation = trpc.emailInvitation.sendInvitation.useMutation();

  // Load all guests on mount
  useEffect(() => {
    (async () => {
      const all = await getAllGuests();
      setGuests(all);
    })();
  }, []);

  // Compute event details for RSVP link
  const eventData = useMemo(() => {
    // Construct RSVP URL (can be customized per deployment)
    const rsrvpUrl = `${window.location.origin}/events/${eventId}/rsvp`;
    // Event date: use today's date as fallback (in production, fetch from event details)
    const eventDate = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    // Event location: use mode-based label (in production, fetch from event details)
    const eventLocation = mode === "banquet" ? "Banquet Hall" : "Pool Party Venue";

    return { rsrvpUrl, eventDate, eventLocation };
  }, [eventId, mode]);

  // Compute selected bowlers
  const selectedGuests = useMemo(() => {
    return guests.filter((g) => selected.has(g.token));
  }, [guests, selected]);

  // Toggle individual selection
  function toggleGuest(token: string) {
    const next = new Set(selected);
    if (next.has(token)) {
      next.delete(token);
    } else {
      next.add(token);
    }
    setSelected(next);
  }

  // Select all / deselect all
  function toggleAll() {
    if (selected.size === guests.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(guests.map((g) => g.token)));
    }
  }

  // Send invitations to selected bowlers
  async function handleSend() {
    if (selectedGuests.length === 0) {
      toast.error("Select at least one bowler to send invitations to.");
      return;
    }

    setSending(true);
    setSendResult({ kind: "sending", count: selectedGuests.length });

    let sent = 0;
    let failed = 0;

    for (const guest of selectedGuests) {
      try {
        // Parse display name (format: "FirstName LastName" or "FirstName LastName (Team #)")
        const nameParts = guest.displayName.split(" ").filter((p) => p && !p.startsWith("("));
        const firstName = nameParts[0] || "";
        const lastName = nameParts.slice(1).join(" ") || "";

        await sendInvitationMutation.mutateAsync({
          firstName,
          lastName,
          eventName,
          eventDate: eventData.eventDate,
          eventLocation: eventData.eventLocation,
          rsrvpUrl: eventData.rsrvpUrl,
          customMessage: customMessage || undefined,
        });

        sent++;
      } catch (err) {
        console.error(`Failed to send invitation to ${guest.displayName}:`, err);
        failed++;
      }
    }

    setSending(false);
    setSendResult({ kind: "success", sent, failed });

    if (failed === 0) {
      toast.success(`Sent ${sent} invitation(s) successfully!`);
    } else if (sent === 0) {
      toast.error(`Failed to send all ${failed} invitation(s). Check logs and try again.`);
    } else {
      toast.warning(`Sent ${sent}, but ${failed} failed. Check logs for details.`);
    }

    // Clear selection after sending
    setSelected(new Set());
    setCustomMessage("");
  }

  return (
    <Card className="space-y-4 p-4">
      <div>
        <div className="text-lg font-semibold">Send Event Invitations</div>
        <div className="text-sm text-muted-foreground">
          Select bowlers and send email invitations. Emails are fetched from the Google Sheet (column C).
        </div>
      </div>

      {/* Custom message input */}
      <div className="space-y-2">
        <label className="text-sm font-semibold">Custom Message (optional)</label>
        <Textarea
          placeholder="Add a personal note to include in each invitation email…"
          value={customMessage}
          onChange={(e) => setCustomMessage(e.target.value)}
          className="h-20 resize-none"
        />
      </div>

      {/* Bowler selection */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold">
            Select Bowlers ({selected.size} of {guests.length})
          </label>
          <Button
            size="sm"
            variant="outline"
            onClick={toggleAll}
            disabled={guests.length === 0 || sending}
          >
            {selected.size === guests.length ? "Deselect All" : "Select All"}
          </Button>
        </div>

        {guests.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            No bowlers loaded. Load data in Setup first.
          </div>
        ) : (
          <div className="max-h-64 space-y-1 overflow-auto rounded-lg border p-2">
            {guests.map((guest) => (
              <label
                key={guest.token}
                className={`flex cursor-pointer items-center gap-3 rounded px-3 py-2 hover:bg-muted ${
                  selected.has(guest.token) ? "bg-muted" : ""
                }`}
              >
                <Checkbox
                  checked={selected.has(guest.token)}
                  onChange={() => toggleGuest(guest.token)}
                  disabled={sending}
                />
                <span className="flex-1">
                  <span className="font-semibold">{guest.displayName}</span>
                  {guest.teamNumber && (
                    <span className="ml-2 text-xs text-muted-foreground">Team {guest.teamNumber}</span>
                  )}
                </span>
                <Badge variant="secondary" className="text-xs">
                  {guest.alreadyUsedAtLoad || guest.usedThisSession ? "scanned" : "pending"}
                </Badge>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Send button and status */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={handleSend}
          disabled={sending || selectedGuests.length === 0}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          {sending
            ? `Sending ${selectedGuests.length}…`
            : `Send ${selectedGuests.length > 0 ? `(${selectedGuests.length})` : ""}`}
        </Button>

        {sendResult.kind === "sending" && (
          <span className="text-sm text-muted-foreground">
            Sending to {sendResult.count} bowler(s)…
          </span>
        )}

        {sendResult.kind === "success" && (
          <div className="text-sm">
            <span className="font-semibold text-emerald-600">
              ✓ Sent {sendResult.sent}
            </span>
            {sendResult.failed > 0 && (
              <span className="ml-2 font-semibold text-red-600">({sendResult.failed} failed)</span>
            )}
          </div>
        )}

        {sendResult.kind === "error" && (
          <span className="text-sm font-semibold text-red-600">✗ {sendResult.message}</span>
        )}
      </div>

      {/* Event details preview */}
      <div className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
        <div className="font-semibold">Invitation Details:</div>
        <div>Event: {eventName}</div>
        <div>Date: {eventData.eventDate}</div>
        <div>Location: {eventData.eventLocation}</div>
        <div>RSVP Link: {eventData.rsrvpUrl}</div>
      </div>
    </Card>
  );
}
