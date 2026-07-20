import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Lead = {
  id: number;
  eventId: number | null;
  name: string;
  company: string | null;
  contact: string;
  message: string;
  slotLabel: string | null;
  status: string;
  createdAt: number;
};

/**
 * AdvertiserLeadsTab — Event Director inbox for "Advertise Here" inquiries
 * submitted from the portal ad placeholders.
 */
export default function AdvertiserLeadsTab() {
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState<"all" | "new" | "read" | "archived">("all");
  const leads = trpc.adInquiry.list.useQuery({ status: filter });

  const setStatus = trpc.adInquiry.setStatus.useMutation({
    onSuccess: () => {
      utils.adInquiry.list.invalidate();
      utils.adInquiry.newCount.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const rows = (leads.data ?? []) as Lead[];

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-white/10 bg-[#111] p-5">
        <h2 className="text-xl font-black text-yellow-400">📣 Advertiser Leads</h2>
        <p className="mt-1 text-sm text-gray-400 leading-relaxed">
          When no sponsor ad fills a slot, bowlers see an “Advertise Here” placeholder. Tapping it
          opens a form, and submissions land here. Follow up using the contact info provided.
        </p>
        <div className="mt-4 flex gap-2">
          {(["all", "new", "read", "archived"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold capitalize transition-colors ${
                filter === f ? "bg-yellow-500 text-black" : "bg-white/5 text-gray-400 hover:text-white"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {leads.isLoading ? (
        <p className="text-sm text-gray-500 px-1">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 bg-[#111] p-10 text-center">
          <div className="text-4xl mb-3">📭</div>
          <p className="text-sm text-gray-400">No advertiser leads {filter !== "all" ? `(${filter})` : "yet"}.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((lead) => (
            <div
              key={lead.id}
              className={`rounded-xl border bg-[#111] p-4 ${
                lead.status === "new" ? "border-yellow-500/40" : "border-white/10"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white">{lead.name}</span>
                    {lead.company && <span className="text-sm text-gray-400">· {lead.company}</span>}
                    {lead.status === "new" && (
                      <span className="rounded bg-yellow-500/15 px-2 py-0.5 text-xs font-bold text-yellow-400">
                        NEW
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-sky-300">{lead.contact}</div>
                  <p className="mt-2 text-sm text-gray-300 whitespace-pre-wrap">{lead.message}</p>
                  <div className="mt-2 text-xs text-gray-600">
                    {new Date(lead.createdAt).toLocaleString()}
                    {lead.slotLabel ? ` · from ${lead.slotLabel}` : ""}
                  </div>
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0">
                  {lead.status !== "read" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-white/20 text-gray-200 hover:bg-white/5"
                      onClick={() => setStatus.mutate({ id: lead.id, status: "read" })}
                    >
                      Mark Read
                    </Button>
                  )}
                  {lead.status !== "archived" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-white/20 text-gray-400 hover:bg-white/5"
                      onClick={() => setStatus.mutate({ id: lead.id, status: "archived" })}
                    >
                      Archive
                    </Button>
                  )}
                  {lead.status === "archived" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-white/20 text-gray-400 hover:bg-white/5"
                      onClick={() => setStatus.mutate({ id: lead.id, status: "new" })}
                    >
                      Restore
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
