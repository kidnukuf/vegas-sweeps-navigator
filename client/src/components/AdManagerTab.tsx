import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

/**
 * ED Advertisements management tab. Lets the Event Director add unlimited
 * sponsors across three tiers (Bronze/Silver/Gold), upload an image or video,
 * optionally attach a click-through URL, set a run-until date, and
 * enable/disable or delete each ad. Higher tiers receive proportionally more
 * rotation weight in the portals (Gold 4x, Silver 2x, Bronze 1x).
 */

type Ad = {
  id: number;
  eventId: number;
  sponsorName: string;
  tier: "bronze" | "silver" | "gold";
  category: "bowling" | "travel" | "concerts" | "restaurant";
  mediaType: "image" | "video";
  mediaUrl: string;
  mediaKey?: string | null;
  linkUrl?: string | null;
  runUntil?: number | null;
  enabled: number | boolean;
};

const TIER_INFO = {
  gold:   { label: "Gold — $500",   weight: "4× visibility", color: "from-amber-400 to-yellow-500 text-amber-950" },
  silver: { label: "Silver — $350", weight: "2× visibility", color: "from-slate-200 to-slate-400 text-slate-800" },
  bronze: { label: "Bronze — $200", weight: "1× visibility", color: "from-orange-300 to-amber-600 text-orange-950" },
} as const;

