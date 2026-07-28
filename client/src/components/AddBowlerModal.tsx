import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BowlingCenter {
  id: number;
  centerCode: string;
  centerName: string;
}

interface AddBowlerModalProps {
  open: boolean;
  onClose: () => void;
  centers: BowlingCenter[];
}

interface BowlerFormData {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  centerId: string;
  teamNumber: string;
  teamName: string;
  squadTime: string;
  laneNumber: string;
  average: string;
  under21: string;        // "yes" | "no" | ""
  tshirtSize: string;
  hotelCheckin: string;
  hotelCheckout: string;
  hasGuest: string;       // "yes" | "no" | ""
  attendingBanquet: string;  // "yes" | "no" | ""
  attendingPoolParty: string; // "yes" | "no" | ""
}

const EMPTY_FORM: BowlerFormData = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  centerId: "",
  teamNumber: "",
  teamName: "",
  squadTime: "",
  laneNumber: "",
  average: "",
  under21: "",
  tshirtSize: "",
  hotelCheckin: "",
  hotelCheckout: "",
  hasGuest: "",
  attendingBanquet: "",
  attendingPoolParty: "",
};

const TSHIRT_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];

// ─── Field helpers ────────────────────────────────────────────────────────────

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <Label className="text-yellow-400/80 text-xs font-bold uppercase tracking-wider">
      {children}
      {required && <span className="text-red-400 ml-0.5">*</span>}
    </Label>
  );
}

function FieldInput({
  id,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <Input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="bg-black/50 border-white/10 text-white placeholder-gray-600 focus:border-yellow-500/50 h-9"
    />
  );
}

