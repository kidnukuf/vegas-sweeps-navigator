/**
 * PrintPayoutSheet — Printer-friendly payout summary.
 *
 * Renders as a full-screen overlay with a print-specific CSS stylesheet that:
 *   - Hides the overlay chrome and shows only the table
 *   - Forces white background / black text
 *   - Avoids page breaks inside rows
 *
 * Columns: Place | Team # | Team Name | Center | Score | Payout | Per-Bowler Bills | Team Bills
 */

import { useEffect } from "react";
import {
  calcDenominations,
  formatBreakdown,
  BILL_DENOMINATIONS,
  sumDenominations,
  type DenominationBreakdown,
} from "../../../shared/denominations";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PrintTeamRow {
  teamId: number;
  teamCode: string;
  teamName: string;
  centerName: string;
  finishingPlace: number | null;
  score: string;
  payoutAmount: number;
  bowlerCount: number;
}

interface Props {
  rows: PrintTeamRow[];
  eventName?: string;
  totalPrizePool?: number;
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PrintPayoutSheet({ rows, eventName, totalPrizePool, onClose }: Props) {
  // Sort by finishing place (nulls last), then by team code
  const sorted = [...rows].sort((a, b) => {
    if (a.finishingPlace == null && b.finishingPlace == null) return a.teamCode.localeCompare(b.teamCode);
    if (a.finishingPlace == null) return 1;
    if (b.finishingPlace == null) return -1;
    return a.finishingPlace - b.finishingPlace;
  });

  // Compute denominations per team
  const denoms: (DenominationBreakdown | null)[] = sorted.map((row) => {
    if (row.payoutAmount <= 0) return null;
    return calcDenominations(row.payoutAmount, row.bowlerCount || 1);
  });

  // Grand total
  const grandTotal = sumDenominations(denoms.filter(Boolean) as DenominationBreakdown[]);
  const grandTotalCash = BILL_DENOMINATIONS.reduce((s, b) => s + grandTotal[b] * b, 0);
  const totalPaid = sorted.reduce((s, r) => s + r.payoutAmount, 0);

  // Trigger browser print dialog automatically when component mounts
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 300);
    return () => clearTimeout(timer);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <>
      {/* ── Print-specific CSS injected into <head> ── */}
      <style>{`
        @media print {
          body > *:not(#print-payout-root) { display: none !important; }
          #print-payout-root .no-print { display: none !important; }
          #print-payout-root .print-only { display: block !important; }
          #print-payout-root {
            position: static !important;
            background: white !important;
            color: black !important;
            padding: 0 !important;
          }
          #print-payout-sheet {
            background: white !important;
            color: black !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            padding: 0.5in !important;
            max-width: 100% !important;
          }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          thead { display: table-header-group; }
          tfoot { display: table-footer-group; }
        }
        @media screen {
          #print-payout-root .print-only { display: none; }
        }
      `}</style>

      {/* ── Screen overlay ── */}
      <div
        id="print-payout-root"
        className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center overflow-y-auto py-8 px-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div
          id="print-payout-sheet"
          className="bg-white text-black rounded-2xl shadow-2xl w-full max-w-5xl p-8"
          style={{ fontFamily: "'Georgia', serif" }}
        >
          {/* ── Header ── */}
          <div className="flex items-start justify-between mb-6 no-print">
            <div />
            <div className="flex gap-3">
              <button
                onClick={() => window.print()}
                className="px-5 py-2 bg-green-700 hover:bg-green-600 text-white font-bold rounded-lg text-sm transition-all"
              >
                🖨 Print
              </button>
              <button
                onClick={onClose}
                className="px-5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold rounded-lg text-sm transition-all"
              >
                ✕ Close
              </button>
            </div>
          </div>

          {/* ── Document header ── */}
          <div className="text-center mb-6 border-b-2 border-black pb-4">
            <h1 className="text-2xl font-bold tracking-tight">{eventName ?? "Event"} — Team Payout Sheet</h1>
            <p className="text-sm text-gray-600 mt-1">Printed {today} · {sorted.length} team{sorted.length !== 1 ? "s" : ""} paid</p>
            {totalPrizePool != null && totalPrizePool > 0 && (
              <p className="text-sm text-gray-700 mt-0.5">Prize Pool: {fmt$(totalPrizePool)}</p>
            )}
          </div>

