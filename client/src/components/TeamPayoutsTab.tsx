/**
 * TeamPayoutsTab — Prize pool setup, paytable management, team results entry,
 * cash denomination calculator, summary card, and Google Sheet write-back.
 *
 * Section 1 — Prize Pool Setup (mode, total, paytable paste, preview, save)
 * Section 2 — Team Results (place, score, payout, denomination breakdown per team)
 * Section 3 — Summary Card (total prize money paid, total bills required)
 * Section 4 — Grand Total Bill Counts (card grid per denomination)
 * Section 5 — Write Payouts to Google Sheet button
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  calcDenominations,
  sumDenominations,
  formatBreakdown,
  BILL_DENOMINATIONS,
  type DenominationBreakdown,
} from "../../../shared/denominations";
import PrintPayoutSheet, { type PrintTeamRow } from "./PrintPayoutSheet";

// ─── Types ────────────────────────────────────────────────────────────────────

type PaytableMode = "percentage" | "rank";

interface ParsedEntry {
  place: number;
  percentage?: number | null;
  amount?: number | null;
  error?: string;
}

interface ResultDraft {
  place: string;
  score: string;
  payoutOverride: string;
  dirty: boolean;
  saving: boolean;
  savedAt: Date | null;
  savedDenom: DenominationBreakdown | null;
}

// ─── Parse paytable text ──────────────────────────────────────────────────────

function parsePaytableText(text: string, mode: PaytableMode): ParsedEntry[] {
  const entries: ParsedEntry[] = [];
  for (const rawLine of text.split("\n")) {
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

function fmt$(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function lookupPayout(place: number, entries: ParsedEntry[], mode: PaytableMode, total: number): number | null {
  const e = entries.find((x) => !x.error && x.place === place);
  if (!e) return null;
  return mode === "percentage" ? (total * (e.percentage ?? 0)) / 100 : (e.amount ?? null);
}

// ─── Bill row component ───────────────────────────────────────────────────────

function BillRow({ label, counts }: { label: string; counts: Record<number, number> }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="text-gray-500 w-32 shrink-0 pt-0.5">{label}</span>
      <div className="flex gap-1.5 flex-wrap">
        {BILL_DENOMINATIONS.map((bill) =>
          counts[bill] > 0 ? (
            <span key={bill} className="px-2 py-0.5 bg-green-900/40 border border-green-600/40 rounded text-green-300 font-mono whitespace-nowrap">
              {counts[bill]}×${bill}
            </span>
          ) : null
        )}
        {BILL_DENOMINATIONS.every((b) => !counts[b]) && (
          <span className="text-gray-600">—</span>
        )}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TeamPayoutsTab({ eventId }: { eventId: number }) {
  const utils = trpc.useUtils();

  // ── Server data ──
  const { data: poolData, isLoading: poolLoading } = trpc.prizePool.getEventPrizePool.useQuery({ eventId });
  const { data: teamsRaw = [], isLoading: teamsLoading } = trpc.teams.listByEvent.useQuery({ eventId });
  const { data: savedPayoutsRaw = [], isLoading: payoutsLoading } = trpc.prizePool.getTeamPayouts.useQuery({ eventId });
  const { data: bowlerCountMap = {}, isLoading: countsLoading } = trpc.prizePool.getTeamBowlerCounts.useQuery({ eventId });

  // ── Mutations ──
  const upsertPool = trpc.prizePool.upsertPrizePool.useMutation();
  const setPaytableMut = trpc.prizePool.setPaytable.useMutation();
  const upsertResult = trpc.prizePool.upsertTeamResult.useMutation();
  const clearResult = trpc.prizePool.clearTeamResult.useMutation();
  const writeToSheet = trpc.prizePool.writePayoutsToSheet.useMutation();

  // ── Prize pool form state ──
  const [mode, setMode] = useState<PaytableMode>("percentage");
  const [totalAmount, setTotalAmount] = useState("");
  const [paytableText, setPaytableText] = useState("");
  const [isSavingPool, setIsSavingPool] = useState(false);
  const [isWritingSheet, setIsWritingSheet] = useState(false);
  const [showPrint, setShowPrint] = useState(false);

  // ── Team results draft state ──
  const [drafts, setDrafts] = useState<Record<number, ResultDraft>>({});

  // ── Load prize pool ──
  useEffect(() => {
    if (!poolData?.pool) return;
    const p = poolData.pool;
    setMode((p.paytableMode as PaytableMode) ?? "percentage");
    setTotalAmount(parseFloat(p.totalAmount).toFixed(2));
    if (poolData.entries.length > 0) {
      setPaytableText(
        poolData.entries
          .map((e) => {
            if (p.paytableMode === "percentage" && e.percentage != null)
              return `${e.place}: ${parseFloat(e.percentage)}%`;
            if (e.amount != null) return `${e.place}: $${parseFloat(e.amount).toFixed(2)}`;
            return `${e.place}: ?`;
          })
          .join("\n")
      );
    }
  }, [poolData]);

  // ── Load saved payouts into drafts ──
  useEffect(() => {
    if (!savedPayoutsRaw || (savedPayoutsRaw as any[]).length === 0) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const row of savedPayoutsRaw as any[]) {
        if (!next[row.teamId] || !next[row.teamId].dirty) {
          next[row.teamId] = {
            place: row.finishingPlace != null ? String(row.finishingPlace) : "",
            score: row.score ?? "",
            payoutOverride: parseFloat(row.payoutAmount) > 0 ? parseFloat(row.payoutAmount).toFixed(2) : "",
            dirty: false,
            saving: false,
            savedAt: row.updatedAt ? new Date(row.updatedAt) : null,
            savedDenom: row.denominationBreakdown ?? null,
          };
        }
      }
      return next;
    });
  }, [savedPayoutsRaw]);

  // ── Derived: teams sorted center → teamCode ──
  const teams = useMemo(() => {
    const raw = teamsRaw as { id: number; teamName: string; teamCode: string; centerName: string }[];
    return [...raw].sort((a, b) => {
      const c = (a.centerName ?? "").localeCompare(b.centerName ?? "");
      return c !== 0 ? c : (a.teamCode ?? "").localeCompare(b.teamCode ?? "");
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
  const paytableReady = validEntries.length > 0 && parseErrors.length === 0;

  // ── Draft helpers ──
  function getDraft(teamId: number): ResultDraft {
    return drafts[teamId] ?? { place: "", score: "", payoutOverride: "", dirty: false, saving: false, savedAt: null, savedDenom: null };
  }

  function setDraft(teamId: number, patch: Partial<ResultDraft>) {
    setDrafts((prev) => ({ ...prev, [teamId]: { ...getDraft(teamId), ...patch, dirty: true } }));
  }

  function computedPayout(teamId: number): number | null {
    const draft = getDraft(teamId);
    const place = parseInt(draft.place, 10);
    if (!place || place < 1) return null;
    return lookupPayout(place, validEntries, mode, totalAmountNum);
  }

  function effectivePayout(teamId: number): number | null {
    const draft = getDraft(teamId);
    if (draft.payoutOverride !== "") {
      const v = parseFloat(draft.payoutOverride);
      return isNaN(v) ? null : v;
    }
    return computedPayout(teamId);
  }

  function teamDenom(teamId: number): DenominationBreakdown | null {
    const payout = effectivePayout(teamId);
    if (payout === null || payout <= 0) return null;
    const bowlerCount = (bowlerCountMap as Record<number, number>)[teamId] ?? 1;
    return calcDenominations(payout, bowlerCount);
  }

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

  // ── Save a single team result ──
  const saveTeamResult = useCallback(
    async (teamId: number) => {
      const draft = getDraft(teamId);
      const pool = poolData?.pool;
      const place = parseInt(draft.place, 10);
      const payout = effectivePayout(teamId);

      if (!draft.place && !draft.score && !draft.payoutOverride) {
        setDrafts((prev) => ({ ...prev, [teamId]: { ...getDraft(teamId), saving: true } }));
        try {
          await clearResult.mutateAsync({ eventId, teamId });
          setDrafts((prev) => ({
            ...prev,
            [teamId]: { place: "", score: "", payoutOverride: "", dirty: false, saving: false, savedAt: new Date(), savedDenom: null },
          }));
          await utils.prizePool.getTeamPayouts.invalidate({ eventId });
        } catch {
          setDrafts((prev) => ({ ...prev, [teamId]: { ...getDraft(teamId), saving: false } }));
        }
        return;
      }

      if (payout === null && draft.payoutOverride === "") {
        toast.error("Enter a place in the paytable, or enter a manual dollar amount.");
        return;
      }

      const denom = teamDenom(teamId);

      setDrafts((prev) => ({ ...prev, [teamId]: { ...getDraft(teamId), saving: true } }));
      try {
        await upsertResult.mutateAsync({
          eventId,
          teamId,
          prizePoolId: pool?.id ?? null,
          finishingPlace: place > 0 ? place : null,
          score: draft.score || null,
          payoutAmount: (payout ?? 0).toFixed(2),
          denominationBreakdown: denom
            ? ({
                "100": denom.teamTotal[100],
                "50": denom.teamTotal[50],
                "20": denom.teamTotal[20],
                "10": denom.teamTotal[10],
                "5": denom.teamTotal[5],
                perBowler_100: denom.perBowler[100],
                perBowler_50: denom.perBowler[50],
                perBowler_20: denom.perBowler[20],
                perBowler_10: denom.perBowler[10],
                perBowler_5: denom.perBowler[5],
                bowlerCount: denom.bowlerCount,
                adjustedTotal: denom.adjustedTotal,
                delta: denom.delta,
              } as Record<string, number>)
            : null,
          notes: null,
        });
        setDrafts((prev) => ({
          ...prev,
          [teamId]: { ...getDraft(teamId), dirty: false, saving: false, savedAt: new Date(), savedDenom: denom },
        }));
        await utils.prizePool.getTeamPayouts.invalidate({ eventId });
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Save failed");
        setDrafts((prev) => ({ ...prev, [teamId]: { ...getDraft(teamId), saving: false } }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drafts, poolData, validEntries, mode, totalAmountNum, bowlerCountMap, eventId]
  );

  // ── Grand total denominations ──
  const { grandTotalDenom, grandTotalAmount, savedTeamCount, totalCommitted } = useMemo(() => {
    const breakdowns: DenominationBreakdown[] = [];
    let totalCommitted = 0;
    let savedTeamCount = 0;
    for (const team of teams) {
      const draft = getDraft(team.id);
      if (draft.savedAt && !draft.dirty) {
        const payout = effectivePayout(team.id);
        if (payout && payout > 0) {
          const bowlerCount = (bowlerCountMap as Record<number, number>)[team.id] ?? 1;
          const denom = calcDenominations(payout, bowlerCount);
          breakdowns.push(denom);
          totalCommitted += denom.adjustedTotal;
          savedTeamCount++;
        }
      }
    }
    const grandTotalDenom = sumDenominations(breakdowns);
    const grandTotalAmount = BILL_DENOMINATIONS.reduce((s, b) => s + grandTotalDenom[b] * b, 0);
    return { grandTotalDenom, grandTotalAmount, savedTeamCount, totalCommitted };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts, teams, bowlerCountMap, validEntries, mode, totalAmountNum]);

  // ── Build print rows ──
  const printRows: PrintTeamRow[] = useMemo(() => {
    return teams
      .map((team) => {
        const draft = getDraft(team.id);
        if (!draft.savedAt || draft.dirty) return null;
        const payout = effectivePayout(team.id);
        if (!payout || payout <= 0) return null;
        return {
          teamId: team.id,
          teamCode: team.teamCode,
          teamName: team.teamName,
          centerName: team.centerName,
          finishingPlace: parseInt(draft.place, 10) || null,
          score: draft.score,
          payoutAmount: payout,
          bowlerCount: (bowlerCountMap as Record<number, number>)[team.id] ?? 1,
        } satisfies PrintTeamRow;
      })
      .filter(Boolean) as PrintTeamRow[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts, teams, bowlerCountMap, validEntries, mode, totalAmountNum]);

  // ── Write to Google Sheet ──
  async function handleWriteToSheet() {
    const payouts = teams
      .map((team) => {
        const draft = getDraft(team.id);
        if (!draft.savedAt || draft.dirty) return null;
        const payout = effectivePayout(team.id);
        if (!payout || payout <= 0) return null;
        const bowlerCount = (bowlerCountMap as Record<number, number>)[team.id] ?? 1;
        const denom = calcDenominations(payout, bowlerCount);
        const perBowlerStr = formatBreakdown(denom.perBowler);
        const place = parseInt(draft.place, 10);
        return {
          teamCode: team.teamCode,
          finishingPlace: place > 0 ? place : null,
          payoutAmount: denom.adjustedTotal,
          billBreakdown: `${perBowlerStr} × ${bowlerCount} bowler${bowlerCount !== 1 ? "s" : ""} = ${fmt$(denom.adjustedTotal)}`,
        };
      })
      .filter(Boolean) as { teamCode: string; finishingPlace: number | null; payoutAmount: number; billBreakdown: string }[];

    if (payouts.length === 0) {
      toast.error("No saved team results to write. Save at least one team result first.");
      return;
    }

    setIsWritingSheet(true);
    try {
      const result = await writeToSheet.mutateAsync({ eventId, payouts });
      if (result.error) {
        toast.error(`Sheet write: ${result.error}`);
      } else {
        toast.success(`Written to Google Sheet: ${result.written} team${result.written !== 1 ? "s" : ""} updated${result.skipped > 0 ? `, ${result.skipped} skipped (no matching row)` : ""}.`);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Sheet write failed");
    } finally {
      setIsWritingSheet(false);
    }
  }

  const isLoading = poolLoading || teamsLoading || payoutsLoading || countsLoading;
  if (isLoading) {
    return <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Loading prize pool…</div>;
  }

  return (
    <div className="space-y-8 max-w-5xl">
      {/* ═══ SECTION 1 — Prize Pool Setup ═══════════════════════════════════════ */}
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
            ? 'Paste percentages: "1: 30%", "2: 20%"'
            : 'Paste fixed amounts: "1: $1500", "2: $1000"'}
        </p>
      </div>

      {/* Total + paytable */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-300">Total Prize Pool</h3>
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-lg font-bold">$</span>
            <input type="number" min="0" step="0.01" placeholder="e.g. 5000.00"
              value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)}
              className="w-40 px-3 py-2 bg-[#111] border border-white/20 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-yellow-500" />
            {totalAmountNum > 0 && <span className="text-green-400 font-semibold text-sm">{fmt$(totalAmountNum)}</span>}
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
              const dollar = mode === "percentage" ? (totalAmountNum * (e.percentage ?? 0)) / 100 : (e.amount ?? 0);
              return (
                <div key={e.place} className="flex items-center justify-between px-3 py-1.5 bg-[#111] rounded-lg border border-white/5 text-xs">
                  <span className="text-gray-400 font-semibold">{ordinal(e.place)}</span>
                  <span className="text-green-400 font-bold font-mono">{fmt$(dollar)}</span>
                </div>
              );
            })}
          </div>
          {parseErrors.map((e, i) => (
            <p key={i} className="text-red-400 text-xs font-mono">Place {e.place}: {e.error}</p>
          ))}
        </div>
      )}

      {/* Save pool button */}
      <div className="flex items-center gap-4">
        <button onClick={handleSavePool} disabled={isSavingPool}
          className="px-6 py-2.5 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white font-bold rounded-lg text-sm transition-all active:scale-95">
          {isSavingPool ? "Saving…" : "Save Prize Pool & Paytable"}
        </button>
        {poolData?.pool && (
          <span className="text-xs text-gray-500">Last saved: {new Date(poolData.pool.updatedAt).toLocaleString()}</span>
        )}
      </div>

      {/* ═══ SECTION 2 — Team Results ════════════════════════════════════════════ */}
      <div className="border-t border-white/10 pt-8">
        <div className="mb-4">
          <h3 className="text-lg font-bold text-white">📋 Team Results</h3>
          <p className="text-gray-400 text-sm mt-1">
            Enter each team's finishing place and/or score. The payout and bill breakdown are calculated automatically.
            Override the dollar amount if needed. Changes save on blur (Tab away) or click Save.
          </p>
          {!paytableReady && (
            <div className="mt-2 px-3 py-2 bg-amber-900/30 border border-amber-500/40 rounded-lg text-amber-300 text-xs">
              ⚠ Save a valid paytable above so payouts and denominations can be calculated automatically.
            </div>
          )}
        </div>

        {teams.length === 0 ? (
          <p className="text-gray-500 text-sm">No teams found for this event.</p>
        ) : (
          <div className="space-y-3">
            {teams.map((team) => {
              const draft = getDraft(team.id);
              const calc = computedPayout(team.id);
              const effective = effectivePayout(team.id);
              const isOverridden = draft.payoutOverride !== "" && calc !== null && Math.abs(parseFloat(draft.payoutOverride) - calc) > 0.005;
              const bowlerCount = (bowlerCountMap as Record<number, number>)[team.id] ?? 0;
              const denom = effective && effective > 0 ? calcDenominations(effective, bowlerCount || 1) : null;

              return (
                <div key={team.id}
                  className={`rounded-xl border transition-colors ${
                    draft.dirty ? "border-amber-500/60 bg-amber-900/10"
                      : draft.savedAt ? "border-green-700/40 bg-[#1a1a1a]"
                      : "border-white/8 bg-[#1a1a1a]"
                  }`}
                >
                  {/* Top row: team info + inputs */}
                  <div className="grid grid-cols-[2fr_auto_auto_auto_auto_auto] gap-3 items-center px-4 py-3">
                    {/* Team info */}
                    <div className="min-w-0">
                      <p className="text-white font-semibold truncate text-sm">{team.teamName || "—"}</p>
                      <p className="text-gray-500 text-xs">
                        #{team.teamCode} · {team.centerName}
                        {bowlerCount > 0 && <span className="ml-1 text-gray-600">· {bowlerCount} bowler{bowlerCount !== 1 ? "s" : ""}</span>}
                      </p>
                    </div>

                    {/* Place */}
                    <div className="flex flex-col items-center gap-0.5">
                      <label className="text-gray-600 text-[10px] uppercase tracking-wide">Place</label>
                      <input type="number" min="1" placeholder="—" value={draft.place}
                        onChange={(e) => setDraft(team.id, { place: e.target.value, payoutOverride: "" })}
                        onBlur={() => { if (draft.dirty) saveTeamResult(team.id); }}
                        className="w-16 px-2 py-1.5 bg-[#111] border border-white/20 rounded text-white text-xs font-mono focus:outline-none focus:border-yellow-500 text-center" />
                    </div>

                    {/* Score */}
                    <div className="flex flex-col items-center gap-0.5">
                      <label className="text-gray-600 text-[10px] uppercase tracking-wide">Score</label>
                      <input type="text" placeholder="—" value={draft.score}
                        onChange={(e) => setDraft(team.id, { score: e.target.value })}
                        onBlur={() => { if (draft.dirty) saveTeamResult(team.id); }}
                        className="w-20 px-2 py-1.5 bg-[#111] border border-white/20 rounded text-white text-xs font-mono focus:outline-none focus:border-yellow-500 text-center" />
                    </div>

                    {/* Payout */}
                    <div className="flex flex-col items-center gap-0.5">
                      <label className="text-gray-600 text-[10px] uppercase tracking-wide">Payout $</label>
                      <input type="number" min="0" step="0.01"
                        placeholder={calc != null ? calc.toFixed(2) : "—"}
                        value={draft.payoutOverride}
                        onChange={(e) => setDraft(team.id, { payoutOverride: e.target.value })}
                        onBlur={() => { if (draft.dirty) saveTeamResult(team.id); }}
                        className={`w-24 px-2 py-1.5 bg-[#111] border rounded text-xs font-mono focus:outline-none text-right ${
                          isOverridden ? "border-amber-500 text-amber-300" : "border-white/20 text-green-400 focus:border-yellow-500"
                        }`} />
                      {calc != null && draft.payoutOverride === "" && (
                        <span className="text-green-500 text-[10px] font-mono">{fmt$(calc)}</span>
                      )}
                    </div>

                    {/* Denomination summary (per-bowler inline) */}
                    <div className="flex flex-col items-start gap-0.5 min-w-[130px]">
                      <label className="text-gray-600 text-[10px] uppercase tracking-wide">Per-bowler bills</label>
                      {denom ? (
                        <span className="text-green-300 text-[10px] font-mono leading-tight">
                          {formatBreakdown(denom.perBowler)}
                          {denom.delta !== 0 && (
                            <span className={`ml-1 ${denom.delta > 0 ? "text-amber-400" : "text-blue-400"}`}>
                              ({denom.delta > 0 ? "+" : ""}{fmt$(denom.delta)})
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-gray-600 text-[10px]">—</span>
                      )}
                    </div>

                    {/* Save / status */}
                    <div className="flex items-center justify-center w-12">
                      {draft.saving ? (
                        <span className="text-gray-400 text-xs">…</span>
                      ) : draft.dirty ? (
                        <button onClick={() => saveTeamResult(team.id)}
                          className="px-2 py-1 bg-yellow-600 hover:bg-yellow-500 text-white text-xs font-bold rounded transition-all active:scale-95">
                          Save
                        </button>
                      ) : draft.savedAt ? (
                        <span className="text-green-500 text-xs" title={`Saved ${draft.savedAt.toLocaleTimeString()}`}>✓</span>
                      ) : (
                        <span className="text-gray-700 text-xs">—</span>
                      )}
                    </div>
                  </div>

                  {/* Denomination detail panel */}
                  {denom && (
                    <div className="border-t border-white/5 px-4 py-3 space-y-2 bg-black/20 rounded-b-xl">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-gray-400">💵 Denomination Breakdown</span>
                        {denom.delta !== 0 ? (
                          <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
                            denom.delta > 0 ? "bg-amber-900/40 text-amber-300 border border-amber-600/40"
                              : "bg-blue-900/40 text-blue-300 border border-blue-600/40"
                          }`}>
                            Adjusted {denom.delta > 0 ? "up" : "down"} {fmt$(Math.abs(denom.delta))} for even split
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded bg-green-900/30 text-green-400 border border-green-700/30">
                            Exact split ✓
                          </span>
                        )}
                      </div>
                      <BillRow
                        label={`Per bowler (${denom.bowlerCount}) — ${fmt$(denom.perBowlerAmount)}`}
                        counts={denom.perBowler}
                      />
                      <BillRow
                        label={`Team total — ${fmt$(denom.adjustedTotal)}`}
                        counts={denom.teamTotal}
                      />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Results footer */}
            <div className="rounded-xl bg-[#111] border border-white/10 px-4 py-3 flex items-center justify-between text-xs text-gray-400">
              <span>
                {Object.values(drafts).filter((d) => d.savedAt && !d.dirty).length} of {teams.length} teams saved
              </span>
              {paytableReady && totalCommitted > 0 && (
                <span className="text-green-400 font-semibold">
                  Total committed: {fmt$(totalCommitted)}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ═══ SECTION 3 — Summary Card ════════════════════════════════════════════ */}
      {grandTotalAmount > 0 && (
        <div className="border-t border-white/10 pt-8">
          <h3 className="text-lg font-bold text-white mb-4">📊 Payout Summary</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Total prize money */}
            <div className="bg-gradient-to-br from-yellow-900/30 to-yellow-800/10 border border-yellow-500/40 rounded-2xl p-5 text-center">
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Total Prize Money Paid</p>
              <p className="text-3xl font-bold text-yellow-400">{fmt$(grandTotalAmount)}</p>
              <p className="text-gray-500 text-xs mt-1">{savedTeamCount} team{savedTeamCount !== 1 ? "s" : ""} paid</p>
            </div>

            {/* Largest denomination needed */}
            <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-5 text-center">
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">$100 Bills Needed</p>
              <p className="text-3xl font-bold text-white">{grandTotalDenom[100]}</p>
              <p className="text-gray-500 text-xs mt-1">{fmt$(grandTotalDenom[100] * 100)} in hundreds</p>
            </div>

            {/* Remaining denominations */}
            <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-5">
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">Smaller Bills</p>
              <div className="space-y-1">
                {([50, 20, 10, 5] as const).map((bill) => (
                  grandTotalDenom[bill] > 0 ? (
                    <div key={bill} className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">${bill} bills</span>
                      <span className="text-white font-semibold font-mono">{grandTotalDenom[bill]}×</span>
                    </div>
                  ) : null
                ))}
                {([50, 20, 10, 5] as const).every((b) => !grandTotalDenom[b]) && (
                  <p className="text-gray-600 text-xs">None needed</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ SECTION 4 — Grand Total Bill Counts ════════════════════════════════ */}
      {grandTotalAmount > 0 && (
        <div>
          <h3 className="text-base font-bold text-white mb-3">🏦 Grand Total — Bills Needed for Entire Event</h3>
          <div className="bg-[#1a1a1a] rounded-2xl border border-yellow-500/30 p-5 space-y-4">
            <p className="text-gray-400 text-sm">
              Sum of all saved team payouts. Use this to prepare the cash envelope before the event.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {BILL_DENOMINATIONS.map((bill) => (
                <div key={bill} className={`rounded-xl border p-4 text-center ${
                  grandTotalDenom[bill] > 0
                    ? "bg-green-900/20 border-green-600/40"
                    : "bg-[#111] border-white/5 opacity-40"
                }`}>
                  <p className="text-2xl font-bold text-white">{grandTotalDenom[bill]}</p>
                  <p className="text-green-400 font-semibold text-sm">${bill} bills</p>
                  {grandTotalDenom[bill] > 0 && (
                    <p className="text-gray-500 text-xs mt-1">{fmt$(grandTotalDenom[bill] * bill)}</p>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <span className="text-gray-400 text-sm font-semibold">Total cash needed:</span>
              <span className="text-yellow-400 text-xl font-bold">{fmt$(grandTotalAmount)}</span>
            </div>
            <p className="text-xs text-gray-600">
              Note: individual team amounts may have been adjusted by ±$5–$20 to achieve an even per-bowler split.
              Adjusted amounts are flagged on each team row above.
            </p>
          </div>
        </div>
      )}

      {/* ═══ SECTION 5 — Print Payout Sheet ════════════════════════════════════ */}
      {savedTeamCount > 0 && (
        <div className="border-t border-white/10 pt-8">
          <h3 className="text-base font-bold text-white mb-2">🖨 Print Payout Sheet</h3>
          <p className="text-gray-400 text-sm mb-4">
            Opens a clean, printer-friendly view of all saved team payouts — place, team name, center, score,
            adjusted payout, per-bowler bill breakdown, and grand total bill counts. No navigation chrome.
          </p>
          <button
            onClick={() => setShowPrint(true)}
            className="flex items-center gap-2 px-6 py-2.5 bg-white hover:bg-gray-100 text-black font-bold rounded-lg text-sm transition-all active:scale-95"
          >
            🖨 Print {savedTeamCount} Team{savedTeamCount !== 1 ? "s" : ""} Payout Sheet
          </button>
        </div>
      )}

      {/* Print overlay */}
      {showPrint && (
        <PrintPayoutSheet
          rows={printRows}
          eventName={poolData?.pool ? `Event ${eventId}` : undefined}
          totalPrizePool={totalAmountNum > 0 ? totalAmountNum : undefined}
          onClose={() => setShowPrint(false)}
        />
      )}

      {/* ═══ SECTION 6 — Write to Google Sheet ══════════════════════════════════ */}
      <div className="border-t border-white/10 pt-8">
        <h3 className="text-base font-bold text-white mb-2">📤 Write Payouts to Google Sheet</h3>
        <p className="text-gray-400 text-sm mb-4">
          Writes finishing place, dollar amount, and bill breakdown to columns <strong className="text-white">BJ–BL</strong> of the event's Google Sheet.
          Each bowler row for a team gets the same team-level payout data. Only saved teams are written.
        </p>
        <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3 text-xs text-center">
            <div className="bg-[#111] rounded-lg p-3 border border-white/5">
              <p className="text-gray-500 mb-1">Column BJ (61)</p>
              <p className="text-white font-semibold">Finishing Place</p>
              <p className="text-gray-600 text-[10px] mt-1">e.g. "1", "3"</p>
            </div>
            <div className="bg-[#111] rounded-lg p-3 border border-white/5">
              <p className="text-gray-500 mb-1">Column BK (62)</p>
              <p className="text-white font-semibold">Payout Amount</p>
              <p className="text-gray-600 text-[10px] mt-1">e.g. "$1,360.00"</p>
            </div>
            <div className="bg-[#111] rounded-lg p-3 border border-white/5">
              <p className="text-gray-500 mb-1">Column BL (63)</p>
              <p className="text-white font-semibold">Bill Breakdown</p>
              <p className="text-gray-600 text-[10px] mt-1">e.g. "3×$100 + 2×$20 × 4 bowlers"</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleWriteToSheet}
              disabled={isWritingSheet || savedTeamCount === 0}
              className="flex items-center gap-2 px-6 py-2.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg text-sm transition-all active:scale-95"
            >
              {isWritingSheet ? (
                <>
                  <span className="animate-spin">⟳</span> Writing to Sheet…
                </>
              ) : (
                <>
                  📤 Write {savedTeamCount} Team{savedTeamCount !== 1 ? "s" : ""} to Google Sheet
                </>
              )}
            </button>
            {savedTeamCount === 0 && (
              <p className="text-amber-400 text-xs">Save at least one team result first.</p>
            )}
          </div>

          <p className="text-xs text-gray-600">
            The sheet must be linked to this event (done automatically when the ED imports from a Google Sheets URL).
            Rows are matched by Team # (column H). If a team code does not appear in the sheet, that team is skipped.
          </p>
        </div>
      </div>
    </div>
  );
}
