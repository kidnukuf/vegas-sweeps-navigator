import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

/**
 * AdInquiryDialog — popup form shown when a visitor taps an empty
 * "Advertise Here" ad slot. Submissions are routed to the Event
 * Director's Advertiser Leads inbox (server: adInquiry.submit).
 */
export function AdInquiryDialog({
  open,
  onOpenChange,
  eventId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId: number | null | undefined;
}) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const submit = trpc.adInquiry.submit.useMutation({
    onSuccess: () => setSent(true),
    onError: (err) => toast.error(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !contact.trim() || !message.trim()) {
      return toast.error("Please fill in your name, contact, and message.");
    }
    submit.mutate({
      eventId: eventId ?? 0,
      name: name.trim(),
      company: company.trim() || undefined,
      contact: contact.trim(),
      message: message.trim(),
    });
  }

  function reset() {
    setName("");
    setCompany("");
    setContact("");
    setMessage("");
    setSent(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setTimeout(reset, 200);
      }}
    >
      <DialogContent className="bg-[#1a1040] border border-amber-500/30 text-white max-w-sm w-full">
        <DialogHeader>
          <DialogTitle className="text-white text-lg font-bold flex items-center gap-2">
            <span className="text-2xl">📣</span> Advertise With Us
          </DialogTitle>
        </DialogHeader>

        {sent ? (
          <div className="text-center py-6">
            <div className="text-5xl mb-4">✅</div>
            <h3 className="text-white font-black text-lg mb-2">Thanks!</h3>
            <p className="text-white/70 text-sm leading-relaxed mb-4">
              Your interest has been sent to the Event Director. We'll reach out
              using the contact info you provided.
            </p>
            <Button
              onClick={() => onOpenChange(false)}
              className="bowler-btn-primary text-sm"
            >
              Close
            </Button>
          </div>
        ) : (
          <div className="space-y-3 pt-1">
            <p className="text-white/75 text-sm leading-relaxed">
              Want your business in front of our bowlers? Fill out the form and
              the Event Director will get back to you.
            </p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <Label className="bowler-label text-xs">Your Name</Label>
                <Input
                  className="bowler-input text-sm"
                  placeholder="First Last"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <Label className="bowler-label text-xs">
                  Company <span className="text-white/40">(optional)</span>
                </Label>
                <Input
                  className="bowler-input text-sm"
                  placeholder="Your business name"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </div>
              <div>
                <Label className="bowler-label text-xs">Phone or Email</Label>
                <Input
                  className="bowler-input text-sm"
                  placeholder="How can we reach you?"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                />
              </div>
              <div>
                <Label className="bowler-label text-xs">Message</Label>
                <textarea
                  className="bowler-input w-full text-sm resize-none"
                  rows={3}
                  placeholder="Tell us what you'd like to advertise..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>
              <Button
                type="submit"
                disabled={submit.isPending}
                className="bowler-btn-primary w-full text-sm"
              >
                {submit.isPending ? "Sending…" : "📨 Send Inquiry"}
              </Button>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default AdInquiryDialog;
