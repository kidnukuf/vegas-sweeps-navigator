/**
 * EDBowlerView — slide-over panel for the Event Director to view and edit
 * any bowler's portal data in real time without leaving the AdminDashboard.
 *
 * Usage:
 *   <EDBowlerView bowlerId={selectedBowlerId} onClose={() => setSelectedBowlerId(null)} />
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Editable field row ───────────────────────────────────────────────────────
function EditableField({
  label,
  fieldKey,
  value,
  bowlerId,
  onSaved,
}: {
  label: string;
  fieldKey: string;
  value: string | null | undefined;
  bowlerId: number;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const update = trpc.bowlerAuth.edUpdateBowlerField.useMutation({
    onSuccess: () => {
      toast.success(`${label} updated`);
      setEditing(false);
      onSaved();
    },
    onError: (e) => toast.error(e.message),
  });

  if (editing) {
    return (
      <div className="flex flex-col gap-1 py-2 border-b border-white/10">
        <span className="text-white/50 text-xs">{label}</span>
        <div className="flex gap-2">
          <input
            autoFocus
            className="flex-1 bg-black/40 border border-amber-400/40 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-amber-400"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") update.mutate({ bowlerId, fields: { [fieldKey]: draft } });
              if (e.key === "Escape") setEditing(false);
            }}
          />
          <Button
            size="sm"
            className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-3"
            disabled={update.isPending}
            onClick={() => update.mutate({ bowlerId, fields: { [fieldKey]: draft } })}
          >
            {update.isPending ? "…" : "Save"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-white/50 hover:text-white px-2"
            onClick={() => setEditing(false)}
          >
            ✕
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-between py-2 border-b border-white/10 last:border-0 group cursor-pointer hover:bg-white/5 rounded px-1 -mx-1 transition-colors"
      onClick={() => { setDraft(value ?? ""); setEditing(true); }}
      title="Click to edit"
    >
      <div>
        <p className="text-white/50 text-xs">{label}</p>
        <p className="text-white text-sm font-medium">{value || <span className="text-white/30 italic">—</span>}</p>
      </div>
      <span className="text-white/20 group-hover:text-amber-400 text-xs transition-colors ml-2 flex-shrink-0">✏️</span>
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-2 mt-5 mb-2">
      <span className="text-lg">{icon}</span>
      <h3 className="text-white/80 font-bold text-sm uppercase tracking-wider">{title}</h3>
    </div>
  );
}

// ─── Read-only info row ───────────────────────────────────────────────────────
function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between py-1.5 border-b border-white/10 last:border-0">
      <span className="text-white/50 text-xs flex-shrink-0 mr-3">{label}</span>
      <span className="text-white text-sm font-medium text-right">{value}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function EDBowlerView({
  bowlerId,
  onClose,
}: {
  bowlerId: number;
  onClose: () => void;
}) {
  const { data: p, isLoading, error, refetch } = trpc.bowlerAuth.edGetBowlerProfile.useQuery(
    { bowlerId },
    { refetchOnWindowFocus: false }
  );

  const displayName = p
    ? (p.preferredName || `${p.legalFirstName} ${p.legalLastName}`)
    : "Loading…";

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: "rgba(0,0,0,0.65)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Panel */}
      <div
        className="relative h-full w-full max-w-lg bg-[#0f0f0f] border-l border-white/10 overflow-y-auto flex flex-col shadow-2xl"
        style={{ animation: "slideInRight 220ms cubic-bezier(0.23,1,0.32,1)" }}
      >
        {/* ── Header ── */}
        <div className="sticky top-0 z-10 bg-[#0f0f0f] border-b border-white/10 px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-amber-400 text-xs font-bold uppercase tracking-widest mb-0.5">ED View — Bowler Portal</p>
            <h2 className="text-white font-extrabold text-lg leading-tight">{displayName}</h2>
            {p && (
              <p className="text-white/50 text-xs font-mono mt-0.5">ID: {p.scantronId ?? "—"}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white text-2xl leading-none transition-colors ml-4 flex-shrink-0"
          >
            ✕
          </button>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 px-5 py-4">
          {isLoading && (
            <div className="space-y-3 mt-2">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full bg-white/10 rounded-lg" />
              ))}
            </div>
          )}
          {error && (
            <div className="mt-8 text-center">
              <p className="text-red-400 text-sm">{error.message}</p>
              <Button className="mt-4 bg-white/10 hover:bg-white/20 text-white" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          )}
          {p && (
            <>
              {/* ── Identity ── */}
              <SectionHeader icon="🎳" title="Identity" />
              <div className="bg-white/5 rounded-xl p-3 space-y-0">
                <EditableField label="Legal First Name" fieldKey="legalFirstName" value={p.legalFirstName} bowlerId={bowlerId} onSaved={refetch} />
                <EditableField label="Legal Last Name" fieldKey="legalLastName" value={p.legalLastName} bowlerId={bowlerId} onSaved={refetch} />
                <EditableField label="Preferred Name" fieldKey="preferredName" value={p.preferredName} bowlerId={bowlerId} onSaved={refetch} />
                <EditableField label="Phone" fieldKey="phone" value={p.phone} bowlerId={bowlerId} onSaved={refetch} />
                <EditableField label="Email" fieldKey="email" value={p.email} bowlerId={bowlerId} onSaved={refetch} />
                <EditableField label="Registration Status" fieldKey="registrationStatus" value={p.registrationStatus} bowlerId={bowlerId} onSaved={refetch} />
              </div>

              {/* ── Event Info (read-only) ── */}
              <SectionHeader icon="🎯" title="Event Info" />
              <div className="bg-white/5 rounded-xl p-3 space-y-0">
                <InfoRow label="Event" value={p.eventName} />
                <InfoRow label="Center" value={p.centerName} />
                <InfoRow label="Team" value={p.teamName ?? undefined} />
                <InfoRow label="Lane" value={p.laneNumber != null ? String(p.laneNumber) : null} />
                <InfoRow label="Squad Time" value={p.squadTime ?? undefined} />
                <InfoRow label="Bowling Date" value={p.bowlingDate ?? undefined} />
                <InfoRow label="Lane to Event" value={p.laneToEvent ?? undefined} />
              </div>

              {/* ── Editable Event Fields ── */}
              <div className="bg-white/5 rounded-xl p-3 mt-2 space-y-0">
                <EditableField label="Lane Number" fieldKey="laneNumber" value={p.laneNumber != null ? String(p.laneNumber) : null} bowlerId={bowlerId} onSaved={refetch} />
                <EditableField label="Squad Time" fieldKey="squadTime" value={p.squadTime} bowlerId={bowlerId} onSaved={refetch} />
                <EditableField label="Lane to Event" fieldKey="laneToEvent" value={p.laneToEvent} bowlerId={bowlerId} onSaved={refetch} />
                <EditableField label="Banquet Table" fieldKey="banquetTable" value={p.banquetTable} bowlerId={bowlerId} onSaved={refetch} />
              </div>

              {/* ── Hotel ── */}
              {(p.hotelName || p.checkinDate || p.checkoutDate || p.roomType || p.confirmationCode) && (
                <>
                  <SectionHeader icon="🏨" title="Hotel" />
                  <div className="bg-white/5 rounded-xl p-3 space-y-0">
                    <EditableField label="Hotel Name" fieldKey="hotelName" value={p.hotelName} bowlerId={bowlerId} onSaved={refetch} />
                    <EditableField label="Check-in Date" fieldKey="checkinDate" value={p.checkinDate} bowlerId={bowlerId} onSaved={refetch} />
                    <EditableField label="Check-out Date" fieldKey="checkoutDate" value={p.checkoutDate} bowlerId={bowlerId} onSaved={refetch} />
                    <EditableField label="Room Type" fieldKey="roomType" value={p.roomType} bowlerId={bowlerId} onSaved={refetch} />
                    <EditableField label="Confirmation Code" fieldKey="confirmationCode" value={p.confirmationCode} bowlerId={bowlerId} onSaved={refetch} />
                  </div>
                </>
              )}

              {/* ── Payment ── */}
              <SectionHeader icon="💳" title="Payment" />
              <div className="bg-white/5 rounded-xl p-3 space-y-0">
                <EditableField label="Total Amount Due" fieldKey="totalAmountDue" value={p.totalAmountDue} bowlerId={bowlerId} onSaved={refetch} />
                <EditableField label="Paid" fieldKey="paid" value={p.paid != null ? String(p.paid) : null} bowlerId={bowlerId} onSaved={refetch} />
                <EditableField label="Guest Pool Party Amount" fieldKey="guestPoolPartyAmount" value={p.guestPoolPartyAmount} bowlerId={bowlerId} onSaved={refetch} />
              </div>

              {/* ── Passport / QR ── */}
              <SectionHeader icon="🎫" title="Passport QR Codes" />
              <div className="space-y-3">
                {/* Pool Party */}
                <div className="bg-white/5 rounded-xl p-3">
                  <p className="text-cyan-300 font-bold text-sm mb-2">🌊 Pool Party Passport</p>
                  {p.poolPartyToken ? (
                    <div className="space-y-1">
                      <InfoRow label="Token" value={p.poolPartyToken} />
                      <InfoRow label="Status" value={p.poolPartyUsed ? "✅ Used" : "🎫 Active"} />
                      {p.poolPartyQR && !p.poolPartyUsed && (
                        <img src={p.poolPartyQR} alt="Pool QR" className="w-36 h-36 mx-auto mt-2 rounded-lg" />
                      )}
                    </div>
                  ) : (
                    <p className="text-white/30 text-sm italic">Not eligible / not generated</p>
                  )}
                </div>
                {/* Banquet */}
                <div className="bg-white/5 rounded-xl p-3">
                  <p className="text-amber-300 font-bold text-sm mb-2">🍽️ Banquet Dinner Passport</p>
                  {p.banquetToken ? (
                    <div className="space-y-1">
                      <InfoRow label="Token" value={p.banquetToken} />
                      <InfoRow label="Status" value={p.banquetUsed ? "✅ Used" : "🎫 Active"} />
                      {p.banquetQR && !p.banquetUsed && (
                        <img src={p.banquetQR} alt="Banquet QR" className="w-36 h-36 mx-auto mt-2 rounded-lg" />
                      )}
                    </div>
                  ) : (
                    <p className="text-white/30 text-sm italic">Not eligible / not generated</p>
                  )}
                </div>
                {/* Guest QRs */}
                {p.guestPoolQRs && p.guestPoolQRs.length > 0 && (
                  <div className="bg-white/5 rounded-xl p-3">
                    <p className="text-emerald-300 font-bold text-sm mb-2">👥 Guest Pool Passes</p>
                    <div className="grid grid-cols-2 gap-2">
                      {p.guestPoolQRs.map((g: any) => (
                        <div key={g.suffix} className="text-center">
                          <p className="text-white/50 text-xs mb-1">Guest {g.suffix} — {g.used ? "✅ Used" : "🎫 Active"}</p>
                          {!g.used && <img src={g.qrDataUrl} alt={`Guest ${g.suffix}`} className="w-24 h-24 mx-auto rounded" />}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {p.guestBanquetQRs && p.guestBanquetQRs.length > 0 && (
                  <div className="bg-white/5 rounded-xl p-3">
                    <p className="text-purple-300 font-bold text-sm mb-2">👥 Guest Banquet Passes</p>
                    <div className="grid grid-cols-2 gap-2">
                      {p.guestBanquetQRs.map((g: any) => (
                        <div key={g.suffix} className="text-center">
                          <p className="text-white/50 text-xs mb-1">Guest {g.suffix} — {g.used ? "✅ Used" : "🎫 Active"}</p>
                          {!g.used && <img src={g.qrDataUrl} alt={`Guest ${g.suffix}`} className="w-24 h-24 mx-auto rounded" />}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="h-8" />
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
