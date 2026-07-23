/**
 * TeamPayoutsTab — Prize pool configuration, paytable management, and team results entry.
 *
 * Section 1 — Prize Pool Setup:
 *   - Mode toggle: "% of Prize Pool" | "Fixed $ per Place"
 *   - Total prize pool dollar input
 *   - Paytable paste textarea (one entry per line)
 *   - Live dollar calculation display
 *   - Save button
 *
 * Section 2 — Team Results:
 *   - All teams listed: Team Name, Team # (teamCode), Center Name
 *   - Sorted: Center → Team # (ascending)
 *   - Place input per team → auto-calculates payout from paytable
 *   - Score input (optional)
 *   - Dollar override input (manual override of calculated amount)
 *   - Save per row (debounced auto-save on blur)
 *   - Saved rows show green checkmark; unsaved show amber dot
 */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type PaytableMode = "percentage" | "rank";

interface ParsedEntry {
  place: number;
  percentage?: number | null;
  amount?: number | null;
  error?: string;
}

interface TeamRow {
  id: number;         // teams.id
  teamName: string;
  teamCode: string;
  centerName: string;
}

interface ResultDraft {
  place: string;       // raw input string
  score: string;       // raw input string
  payoutOverride: string; // raw input string (empty = use calculated)
  dirty: boolean;      // has unsaved changes
  saving: boolean;
  savedAt: Date | null;
}

// ─── Parse paytable text ──────────────────────────────────────────────────────