function YesNoSelect({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        id={id}
        className="bg-black/50 border-white/10 text-white h-9 focus:border-yellow-500/50 data-[placeholder]:text-gray-600"
      >
        <SelectValue placeholder={placeholder ?? "Select…"} />
      </SelectTrigger>
      <SelectContent className="bg-[#1a1a1a] border-white/10 text-white">
        <SelectItem value="yes" className="focus:bg-yellow-500/20 focus:text-yellow-300">Yes</SelectItem>
        <SelectItem value="no" className="focus:bg-yellow-500/20 focus:text-yellow-300">No</SelectItem>
      </SelectContent>
    </Select>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AddBowlerModal({ open, onClose, centers }: AddBowlerModalProps) {
  const [form, setForm] = useState<BowlerFormData>(EMPTY_FORM);

  function set(field: keyof BowlerFormData) {
    return (value: string) => setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleClose() {
    setForm(EMPTY_FORM);
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast.error("First Name and Last Name are required.");
      return;
    }
    // No backend yet — log and show success toast
    console.log("[AddBowler] Form data:", form);
    toast.success(`Bowler "${form.firstName} ${form.lastName}" ready to save (backend not wired yet).`);
    handleClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent
        className="bg-[#141414] border border-yellow-500/20 text-white max-w-2xl w-full max-h-[90vh] overflow-y-auto p-0"
        style={{ boxShadow: "0 0 40px rgba(255,215,0,0.08)" }}
      >
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/10 sticky top-0 bg-[#141414] z-10">
          <DialogTitle className="flex items-center gap-2 text-xl font-black tracking-tight" style={{ fontFamily: "'Rajdhani', sans-serif", color: "#ffd700" }}>
            <span>➕</span>
            <span>Add Bowler</span>
          </DialogTitle>
          <p className="text-gray-500 text-xs mt-0.5">Fill in the bowler's details. No data is saved until the backend is wired.</p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-6">

          {/* ── Personal Info ─────────────────────────────────────────────── */}
          <section>
            <h3 className="text-amber-400 text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="w-4 h-px bg-amber-500/40 inline-block" />
              Personal Info
              <span className="flex-1 h-px bg-amber-500/10 inline-block" />
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <FieldLabel required>First Name</FieldLabel>
                <FieldInput id="firstName" value={form.firstName} onChange={set("firstName")} placeholder="Jane" />
              </div>
              <div className="space-y-1">
                <FieldLabel required>Last Name</FieldLabel>
                <FieldInput id="lastName" value={form.lastName} onChange={set("lastName")} placeholder="Smith" />
              </div>
              <div className="space-y-1">
                <FieldLabel>Phone</FieldLabel>
                <FieldInput id="phone" value={form.phone} onChange={set("phone")} placeholder="(702) 555-0100" type="tel" />
              </div>
              <div className="space-y-1">
                <FieldLabel>Email</FieldLabel>
                <FieldInput id="email" value={form.email} onChange={set("email")} placeholder="jane@example.com" type="email" />
              </div>
            </div>
          </section>

          {/* ── Bowling Info ──────────────────────────────────────────────── */}
          <section>
            <h3 className="text-amber-400 text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="w-4 h-px bg-amber-500/40 inline-block" />
              Bowling Info
              <span className="flex-1 h-px bg-amber-500/10 inline-block" />
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {/* Center */}
              <div className="col-span-2 space-y-1">
                <FieldLabel>Center Bowled At</FieldLabel>
                <Select value={form.centerId} onValueChange={set("centerId")}>
                  <SelectTrigger className="bg-black/50 border-white/10 text-white h-9 focus:border-yellow-500/50 data-[placeholder]:text-gray-600">
                    <SelectValue placeholder="Select a center…" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a1a] border-white/10 text-white max-h-60">
                    {centers.length === 0 ? (
                      <SelectItem value="_none" disabled className="text-gray-500">No centers loaded</SelectItem>
                    ) : (
                      centers.map((c) => (
                        <SelectItem
                          key={c.id}
                          value={String(c.id)}
                          className="focus:bg-yellow-500/20 focus:text-yellow-300"
                        >
                          {c.centerCode} — {c.centerName}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <FieldLabel>Team Number</FieldLabel>
                <FieldInput id="teamNumber" value={form.teamNumber} onChange={set("teamNumber")} placeholder="7" />
              </div>
              <div className="space-y-1">
                <FieldLabel>Team Name</FieldLabel>
                <FieldInput id="teamName" value={form.teamName} onChange={set("teamName")} placeholder="Pin Crushers" />
              </div>
              <div className="space-y-1">
                <FieldLabel>Squad Time</FieldLabel>
                <FieldInput id="squadTime" value={form.squadTime} onChange={set("squadTime")} placeholder="9:00 AM" />
              </div>
              <div className="space-y-1">
                <FieldLabel>Lane Number</FieldLabel>
                <FieldInput id="laneNumber" value={form.laneNumber} onChange={set("laneNumber")} placeholder="14" />
              </div>
              <div className="space-y-1">
                <FieldLabel>Average</FieldLabel>
                <FieldInput id="average" value={form.average} onChange={set("average")} placeholder="185" type="number" />
              </div>
              <div className="space-y-1">
                <FieldLabel>Under 21?</FieldLabel>
                <YesNoSelect id="under21" value={form.under21} onChange={set("under21")} placeholder="Select…" />
              </div>
            </div>
          </section>

          {/* ── Apparel & Hotel ───────────────────────────────────────────── */}
          <section>
            <h3 className="text-amber-400 text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="w-4 h-px bg-amber-500/40 inline-block" />
              Apparel &amp; Hotel
              <span className="flex-1 h-px bg-amber-500/10 inline-block" />
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <FieldLabel>T-Shirt Size</FieldLabel>
                <Select value={form.tshirtSize} onValueChange={set("tshirtSize")}>
                  <SelectTrigger className="bg-black/50 border-white/10 text-white h-9 focus:border-yellow-500/50 data-[placeholder]:text-gray-600">
                    <SelectValue placeholder="Select size…" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a1a] border-white/10 text-white">
                    {TSHIRT_SIZES.map((s) => (
                      <SelectItem key={s} value={s} className="focus:bg-yellow-500/20 focus:text-yellow-300">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                {/* spacer */}
              </div>
              <div className="space-y-1">
                <FieldLabel>Hotel Check-in</FieldLabel>
                <FieldInput id="hotelCheckin" value={form.hotelCheckin} onChange={set("hotelCheckin")} type="date" />
              </div>
              <div className="space-y-1">
                <FieldLabel>Hotel Check-out</FieldLabel>
                <FieldInput id="hotelCheckout" value={form.hotelCheckout} onChange={set("hotelCheckout")} type="date" />
              </div>
            </div>
          </section>

          {/* ── Event Options ─────────────────────────────────────────────── */}
          <section>
            <h3 className="text-amber-400 text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="w-4 h-px bg-amber-500/40 inline-block" />
              Event Options
              <span className="flex-1 h-px bg-amber-500/10 inline-block" />
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <FieldLabel>Has Guest?</FieldLabel>
                <YesNoSelect id="hasGuest" value={form.hasGuest} onChange={set("hasGuest")} />
              </div>
              <div className="space-y-1">
                <FieldLabel>Attending Banquet?</FieldLabel>
                <YesNoSelect id="attendingBanquet" value={form.attendingBanquet} onChange={set("attendingBanquet")} />
              </div>
              <div className="space-y-1">
                <FieldLabel>Attending Pool Party?</FieldLabel>
                <YesNoSelect id="attendingPoolParty" value={form.attendingPoolParty} onChange={set("attendingPoolParty")} />
              </div>
            </div>
          </section>

        </form>

        {/* Footer */}
        <DialogFooter className="px-6 pb-6 pt-4 border-t border-white/10 flex gap-3 justify-end sticky bottom-0 bg-[#141414]">
          <Button
            type="button"
            variant="ghost"
            onClick={handleClose}
            className="text-gray-400 hover:text-white hover:bg-white/5 border border-white/10"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            onClick={handleSubmit}
            className="bg-yellow-500 hover:bg-yellow-400 text-black font-black px-6 transition-all active:scale-[0.97]"
          >
            ➕ Add Bowler
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