const CATEGORIES = [
  { value: "bowling", label: "Bowling-related" },
  { value: "travel", label: "Travel-related" },
  { value: "concerts", label: "Concerts & Shows" },
  { value: "restaurant", label: "Restaurant & Food" },
] as const;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function AdManagerTab({ eventId }: { eventId: number }) {
  const utils = trpc.useUtils();
  const listQuery = trpc.ads.list.useQuery({ eventId }, { enabled: !!eventId });
  const ads = (listQuery.data ?? []) as Ad[];

  const [sponsorName, setSponsorName] = useState("");
  const [tier, setTier] = useState<Ad["tier"]>("bronze");
  const [category, setCategory] = useState<Ad["category"]>("bowling");
  const [linkUrl, setLinkUrl] = useState("");
  const [runUntil, setRunUntil] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const uploadMedia = trpc.ads.uploadMedia.useMutation();
  const createAd = trpc.ads.create.useMutation({
    onSuccess: () => { utils.ads.list.invalidate({ eventId }); resetForm(); toast.success("Sponsor ad added"); },
    onError: (e) => toast.error(e.message),
  });
  const updateAd = trpc.ads.update.useMutation({
    onSuccess: () => utils.ads.list.invalidate({ eventId }),
    onError: (e) => toast.error(e.message),
  });
  const removeAd = trpc.ads.remove.useMutation({
    onSuccess: () => { utils.ads.list.invalidate({ eventId }); toast.success("Ad removed"); },
    onError: (e) => toast.error(e.message),
  });

  function resetForm() {
    setSponsorName(""); setTier("bronze"); setCategory("bowling");
    setLinkUrl(""); setRunUntil(""); setFile(null);
  }

  async function handleSubmit() {
    if (!sponsorName.trim()) { toast.error("Enter a sponsor name"); return; }
    if (!file) { toast.error("Choose an image or video"); return; }
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    if (!isVideo && !isImage) { toast.error("File must be an image or video"); return; }
    if (file.size > 25 * 1024 * 1024) { toast.error("File must be under 25 MB"); return; }

    setUploading(true);
    try {
      const dataBase64 = await fileToBase64(file);
      const { url, key } = await uploadMedia.mutateAsync({
        eventId, fileName: file.name, contentType: file.type, dataBase64,
      });
      await createAd.mutateAsync({
        eventId,
        sponsorName: sponsorName.trim(),
        tier, category,
        mediaType: isVideo ? "video" : "image",
        mediaUrl: url,
        mediaKey: key,
        linkUrl: linkUrl.trim() || undefined,
        runUntil: runUntil ? new Date(runUntil + "T23:59:59").getTime() : null,
        enabled: true,
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const grouped = {
    gold: ads.filter((a) => a.tier === "gold"),
    silver: ads.filter((a) => a.tier === "silver"),
    bronze: ads.filter((a) => a.tier === "bronze"),
  };

  return (
    <div className="space-y-6">
      {/* Add new sponsor */}
      <div className="rounded-2xl border border-white/10 bg-[#161616] p-5">
        <h3 className="mb-4 text-lg font-bold text-yellow-400">Add Sponsor Advertisement</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-400">Sponsor / Business Name</label>
            <input
              value={sponsorName}
              onChange={(e) => setSponsorName(e.target.value)}
              placeholder="e.g. Orleans Bowling Center"
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-yellow-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-400">Tier</label>
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value as Ad["tier"])}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-yellow-500 focus:outline-none"
            >
              {(["gold", "silver", "bronze"] as const).map((t) => (
                <option key={t} value={t}>{TIER_INFO[t].label} ({TIER_INFO[t].weight})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-400">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Ad["category"])}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-yellow-500 focus:outline-none"
            >
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-400">Runs Until (optional)</label>
            <input
              type="date"
              value={runUntil}
              onChange={(e) => setRunUntil(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-yellow-500 focus:outline-none"
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-gray-400">Click-through Link (optional — supplied by advertiser)</label>
            <input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://advertiser-website.com"
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-yellow-500 focus:outline-none"
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-gray-400">Image or Video (max 25 MB)</label>
            <input
              type="file"
              accept="image/*,video/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white file:mr-3 file:rounded-md file:border-0 file:bg-yellow-500 file:px-3 file:py-1 file:text-black"
            />
            {file && <p className="mt-1 text-xs text-gray-500">{file.name} — {(file.size / 1024 / 1024).toFixed(1)} MB</p>}
          </div>
        </div>
        <button
          onClick={handleSubmit}
          disabled={uploading || createAd.isPending}
          className="mt-4 rounded-xl bg-gradient-to-r from-yellow-500 to-orange-500 px-5 py-2.5 font-bold text-black transition active:scale-[0.98] disabled:opacity-50"
        >
          {uploading || createAd.isPending ? "Uploading…" : "Add Advertisement"}
        </button>
      </div>

      {/* Existing ads grouped by tier */}
      {listQuery.isLoading ? (
        <p className="text-gray-500">Loading sponsors…</p>
      ) : ads.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-[#141414] p-8 text-center text-gray-500">
          No sponsors yet. Add your first advertiser above. Sell tiers from the start — bowlers
          themselves make great Bronze sponsors.
        </div>
      ) : (
        (["gold", "silver", "bronze"] as const).map((t) =>
          grouped[t].length > 0 ? (
            <div key={t}>
              <div className="mb-2 flex items-center gap-2">
                <span className={`rounded-md bg-gradient-to-r px-2 py-0.5 text-xs font-bold uppercase ${TIER_INFO[t].color}`}>{t}</span>
                <span className="text-xs text-gray-500">{TIER_INFO[t].weight}</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {grouped[t].map((ad) => {
                  const expired = ad.runUntil && ad.runUntil < Date.now();
                  return (
                    <div key={ad.id} className="overflow-hidden rounded-xl border border-white/10 bg-[#161616]">
                      <div className="aspect-[16/7] w-full bg-black/40">
                        {ad.mediaType === "video"
                          ? <video src={ad.mediaUrl} className="h-full w-full object-cover" muted playsInline />
                          : <img src={ad.mediaUrl} alt={ad.sponsorName} className="h-full w-full object-cover" />}
                      </div>
                      <div className="p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate font-semibold text-white">{ad.sponsorName}</p>
                          <span className="text-[10px] uppercase text-gray-500">{ad.category}</span>
                        </div>
                        {ad.linkUrl && <p className="mt-0.5 truncate text-xs text-blue-400">{ad.linkUrl}</p>}
                        <p className="mt-0.5 text-xs text-gray-500">
                          {ad.runUntil ? `Runs until ${new Date(ad.runUntil).toLocaleDateString()}` : "No end date"}
                          {expired && <span className="ml-1 text-red-400">(expired)</span>}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            onClick={() => updateAd.mutate({ id: ad.id, enabled: !(ad.enabled === 1 || ad.enabled === true) })}
                            className={`rounded-md px-2.5 py-1 text-xs font-semibold ${ (ad.enabled === 1 || ad.enabled === true) ? "bg-green-500/20 text-green-300" : "bg-gray-600/30 text-gray-400"}`}
                          >
                            {(ad.enabled === 1 || ad.enabled === true) ? "Enabled" : "Disabled"}
                          </button>
                          <button
                            onClick={() => { if (confirm(`Delete ad for ${ad.sponsorName}?`)) removeAd.mutate({ id: ad.id }); }}
                            className="rounded-md bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-300 hover:bg-red-500/25"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null
        )
      )}
    </div>
  );
}