function parsePaytableText(text: string, mode: PaytableMode): ParsedEntry[] {
  const lines = text.split("\n");
  const entries: ParsedEntry[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(\d+)(?:st|nd|rd|th)?[:\s]+(.+)$/i);
    if (!match) {
      entries.push({ place: entries.length + 1, error: `Cannot parse: "${line}"` });
      continue;
    }
    const place = parseInt(match[1], 10);
    const valueStr = match[2].trim();
    if (mode === "percentage") {
      const pctMatch = valueStr.match(/^(\d+(?:\.\d+)?)\s*%$/);
      if (pctMatch) {
        const pct = parseFloat(pctMatch[1]);
        entries.push(pct < 0 || pct > 100 ? { place, error: `Out of range: ${pct}%` } : { place, percentage: pct });
      } else {
        const num = parseFloat(valueStr.replace(/[$,]/g, ""));
        entries.push(!isNaN(num) ? { place, percentage: num } : { place, error: `Expected %, got: "${valueStr}"` });
      }
    } else {
      const dollarMatch = valueStr.match(/^\$?([\d,]+(?:\.\d{1,2})?)$/);
      if (dollarMatch) {
        const amount = parseFloat(dollarMatch[1].replace(/,/g, ""));
        entries.push(amount < 0 ? { place, error: `Negative: ${amount}` } : { place, amount });
      } else {
        entries.push({ place, error: `Expected $, got: "${valueStr}"` });
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

/** Look up the dollar payout for a given place from the paytable. Returns null if not found. */
function lookupPayout(place: number, entries: ParsedEntry[], mode: PaytableMode, total: number): number | null {
  const entry = entries.find((e) => !e.error && e.place === place);
  if (!entry) return null;
  if (mode === "percentage") {
    return (total * (entry.percentage ?? 0)) / 100;
  }
  return entry.amount ?? null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TeamPayoutsTab({ eventId }: { eventId: number }) {
  const utils = trpc.useUtils();

  // ── Server data ──
  const { data: poolData, isLoading: poolLoading } = trpc.prizePool.getEventPrizePool.useQuery({ eventId });
  const { data: teamsRaw = [], isLoading: teamsLoading } = trpc.teams.listByEvent.useQuery({ eventId });
  const { data: savedPayoutsRaw = [], isLoading: payoutsLoading } = trpc.prizePool.getTeamPayouts.useQuery({ eventId });

  // ── Mutations ──
  const upsertPool = trpc.prizePool.upsertPrizePool.useMutation();
  const setPaytableMut = trpc.prizePool.setPaytable.useMutation();
  const upsertResult = trpc.prizePool.upsertTeamResult.useMutation();
  const clearResult = trpc.prizePool.clearTeamResult.useMutation();

  // ── Prize pool form state ──
  const [mode, setMode] = useState<PaytableMode>("percentage");
  const [totalAmount, setTotalAmount] = useState("");
  const [paytableText, setPaytableText] = useState("");
  const [isSavingPool, setIsSavingPool] = useState(false);

  // ── Team results draft state: teamId → ResultDraft ──
  const [drafts, setDrafts] = useState<Record<number, ResultDraft>>({});

  // ── Load prize pool into form ──
  useEffect(() => {
    if (!poolData?.pool) return;
    const p = poolData.pool;
    setMode((p.paytableMode as PaytableMode) ?? "percentage");
    setTotalAmount(parseFloat(p.totalAmount).toFixed(2));
    if (poolData.entries.length > 0) {
      const lines = poolData.entries.map((e) => {
        if (p.paytableMode === "percentage" && e.percentage != null)
          return `${e.place}: ${parseFloat(e.percentage)}%`;
        if (e.amount != null)
          return `${e.place}: $${parseFloat(e.amount).toFixed(2)}`;
        return `${e.place}: ?`;
      });
      setPaytableText(lines.join("\n"));
    }
  }, [poolData]);

  // ── Load saved payouts into drafts ──
  useEffect(() => {
    if (!savedPayoutsRaw || (savedPayoutsRaw as any[]).length === 0) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const row of savedPayoutsRaw as any[]) {
        const existing = next[row.teamId];
        // Only load from server if the draft is not dirty
        if (!existing || !existing.dirty) {
          next[row.teamId] = {
            place: row.finishingPlace != null ? String(row.finishingPlace) : "",
            score: row.score ?? "",
            payoutOverride: parseFloat(row.payoutAmount) > 0 ? parseFloat(row.payoutAmount).toFixed(2) : "",
            dirty: false,
            saving: false,
            savedAt: row.updatedAt ? new Date(row.updatedAt) : null,
          };
        }
      }
      return next;
    });
  }, [savedPayoutsRaw]);

  // ── Derived: teams sorted by center → teamCode ──
  const teams = useMemo(() => {
    const raw = teamsRaw as { id: number; teamName: string; teamCode: string; centerName: string }[];
    return [...raw].sort((a, b) => {
      const cmp = (a.centerName ?? "").localeCompare(b.centerName ?? "");
      if (cmp !== 0) return cmp;
      return (a.teamCode ?? "").localeCompare(b.teamCode ?? "");
    });
  }, [teamsRaw]);

  // ── Parse paytable live ──
  const parsedEntries = useMemo(() => parsePaytableText(paytableText, mode), [paytableText, mode]);
  const parseErrors = parsedEntries.filter((e) => e.error);
  const validEntries = parsedEntries.filter((e) => !e.error);
  const totalAmountNum = parseFloat(totalAmount.replace(/,/g, "")) || 0;
  const percentageSum = useMemo(
    () => (mode === "percentage" ? validEntries.reduce((s, e) => s + (e.percentage ?? 0), 0) : 0),
    [validEntries, mode]
  );

  // ── Prize pool save ──
  async function handleSavePool() {
    if (!totalAmount || totalAmountNum <= 0) { toast.error("Enter a valid prize pool total."); return; }
    if (validEntries.length === 0) { toast.error("Add at least one paytable entry."); return; }
    if (parseErrors.length > 0) { toast.error(`Fix ${parseErrors.length} parse error(s) first.`); return; }
    if (mode === "percentage" && Math.abs(percentageSum - 100) > 0.01) {
      if (!window.confirm(`Percentages sum to ${percentageSum.toFixed(2)}% (not 100%). Save anyway?`)) return;
    }
    setIsSavingPool(true);
    try {
      const poolResult = await upsertPool.mutateAsync({
        eventId, totalAmount: totalAmountNum.toFixed(2), paytableMode: mode, notes: null,
      });
      const entries = validEntries.map((e) => ({
        place: e.place,
        amount: mode === "rank" && e.amount != null ? e.amount.toFixed(2) : null,
        percentage: mode === "percentage" && e.percentage != null ? e.percentage.toFixed(3) : null,
        label: null,
      }));
      await setPaytableMut.mutateAsync({ eventId, prizePoolId: poolResult.id, entries });
      await utils.prizePool.getEventPrizePool.invalidate({ eventId });
      toast.success(`Prize pool saved — ${validEntries.length} places configured.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setIsSavingPool(false);
    }
  }

  // ── Draft helpers ──
  function getDraft(teamId: number): ResultDraft {
    return drafts[teamId] ?? { place: "", score: "", payoutOverride: "", dirty: false, saving: false, savedAt: null };
  }

  function setDraft(teamId: number, patch: Partial<ResultDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [teamId]: { ...getDraft(teamId), ...patch, dirty: true },
    }));
  }

  /** Computed payout for a team based on their entered place and the paytable. */
  function computedPayout(teamId: number): number | null {
    const draft = getDraft(teamId);
    const place = parseInt(draft.place, 10);
    if (!place || place < 1) return null;
    return lookupPayout(place, validEntries, mode, totalAmountNum);
  }

  /** The effective payout: override if set, otherwise computed. */
  function effectivePayout(teamId: number): number | null {
    const draft = getDraft(teamId);
    if (draft.payoutOverride !== "") {
      const v = parseFloat(draft.payoutOverride);
      return isNaN(v) ? null : v;
    }
    return computedPayout(teamId);
  }

  // ── Save a single team result ──
  const saveTeamResult = useCallback(
    async (teamId: number) => {
      const draft = getDraft(teamId);
      const pool = poolData?.pool;
      const place = parseInt(draft.place, 10);
      const payout = effectivePayout(teamId);

      // If nothing entered, clear the row
      if (!draft.place && !draft.score && !draft.payoutOverride) {
        setDrafts((prev) => ({ ...prev, [teamId]: { ...getDraft(teamId), saving: true } }));
        try {
          await clearResult.mutateAsync({ eventId, teamId });
          setDrafts((prev) => ({
            ...prev,
            [teamId]: { place: "", score: "", payoutOverride: "", dirty: false, saving: false, savedAt: new Date() },
          }));
          await utils.prizePool.getTeamPayouts.invalidate({ eventId });
        } catch {
          setDrafts((prev) => ({ ...prev, [teamId]: { ...getDraft(teamId), saving: false } }));
        }
        return;
      }

      if (payout === null && draft.payoutOverride === "") {
        toast.error("Enter a place that exists in the paytable, or enter a manual dollar amount.");
        return;
      }

      setDrafts((prev) => ({ ...prev, [teamId]: { ...getDraft(teamId), saving: true } }));
      try {
        await upsertResult.mutateAsync({
          eventId,
          teamId,
          prizePoolId: pool?.id ?? null,
          finishingPlace: place > 0 ? place : null,
          score: draft.score || null,
          payoutAmount: (payout ?? 0).toFixed(2),
          notes: null,
        });
        setDrafts((prev) => ({
          ...prev,
          [teamId]: { ...getDraft(teamId), dirty: false, saving: false, savedAt: new Date() },
        }));
        await utils.prizePool.getTeamPayouts.invalidate({ eventId });
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Save failed");
        setDrafts((prev) => ({ ...prev, [teamId]: { ...getDraft(teamId), saving: false } }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drafts, poolData, validEntries, mode, totalAmountNum, eventId]
  );

  // ── Render ──
  const isLoading = poolLoading || teamsLoading || payoutsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
        Loading prize pool…
      </div>
    );
  }

  const paytableReady = validEntries.length > 0 && parseErrors.length === 0;

  return (
    <div className="space-y-8 max-w-5xl">
      {/* ════════════════════════════════════════════════════════════════════════
          SECTION 1 — Prize Pool Setup
      ════════════════════════════════════════════════════════════════════════ */}
      <div>
        <h2 className="text-xl font-bold text-yellow-400">🏆 Team Payouts</h2>
        <p className="text-gray-400 text-sm mt-1">
          Step 1: configure the prize pool and paytable. Step 2: enter each team's result below.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="bg-[#1a1a1a] rounded-2xl border border-yellow-500/30 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-yellow-400">Payout Mode</h3>
        <div className="flex gap-3">
          {(["percentage", "rank"] as PaytableMode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all border ${
                mode === m ? "bg-yellow-600 border-yellow-500 text-white"
                  : "bg-[#111] border-white/20 text-gray-400 hover:text-white hover:border-white/40"
              }`}>
              {m === "percentage" ? "% of Prize Pool" : "Fixed $ per Place"}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500">
          {mode === "percentage"
            ? 'Enter percentages per line: "1: 30%", "2: 20%"'
            : 'Enter fixed dollar amounts per line: "1: $1500", "2: $1000"'}
        </p>
      </div>

      {/* Total + paytable side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-300">Total Prize Pool</h3>
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-lg font-bold">$</span>
            <input type="number" min="0" step="0.01" placeholder="e.g. 5000.00"
              value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)}
              className="w-40 px-3 py-2 bg-[#111] border border-white/20 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-yellow-500" />
            {totalAmountNum > 0 && (
              <span className="text-green-400 font-semibold text-sm">{formatDollar(totalAmountNum)}</span>
            )}
          </div>
          <p className="text-xs text-gray-500">{teams.length} team{teams.length !== 1 ? "s" : ""} in this event.</p>
        </div>

        <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-300">Paytable</h3>
          <textarea rows={6} value={paytableText} onChange={(e) => setPaytableText(e.target.value)}
            placeholder={mode === "percentage" ? "1: 30%\n2: 20%\n3: 15%" : "1: $1500\n2: $1000\n3: $750"}
            className="w-full px-3 py-2 bg-[#111] border border-white/20 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-yellow-500 resize-y"
            spellCheck={false} />
        </div>
      </div>

      {/* Paytable preview */}
      {validEntries.length > 0 && (
        <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-5 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-300">Paytable Preview</h3>
            {mode === "percentage" && (
              <span className={`text-xs font-mono ${Math.abs(percentageSum - 100) < 0.01 ? "text-green-400" : "text-amber-400"}`}>
                {percentageSum.toFixed(1)}% total
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {validEntries.map((e) => {
              const dollar = mode === "percentage"
                ? (totalAmountNum * (e.percentage ?? 0)) / 100
                : (e.amount ?? 0);
              return (
                <div key={e.place} className="flex items-center justify-between px-3 py-1.5 bg-[#111] rounded-lg border border-white/5 text-xs">
                  <span className="text-gray-400 font-semibold">{ordinal(e.place)}</span>
                  <span className="text-green-400 font-bold font-mono">{formatDollar(dollar)}</span>
                </div>
              );
            })}
          </div>
          {parseErrors.length > 0 && (
            <div className="mt-2 space-y-1">
              {parseErrors.map((e, i) => (
                <p key={i} className="text-red-400 text-xs font-mono">Place {e.place}: {e.error}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Save prize pool button */}
      <div className="flex items-center gap-4">
        <button onClick={handleSavePool} disabled={isSavingPool}
          className="px-6 py-2.5 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white font-bold rounded-lg text-sm transition-all active:scale-95">
          {isSavingPool ? "Saving…" : "Save Prize Pool & Paytable"}
        </button>
        {poolData?.pool && (
          <span className="text-xs text-gray-500">
            Last saved: {new Date(poolData.pool.updatedAt).toLocaleString()}
          </span>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          SECTION 2 — Team Results
      ════════════════════════════════════════════════════════════════════════ */}
      <div className="border-t border-white/10 pt-8">
        <div className="mb-4">
          <h3 className="text-lg font-bold text-white">📋 Team Results</h3>
          <p className="text-gray-400 text-sm mt-1">
            Enter each team's finishing place and/or score. The payout is calculated automatically from the paytable.
            Override the dollar amount if needed. Changes save on blur.
          </p>
          {!paytableReady && (
            <div className="mt-2 px-3 py-2 bg-amber-900/30 border border-amber-500/40 rounded-lg text-amber-300 text-xs">
              ⚠ Save a valid paytable above first so payouts can be calculated automatically.
            </div>
          )}
        </div>

        {teams.length === 0 ? (
          <p className="text-gray-500 text-sm">No teams found for this event.</p>
        ) : (
          <div className="rounded-2xl border border-white/10 overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-0 bg-[#111] border-b border-white/10 px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
              <span>Team</span>
              <span>Team #</span>
              <span>Center</span>
              <span>Place</span>
              <span>Score</span>
              <span>Payout ($)</span>
              <span className="w-16 text-center">Save</span>
            </div>

            {/* Team rows */}
            <div className="divide-y divide-white/5">
              {teams.map((team, idx) => {
                const draft = getDraft(team.id);
                const calc = computedPayout(team.id);
                const effective = effectivePayout(team.id);
                const isOverridden = draft.payoutOverride !== "" && calc !== null && Math.abs(parseFloat(draft.payoutOverride) - calc) > 0.005;

                return (
                  <div
                    key={team.id}
                    className={`grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-0 items-center px-4 py-2 text-sm transition-colors ${
                      idx % 2 === 0 ? "bg-[#1a1a1a]" : "bg-[#161616]"
                    } ${draft.dirty ? "border-l-2 border-amber-500" : draft.savedAt ? "border-l-2 border-green-600" : "border-l-2 border-transparent"}`}
                  >
                    {/* Team name */}
                    <div className="pr-3 min-w-0">
                      <p className="text-white font-semibold truncate">{team.teamName || "—"}</p>
                    </div>

                    {/* Team # */}
                    <div className="text-gray-400 font-mono text-xs">{team.teamCode}</div>

                    {/* Center */}
                    <div className="text-gray-400 text-xs truncate pr-2">{team.centerName}</div>

                    {/* Place input */}
                    <div>
                      <input
                        type="number"
                        min="1"
                        placeholder="—"
                        value={draft.place}
                        onChange={(e) => setDraft(team.id, { place: e.target.value, payoutOverride: "" })}
                        onBlur={() => { if (draft.dirty) saveTeamResult(team.id); }}
                        className="w-16 px-2 py-1 bg-[#111] border border-white/20 rounded text-white text-xs font-mono focus:outline-none focus:border-yellow-500 text-center"
                      />
                    </div>

                    {/* Score input */}
                    <div>
                      <input
                        type="text"
                        placeholder="—"
                        value={draft.score}
                        onChange={(e) => setDraft(team.id, { score: e.target.value })}
                        onBlur={() => { if (draft.dirty) saveTeamResult(team.id); }}
                        className="w-20 px-2 py-1 bg-[#111] border border-white/20 rounded text-white text-xs font-mono focus:outline-none focus:border-yellow-500 text-center"
                      />
                    </div>

                    {/* Payout input (auto-filled or override) */}
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500 text-xs">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder={calc != null ? calc.toFixed(2) : "—"}
                        value={draft.payoutOverride}
                        onChange={(e) => setDraft(team.id, { payoutOverride: e.target.value })}
                        onBlur={() => { if (draft.dirty) saveTeamResult(team.id); }}
                        className={`w-24 px-2 py-1 bg-[#111] border rounded text-xs font-mono focus:outline-none text-right ${
                          isOverridden
                            ? "border-amber-500 text-amber-300 focus:border-amber-400"
                            : "border-white/20 text-green-400 focus:border-yellow-500"
                        }`}
                      />
                      {calc != null && draft.payoutOverride === "" && (
                        <span className="text-green-400 text-xs font-mono ml-1 whitespace-nowrap">
                          {formatDollar(calc)}
                        </span>
                      )}
                    </div>

                    {/* Status / save button */}
                    <div className="w-16 flex items-center justify-center">
                      {draft.saving ? (
                        <span className="text-gray-400 text-xs">…</span>
                      ) : draft.dirty ? (
                        <button
                          onClick={() => saveTeamResult(team.id)}
                          className="px-2 py-1 bg-yellow-600 hover:bg-yellow-500 text-white text-xs font-bold rounded transition-all active:scale-95">
                          Save
                        </button>
                      ) : draft.savedAt ? (
                        <span className="text-green-500 text-xs" title={`Saved ${draft.savedAt.toLocaleTimeString()}`}>✓</span>
                      ) : (
                        <span className="text-gray-600 text-xs">—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summary footer */}
            <div className="bg-[#111] border-t border-white/10 px-4 py-3 flex items-center justify-between text-xs text-gray-400">
              <span>
                {Object.values(drafts).filter((d) => d.savedAt && !d.dirty).length} of {teams.length} teams have results saved
              </span>
              {paytableReady && (
                <span className="text-green-400 font-semibold">
                  Total paid out:{" "}
                  {formatDollar(
                    Object.entries(drafts)
                      .filter(([, d]) => d.savedAt && !d.dirty)
                      .reduce((sum, [tid]) => {
                        const eff = effectivePayout(Number(tid));
                        return sum + (eff ?? 0);
                      }, 0)
                  )}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
