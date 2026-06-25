import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Star, Download, MessageSquareQuote, BarChart3 } from "lucide-react";

const QUESTION_LABELS: Record<string, string> = {
  q1: "Overall Experience",
  q2: "Bowling Venue & Conditions",
  q3: "Event Organization",
  q4: "Pool Party",
  q5: "Banquet Dinner",
  q6: "This App (B.O.B. Passport)",
  q7: "Would Recommend This Event",
};

function StarRow({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground text-sm">No rating</span>;
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-4 w-4 ${n <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
        />
      ))}
    </span>
  );
}

export default function SurveyResultsTab({ eventId }: { eventId: number }) {
  const [view, setView] = useState<"results" | "testimonials">("results");
  const resultsQuery = trpc.survey.results.useQuery({ eventId });
  const testimonialsQuery = trpc.survey.testimonials.useQuery({ eventId });

  const data = resultsQuery.data;
  const responses = useMemo(
    () => (data?.responses ?? []) as Record<string, unknown>[],
    [data]
  );

  const exportCsv = () => {
    if (responses.length === 0) return;
    const cols = [
      "id", "bowlerId", "submittedAt",
      "q1Rating", "q1Comment", "q2Rating", "q2Comment", "q3Rating", "q3Comment",
      "q4Rating", "q4Comment", "q5Rating", "q5Comment", "q6Rating", "q6Comment",
      "q7Rating", "q7Comment", "q8Comment",
      "attendNextYear", "attendNextYearComment", "testimonialPermission",
    ];
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return `"${s.replace(/"/g, '""')}"`;
    };
    const lines = [cols.join(",")];
    for (const r of responses) {
      lines.push(cols.map((c) => {
        if (c === "submittedAt" && r[c]) return escape(new Date(r[c] as number).toLocaleString());
        return escape(r[c]);
      }).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `survey-results-event-${eventId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button
            variant={view === "results" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("results")}
          >
            <BarChart3 className="h-4 w-4 mr-1" /> Results
          </Button>
          <Button
            variant={view === "testimonials" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("testimonials")}
          >
            <MessageSquareQuote className="h-4 w-4 mr-1" /> Testimonials
          </Button>
        </div>
        {view === "results" && responses.length > 0 && (
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
        )}
      </div>

      {view === "results" && (
        <>
          {resultsQuery.isLoading ? (
            <p className="text-muted-foreground">Loading results…</p>
          ) : !data || data.count === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              No survey responses yet. Responses will appear here after bowlers complete the survey.
            </Card>
          ) : (
            <>
              <Card className="p-5">
                <h3 className="font-semibold mb-4">Average Ratings ({data.count} response{data.count === 1 ? "" : "s"})</h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  {Object.entries(data.averages).map(([key, avgRaw]) => {
                    const avg = avgRaw as number | null;
                    return (
                    <div key={key} className="flex items-center justify-between gap-2 py-1.5 border-b border-border/50 last:border-0">
                      <span className="text-sm">{QUESTION_LABELS[key] ?? key}</span>
                      <span className="flex items-center gap-2">
                        <StarRow value={avg == null ? null : Math.round(avg)} />
                        <span className="text-sm font-medium tabular-nums w-9 text-right">
                          {avg == null ? "—" : avg.toFixed(1)}
                        </span>
                      </span>
                    </div>
                    );
                  })}
                </div>
              </Card>

              <div className="space-y-3">
                <h3 className="font-semibold">Individual Responses</h3>
                {responses.map((r) => (
                  <Card key={r.id as number} className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {r.submittedAt ? new Date(r.submittedAt as number).toLocaleString() : ""}
                      </span>
                      {Boolean(r.testimonialPermission) && (
                        <Badge variant="secondary" className="text-xs">Testimonial OK</Badge>
                      )}
                    </div>
                    <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
                      {(["q1", "q2", "q3", "q4", "q5", "q6", "q7"] as const).map((q) => {
                        const rating = r[`${q}Rating`] as number | null;
                        const comment = r[`${q}Comment`] as string | null;
                        if (rating == null && !comment) return null;
                        return (
                          <div key={q} className="text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-muted-foreground">{QUESTION_LABELS[q]}</span>
                              <StarRow value={rating} />
                            </div>
                            {comment && <p className="text-foreground/80 mt-0.5 text-[13px]">{comment}</p>}
                          </div>
                        );
                      })}
                    </div>
                    {(r.attendNextYear || r.attendNextYearComment) ? (
                      <div className="text-sm pt-1 border-t border-border/50">
                        <span className="text-muted-foreground">Attending next season: </span>
                        <span className="font-medium">{(r.attendNextYear as string) || "—"}</span>
                        {r.attendNextYearComment ? <p className="text-foreground/80 mt-0.5 text-[13px]">{r.attendNextYearComment as string}</p> : null}
                      </div>
                    ) : null}
                    {r.q8Comment ? (
                      <div className="text-sm pt-1 border-t border-border/50">
                        <span className="text-muted-foreground">Open comments / grievances: </span>
                        <p className="text-foreground/80 mt-0.5 text-[13px]">{r.q8Comment as string}</p>
                      </div>
                    ) : null}
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {view === "testimonials" && (
        <>
          {testimonialsQuery.isLoading ? (
            <p className="text-muted-foreground">Loading testimonials…</p>
          ) : (testimonialsQuery.data ?? []).length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              No testimonials yet. Only responses where the bowler granted permission appear here.
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {(testimonialsQuery.data as Record<string, unknown>[]).map((t) => (
                <Card key={t.id as number} className="p-4 space-y-2">
                  <StarRow value={(t.q1Rating as number) ?? (t.q7Rating as number) ?? null} />
                  {t.q1Comment ? <p className="text-sm text-foreground/90 italic">“{t.q1Comment as string}”</p> : null}
                  {t.q7Comment ? <p className="text-sm text-foreground/70">{t.q7Comment as string}</p> : null}
                  <p className="text-xs text-muted-foreground">
                    — {(t.legalFirstName as string) ?? "Bowler"} {((t.legalLastName as string) ?? "").charAt(0)}.
                    {t.centerName ? `, ${t.centerName as string}` : ""}
                  </p>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
