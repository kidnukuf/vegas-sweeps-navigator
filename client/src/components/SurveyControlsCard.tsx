import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function SurveyControlsCard({ eventId }: { eventId: number }) {
  const settingsQuery = trpc.event.getSettings.useQuery({ id: eventId }, { enabled: !!eventId });
  const utils = trpc.useUtils();
  const update = trpc.event.updateSettings.useMutation({
    onSuccess: () => {
      utils.event.getSettings.invalidate({ id: eventId });
      toast.success("Survey settings updated");
    },
    onError: () => toast.error("Could not update survey settings"),
  });

  const s = settingsQuery.data as Record<string, unknown> | null | undefined;
  const enabled = Boolean(s?.surveyEnabled);
  const open = Boolean(s?.surveyOpen);

  return (
    <Card className="p-5 mb-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold">Survey Controls</h3>
          <p className="text-sm text-muted-foreground">
            Open the survey after the banquet concludes so bowlers can share feedback.
          </p>
        </div>
        {open ? (
          <Badge className="bg-emerald-600 hover:bg-emerald-600">Live</Badge>
        ) : (
          <Badge variant="secondary">Closed</Badge>
        )}
      </div>

      <div className="rounded-lg border border-border p-3 text-sm space-y-1.5 bg-muted/30">
        <p><span className="font-medium">Plain-language:</span> Flip this switch on when the banquet is over. Bowlers will then see a “How was your event?” button in their portal. Turn it off any time to stop collecting responses.</p>
        <p><span className="font-medium">For the seasoned ED:</span> Toggling <code>surveyOpen</code> gates the public <code>survey.submit</code> endpoint and the portal entry point. A push notification is also dispatched at hotel check-out time (configured in the event wizard) inviting bowlers to complete the survey.</p>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
        <Label htmlFor="surveyOpen" className="text-sm">
          {enabled ? "Survey open to bowlers" : "Enable the survey in the event settings first"}
        </Label>
        <Switch
          id="surveyOpen"
          checked={open}
          disabled={!enabled || update.isPending}
          onCheckedChange={(v) => update.mutate({ id: eventId, surveyOpen: v })}
        />
      </div>
    </Card>
  );
}