          {/* ── Main table ── */}
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-black">
                <th className="text-left py-2 pr-3 font-bold w-12">Place</th>
                <th className="text-left py-2 pr-3 font-bold w-10">#</th>
                <th className="text-left py-2 pr-3 font-bold">Team Name</th>
                <th className="text-left py-2 pr-3 font-bold">Center</th>
                <th className="text-right py-2 pr-3 font-bold w-16">Score</th>
                <th className="text-right py-2 pr-3 font-bold w-24">Payout</th>
                <th className="text-left py-2 pr-3 font-bold">Per-Bowler Bills</th>
                <th className="text-left py-2 font-bold">Team Bills</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, idx) => {
                const denom = denoms[idx];
                const isAdjusted = denom && denom.delta !== 0;
                return (
                  <tr key={row.teamId} className={`border-b border-gray-200 ${idx % 2 === 0 ? "bg-gray-50" : "bg-white"}`}>
                    <td className="py-2 pr-3 font-semibold">
                      {row.finishingPlace != null ? ordinal(row.finishingPlace) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="py-2 pr-3 font-mono text-gray-600">{row.teamCode}</td>
                    <td className="py-2 pr-3 font-semibold">{row.teamName || "—"}</td>
                    <td className="py-2 pr-3 text-gray-700 text-xs">{row.centerName}</td>
                    <td className="py-2 pr-3 text-right font-mono text-gray-700">
                      {row.score || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-2 pr-3 text-right font-bold">
                      {denom ? (
                        <>
                          {fmt$(denom.adjustedTotal)}
                          {isAdjusted && (
                            <span className="block text-[10px] font-normal text-gray-500">
                              (adj. {denom.delta > 0 ? "+" : ""}{fmt$(denom.delta)})
                            </span>
                          )}
                        </>
                      ) : (
                        fmt$(row.payoutAmount)
                      )}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs text-gray-800">
                      {denom ? (
                        <>
                          {formatBreakdown(denom.perBowler)}
                          <span className="text-gray-500 ml-1">×{denom.bowlerCount}</span>
                        </>
                      ) : "—"}
                    </td>
                    <td className="py-2 font-mono text-xs text-gray-800">
                      {denom ? formatBreakdown(denom.teamTotal) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-black font-bold bg-gray-100">
                <td colSpan={5} className="py-3 pr-3 text-right text-sm">TOTALS</td>
                <td className="py-3 pr-3 text-right text-sm">{fmt$(totalPaid)}</td>
                <td colSpan={2} className="py-3 text-xs font-mono text-gray-700">
                  {BILL_DENOMINATIONS.map((b) =>
                    grandTotal[b] > 0 ? `${grandTotal[b]}×$${b}` : null
                  ).filter(Boolean).join(" + ")}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* ── Grand total bill summary ── */}
          <div className="mt-6 border-t border-gray-300 pt-4">
            <h2 className="text-base font-bold mb-3">Cash Needed — Grand Total</h2>
            <div className="flex gap-6 flex-wrap">
              {BILL_DENOMINATIONS.map((bill) => (
                grandTotal[bill] > 0 ? (
                  <div key={bill} className="text-center">
                    <p className="text-2xl font-bold">{grandTotal[bill]}</p>
                    <p className="text-sm text-gray-600">${bill} bills</p>
                    <p className="text-xs text-gray-500">{fmt$(grandTotal[bill] * bill)}</p>
                  </div>
                ) : null
              ))}
              <div className="text-center border-l border-gray-300 pl-6">
                <p className="text-2xl font-bold">{fmt$(grandTotalCash)}</p>
                <p className="text-sm text-gray-600">Total Cash</p>
              </div>
            </div>
          </div>

          {/* ── Footer note ── */}
          <p className="mt-6 text-xs text-gray-400 border-t border-gray-200 pt-3">
            Amounts marked "(adj.)" have been rounded to the nearest $5 to allow an even per-bowler split.
            All payouts are in cash using $100, $50, $20, $10, and $5 bills only.
          </p>
        </div>
      </div>
    </>
  );
}
