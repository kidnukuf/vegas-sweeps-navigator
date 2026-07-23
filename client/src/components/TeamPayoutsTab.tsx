/**
 * TeamPayoutsTab — Prize pool configuration and paytable management for an event.
 *
 * Features:
 *  - Mode toggle: "Percentage of Prize Pool" | "Finishing Rank (fixed $)"
 *  - Total prize pool dollar input
 *  - Paytable paste textarea (one entry per line: "1: 30%" or "1: $500")
 *  - Live dollar calculation display (percentage mode)
 *  - Team count verification (how many teams will be paid vs. total teams)
 *  - Save button → upsertPrizePool + setPaytable
 */

import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type PaytableMode = "percentage" | "rank";

interface ParsedEntry {
  place: number;
  percentage?: number | null;
  amount?: number | null;
  label?: string;
  error?: string;
}

// ─── Parse paytable text ──────────────────────────────────────────────────────

/**
 * Parse a multi-line paytable string into structured entries.
 *
 * Accepted formats per line:
 *   1: 30%          → percentage mode
 *   1: 30.5%        → percentage mode with decimals
 *   1: $500         → rank/fixed mode
 *   1: $1,500.00    → rank/fixed mode with comma formatting
 *   1: 500          → rank/fixed mode (bare number treated as dollar amount)
 *   # comment       → ignored
 *   (blank line)    → ignored
 */
