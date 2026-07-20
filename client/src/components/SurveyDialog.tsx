import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Star } from "lucide-react";
import { toast } from "sonner";

type Q = { key: string; label: string; poolOnly?: boolean };

const QUESTIONS: Q[] = [
  { key: "q1", label: "Overall, how would you rate your experience at this event?" },
  { key: "q2", label: "How would you rate the bowling venue and lane conditions?" },
  { key: "q3", label: "How would you rate how well the event was organized?" },
  { key: "q4", label: "How would you rate the pool party?", poolOnly: true },
  { key: "q5", label: "How would you rate the banquet dinner?" },
  { key: "q6", label: "How would you rate this app (the B.O.B. Passport)?" },
  { key: "q7", label: "Likelihood of using a similar app for your league if it offered information on upcoming opponents, lane assignments, team standings, averages, sub-availability, upcoming bowling events, and more?" },
];

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          className="transition-transform active:scale-90"
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
        >
          <Star
            className={`h-8 w-8 ${(hover || value) >= n ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
          />
        </button>
      ))}
    </div>
  );
}

export default function SurveyDialog({
  open,
  onOpenChange,
  eventId,
  bowlerId,
  poolPartyEnabled,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId: number;
  bowlerId: number;
  poolPartyEnabled: boolean;
  onSubmitted?: () => void;
}) {
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [attendNextYear, setAttendNextYear] = useState<string>("");
  const [attendComment, setAttendComment] = useState("");
  const [grievances, setGrievances] = useState("");
  const [testimonialOk, setTestimonialOk] = useState(false);

  const utils = trpc.useUtils();
  const submit = trpc.survey.submit.useMutation({
    onSuccess: (res) => {
      if (!res.success) {
        toast.error(res.error ?? "Could not submit survey");
        return;
      }
      toast.success("Thank you! Your feedback has been submitted.");
      utils.survey.status.invalidate({ eventId, bowlerId });
      onSubmitted?.();
      onOpenChange(false);
    },
    onError: () => toast.error("Could not submit survey. Please try again."),
  });

  const visibleQuestions = QUESTIONS.filter((q) => !q.poolOnly || poolPartyEnabled);

  const handleSubmit = () => {
    const payload: Record<string, unknown> = {
      eventId,
      bowlerId,
      q8Comment: grievances || null,
      attendNextYear: attendNextYear || null,
      attendNextYearComment: attendComment || null,
      testimonialPermission: testimonialOk,
    };
    for (const q of visibleQuestions) {
      payload[`${q.key}Rating`] = ratings[q.key] ?? null;
      payload[`${q.key}Comment`] = comments[q.key] || null;
    }
    submit.mutate(payload as never);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>How was your event?</DialogTitle>
          <DialogDescription>
            Your honest feedback helps us improve. It only takes a minute.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {visibleQuestions.map((q) => (
            <div key={q.key} className="space-y-2">
              <Label className="text-sm leading-snug">{q.label}</Label>
              <StarPicker
                value={ratings[q.key] ?? 0}
                onChange={(n) => setRatings((p) => ({ ...p, [q.key]: n }))}
              />
              <Textarea
                placeholder="Tell us why you chose this rating (optional)"
                value={comments[q.key] ?? ""}
                onChange={(e) => setComments((p) => ({ ...p, [q.key]: e.target.value }))}
                className="min-h-[60px] text-sm"
              />
            </div>
          ))}

          <div className="space-y-2">
            <Label className="text-sm leading-snug">
              Will you be bowling in a league that attends events like this next season?
            </Label>
            <div className="flex gap-2">
              {["Yes", "Maybe", "No"].map((opt) => (
                <Button
                  key={opt}
                  type="button"
                  variant={attendNextYear === opt ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAttendNextYear(opt)}
                >
                  {opt}
                </Button>
              ))}
            </div>
            <Textarea
              placeholder="Anything you'd like to add? (optional)"
              value={attendComment}
              onChange={(e) => setAttendComment(e.target.value)}
              className="min-h-[60px] text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm leading-snug">
              Anything else you'd like to share? Praise, grievances, or frustrations — all welcome.
            </Label>
            <Textarea
              placeholder="Your open feedback (optional)"
              value={grievances}
              onChange={(e) => setGrievances(e.target.value)}
              className="min-h-[80px] text-sm"
            />
          </div>

          <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
            <div>
              <Label htmlFor="testimonial" className="text-sm">Share my feedback as a testimonial</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                We may feature your comments (first name + last initial) to promote future events.
              </p>
            </div>
            <Switch id="testimonial" checked={testimonialOk} onCheckedChange={setTestimonialOk} />
          </div>
        </div>

        <Button onClick={handleSubmit} disabled={submit.isPending} className="w-full">
          {submit.isPending ? "Submitting…" : "Submit Feedback"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