function parsePaytableText(text: string, mode: PaytableMode): ParsedEntry[] {
  const lines = text.split("\n");
  const entries: ParsedEntry[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    // Match "place: value" — place can be "1st", "2nd", "1", etc.
    const match = line.match(/^(\d+)(?:st|nd|rd|th)?[:\s]+(.+)$/i);
    if (!match) {
      entries.push({ place: entries.length + 1, error: `Cannot parse: "${line}"` });
      continue;
    }

    const place = parseInt(match[1], 10);
    const valueStr = match[2].trim();

    if (mode === "percentage") {
      // Expect "30%" or "30.5%"
      const pctMatch = valueStr.match(/^(\d+(?:\.\d+)?)\s*%$/);
      if (pctMatch) {
        const pct = parseFloat(pctMatch[1]);
        if (pct < 0 || pct > 100) {
          entries.push({ place, error: `Percentage out of range: ${pct}%` });
        } else {
          entries.push({ place, percentage: pct });
        }
      } else {
        // Try to interpret as a bare number (treat as percentage)
        const num = parseFloat(valueStr.replace(/[$,]/g, ""));
        if (!isNaN(num)) {
          entries.push({ place, percentage: num });
        } else {
          entries.push({ place, error: `Expected percentage (e.g. "30%"), got: "${valueStr}"` });
        }
      }
    } else {
      // rank mode — expect "$500" or "500" or "$1,500.00"
      const dollarMatch = valueStr.match(/^\$?([\d,]+(?:\.\d{1,2})?)$/);
      if (dollarMatch) {
        const amount = parseFloat(dollarMatch[1].replace(/,/g, ""));
        if (amount < 0) {
          entries.push({ place, error: `Amount cannot be negative: ${amount}` });
        } else {
          entries.push({ place, amount });
        }
      } else {
        entries.push({ place, error: `Expected dollar amount (e.g. "$500"), got: "${valueStr}"` });
      }
    }
  }

  return entries;
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function formatDollar(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TeamPayoutsTab({ eventId }: { eventId: number }) {
  const utils = trpc.useUtils();

  // ── Server data ──
  const { data: poolData, isLoading } = trpc.prizePool.getEventPrizePool.useQuery({ eventId });
  const { data: teamsRaw = [] } = trpc.teams.listByEvent.useQuery({ eventId });
  const teams = teamsRaw as { id: number; teamName: string }[];

  // ── Local form state ──
  const [mode, setMode] = useState<PaytableMode>("percentage");
  const [totalAmount, setTotalAmount] = useState("");
  const [paytableText, setPaytableText] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // ── Mutations ──
  const upsertPool = trpc.prizePool.upsertPrizePool.useMutation();
  const setPaytable = trpc.prizePool.setPaytable.useMutation();

  // ── Load existing data into form when fetched ──
  useEffect(() => {
    if (!poolData?.pool) return;
    const p = poolData.pool;
    setMode((p.paytableMode as PaytableMode) ?? "percentage");
    setTotalAmount(parseFloat(p.totalAmount).toFixed(2));

    if (poolData.entries.length > 0) {
      const lines = poolData.entries.map((e) => {
        const place = e.place;
        if (p.paytableMode === "percentage" && e.percentage != null) {
          return `${place}: ${parseFloat(e.percentage)}%`;
        } else if (e.amount != null) {
          return `${place}: $${parseFloat(e.amount).toFixed(2)}`;
        }
        return `${place}: ?`;
      });
      setPaytableText(lines.join("\n"));
    }
  }, [poolData]);

  // ── Parse paytable text live ──
  const parsedEntries = useMemo(
    () => parsePaytableText(paytableText, mode),
    [paytableText, mode]
  );

  const parseErrors = parsedEntries.filter((e) => e.error);
  const validEntries = parsedEntries.filter((e) => !e.error);

  // ── Calculate dollar amounts for percentage mode ──
  const totalAmountNum = parseFloat(totalAmount.replace(/,/g, "")) || 0;
  const totalPaidOut = useMemo(() => {
    if (mode === "percentage") {
      return validEntries.reduce((sum, e) => sum + (totalAmountNum * (e.percentage ?? 0)) / 100, 0);
    }
    return validEntries.reduce((sum, e) => sum + (e.amount ?? 0), 0);
  }, [validEntries, mode, totalAmountNum]);

  const percentageSum = useMemo(() => {
    if (mode !== "percentage") return 0;
    return validEntries.reduce((sum, e) => sum + (e.percentage ?? 0), 0);
  }, [validEntries, mode]);

  // ── Save handler ──
  async function handleSave() {
    if (!totalAmount || totalAmountNum <= 0) {
      toast.error("Enter a valid prize pool total amount.");
      return;
    }
    if (validEntries.length === 0) {
      toast.error("Add at least one paytable entry.");
      return;
    }
    if (parseErrors.length > 0) {
      toast.error(`Fix ${parseErrors.length} parse error(s) before saving.`);
      return;
    }
    if (mode === "percentage" && Math.abs(percentageSum - 100) > 0.01) {
      const confirm = window.confirm(
        `Percentages sum to ${percentageSum.toFixed(3)}% (not 100%). Save anyway?`
      );
      if (!confirm) return;
    }

    setIsSaving(true);
    try {
      // 1. Upsert prize pool
      const poolResult = await upsertPool.mutateAsync({
        eventId,
        totalAmount: totalAmountNum.toFixed(2),
        paytableMode: mode,
        notes: null,
      });

      // 2. Set paytable entries
      const entries = validEntries.map((e) => ({
        place: e.place,
        amount: mode === "rank" && e.amount != null ? e.amount.toFixed(2) : null,
        percentage: mode === "percentage" && e.percentage != null ? e.percentage.toFixed(3) : null,
        label: null,
      }));

      await setPaytable.mutateAsync({
        eventId,
        prizePoolId: poolResult.id,
        entries,
      });

      await utils.prizePool.getEventPrizePool.invalidate({ eventId });
      toast.success(`Prize pool saved — ${validEntries.length} place${validEntries.length !== 1 ? "s" : ""} configured.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Save failed";
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  }

  // ── Render ──
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
        Loading prize pool…
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-yellow-400">🏆 Team Payouts</h2>
        <p className="text-gray-400 text-sm mt-1">
          Configure the prize pool and paytable for this event. Paste one entry per line.
        </p>
      </div>

      {/* ── Mode toggle ── */}
      <div className="bg-[#1a1a1a] rounded-2xl border border-yellow-500/30 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-yellow-400">Payout Mode</h3>
        <div className="flex gap-3">
          {(["percentage", "rank"] as PaytableMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all border ${
                mode === m
                  ? "bg-yellow-600 border-yellow-500 text-white"
                  : "bg-[#111] border-white/20 text-gray-400 hover:text-white hover:border-white/40"
              }`}
            >
              {m === "percentage" ? "% of Prize Pool" : "Fixed $ per Place"}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500">
          {mode === "percentage"
            ? "Enter percentages (e.g. \"1: 30%\"). Dollar amounts are calculated from the total prize pool."
            : "Enter fixed dollar amounts per place (e.g. \"1: $500\"). Total prize pool is for reference only."}
        </p>
      </div>

      {/* ── Total prize pool ── */}
      <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-300">Total Prize Pool</h3>
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-lg font-bold">$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="e.g. 5000.00"
            value={totalAmount}
            onChange={(e) => setTotalAmount(e.target.value)}
            className="w-48 px-3 py-2 bg-[#111] border border-white/20 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-yellow-500"
          />
          {totalAmountNum > 0 && (
            <span className="text-green-400 font-semibold text-sm">{formatDollar(totalAmountNum)}</span>
          )}
        </div>
        <p className="text-xs text-gray-500">
          {teams.length} team{teams.length !== 1 ? "s" : ""} registered for this event.
        </p>
      </div>

      {/* ── Paytable input ── */}
      <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-300">Paytable</h3>
        <p className="text-xs text-gray-500">
          One entry per line.{" "}
          {mode === "percentage"
            ? 'Format: "1: 30%" or "2: 20%"'
            : 'Format: "1: $500" or "2: $300"'}
        </p>
        <textarea
          rows={10}
          value={paytableText}
          onChange={(e) => setPaytableText(e.target.value)}
          placeholder={
            mode === "percentage"
              ? "1: 30%\n2: 20%\n3: 15%\n4: 10%\n5: 8%"
              : "1: $1500\n2: $1000\n3: $750\n4: $500\n5: $250"
          }
          className="w-full px-3 py-2 bg-[#111] border border-white/20 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-yellow-500 resize-y"
          spellCheck={false}
        />
      </div>

      {/* ── Live preview ── */}
      {validEntries.length > 0 && (
        <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-300">Preview</h3>
            <div className="flex gap-3 text-xs">
              <span className="text-gray-400">
                {validEntries.length} place{validEntries.length !== 1 ? "s" : ""} paid
              </span>
              {validEntries.length > teams.length && (
                <span className="text-amber-400 font-semibold">
                  ⚠ More places than teams ({teams.length})
                </span>
              )}
              {validEntries.length <= teams.length && (
                <span className="text-green-400">
                  ✓ {teams.length - validEntries.length} team{teams.length - validEntries.length !== 1 ? "s" : ""} unpaid
                </span>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            {validEntries.map((e) => {
              const dollarValue =
                mode === "percentage"
                  ? (totalAmountNum * (e.percentage ?? 0)) / 100
                  : (e.amount ?? 0);
              return (
                <div
                  key={e.place}
                  className="flex items-center justify-between px-3 py-2 bg-[#111] rounded-lg border border-white/5"
                >
                  <span className="text-gray-300 text-sm font-semibold w-16">{ordinal(e.place)}</span>
                  {mode === "percentage" && (
                    <span className="text-gray-400 text-sm font-mono">{e.percentage?.toFixed(1)}%</span>
                  )}
                  <span className="text-green-400 font-bold text-sm font-mono">
                    {formatDollar(dollarValue)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Totals row */}
          <div className="flex items-center justify-between px-3 py-2 bg-yellow-900/20 rounded-lg border border-yellow-500/30 mt-2">
            <span className="text-yellow-400 text-sm font-bold">Total Paid Out</span>
            {mode === "percentage" && (
              <span
                className={`text-sm font-mono ${
                  Math.abs(percentageSum - 100) < 0.01 ? "text-green-400" : "text-amber-400"
                }`}
              >
                {percentageSum.toFixed(1)}%
              </span>
            )}
            <span
              className={`font-bold text-sm font-mono ${
                mode === "rank" || Math.abs(totalPaidOut - totalAmountNum) < 0.01
                  ? "text-green-400"
                  : "text-amber-400"
              }`}
            >
              {formatDollar(totalPaidOut)}
              {mode === "percentage" && totalAmountNum > 0 && Math.abs(totalPaidOut - totalAmountNum) > 0.01 && (
                <span className="text-amber-400 text-xs ml-2">
                  ({formatDollar(totalAmountNum - totalPaidOut)} unallocated)
                </span>
              )}
            </span>
          </div>
        </div>
      )}

      {/* ── Parse errors ── */}
      {parseErrors.length > 0 && (
        <div className="bg-red-900/20 rounded-2xl border border-red-500/30 p-4 space-y-1.5">
          <h3 className="text-sm font-semibold text-red-400">Parse Errors</h3>
          {parseErrors.map((e, i) => (
            <p key={i} className="text-red-300 text-xs font-mono">
              Place {e.place}: {e.error}
            </p>
          ))}
        </div>
      )}

      {/* ── Save button ── */}
      <div className="flex items-center gap-4 pb-8">
        <button
          onClick={handleSave}
          disabled={isSaving || validEntries.length === 0 || parseErrors.length > 0}
          className="px-6 py-2.5 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white font-bold rounded-lg text-sm transition-all active:scale-95"
        >
          {isSaving ? "Saving…" : "Save Prize Pool & Paytable"}
        </button>
        {poolData?.pool && (
          <span className="text-xs text-gray-500">
            Last saved:{" "}
            {new Date(poolData.pool.updatedAt).toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}
