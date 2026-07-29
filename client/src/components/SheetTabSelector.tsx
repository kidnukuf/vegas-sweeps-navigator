/**
 * SheetTabSelector — standalone reusable component.
 *
 * Given a spreadsheetId (or full Google Sheets URL), fetches the live list of
 * tab names via trpc.event.getSheetTabs and renders a dropdown.  Falls back to
 * a free-text input if the fetch fails or the spreadsheet ID is not yet set.
 *
 * Props
 * ─────
 * spreadsheetId  – bare ID or full URL; required to trigger the fetch
 * value          – currently selected tab name (controlled)
 * onChange       – called with the new tab name when the user picks one
 * onTabSelect    – optional; called with the full {name, gid} object on selection
 * label          – optional label text (default "Sheet Tab")
 * required       – shows a red asterisk
 * disabled       – disables the control
 * className      – extra classes on the wrapper div
 */
import { trpc } from "@/lib/trpc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";

export interface SheetTab {
  name: string;
  gid: number;
}

interface SheetTabSelectorProps {
  spreadsheetId: string;
  value: string;
  onChange: (tab: string) => void;
  /** Called with the full tab object (name + gid) when user picks a tab */
  onTabSelect?: (tab: SheetTab) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

/** Extract bare spreadsheet ID from a full Google Sheets URL if needed. */
function extractSpreadsheetId(raw: string): string {
  if (raw.includes("/d/")) {
    return raw.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] ?? raw.trim();
  }
  return raw.trim();
}

export default function SheetTabSelector({
  spreadsheetId,
  value,
  onChange,
  onTabSelect,
  label = "Sheet Tab",
  required = false,
  disabled = false,
  className = "",
}: SheetTabSelectorProps) {
  const bareId = extractSpreadsheetId(spreadsheetId);
  const enabled = bareId.length > 10;

  const tabsQuery = trpc.event.getSheetTabs.useQuery(
    { spreadsheetId: bareId },
    { enabled, staleTime: 30_000 }
  );

  // Support both legacy string[] and new {name,gid}[] shapes from the server
  const rawTabs = tabsQuery.data?.tabs ?? [];
  const tabs: SheetTab[] = rawTabs.map((t) =>
    typeof t === "string" ? { name: t as string, gid: 0 } : (t as SheetTab)
  );
  const loading = tabsQuery.isFetching;
  const hasTabs = tabs.length > 0;

  const handleValueChange = (v: string) => {
    const name = v === "__none__" ? "" : v;
    onChange(name);
    if (name && onTabSelect) {
      const found = tabs.find((t) => t.name === name);
      if (found) onTabSelect(found);
    }
  };

  return (
    <div className={`space-y-1 ${className}`}>
      {/* Label row */}
      <div className="flex items-center justify-between">
        <Label className="text-yellow-400/80 text-xs font-bold uppercase tracking-wider">
          {label}
          {required && <span className="text-red-400 ml-0.5">*</span>}
        </Label>
        <div className="flex items-center gap-1.5">
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
          {!loading && enabled && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => tabsQuery.refetch()}
              disabled={disabled}
              className="h-5 px-1.5 text-xs text-gray-500 hover:text-yellow-400 hover:bg-transparent"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Refresh
            </Button>
          )}
        </div>
      </div>

      {/* Dropdown or fallback text input */}
      {hasTabs ? (
        <Select
          value={value || "__none__"}
          onValueChange={handleValueChange}
          disabled={disabled || loading}
        >
          <SelectTrigger className="bg-black/50 border-white/10 text-white h-9 focus:border-yellow-500/50 data-[placeholder]:text-gray-600">
            <SelectValue placeholder="— Select a tab —" />
          </SelectTrigger>
          <SelectContent className="bg-[#1a1a1a] border-white/10 text-white max-h-72">
            <SelectItem value="__none__" className="text-gray-500 focus:bg-yellow-500/20 focus:text-yellow-300">
              — Select a tab —
            </SelectItem>
            {tabs.map((tab) => (
              <SelectItem
                key={tab.name}
                value={tab.name}
                className="focus:bg-yellow-500/20 focus:text-yellow-300"
              >
                {tab.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={
            !enabled
              ? "Enter spreadsheet ID above to load tabs"
              : loading
              ? "Loading tabs…"
              : "Could not load tabs — type tab name manually"
          }
          className="bg-black/50 border-white/10 text-white placeholder-gray-600 focus:border-yellow-500/50 h-9"
        />
      )}

      {/* Status hint */}
      {enabled && !loading && hasTabs && (
        <p className="text-xs text-gray-500">
          {tabs.length} tab{tabs.length !== 1 ? "s" : ""} found.
          {value ? (
            <> Selected: <span className="text-green-300 font-medium">{value}</span></>
          ) : (
            <span className="text-yellow-400/70"> Pick a tab to target.</span>
          )}
        </p>
      )}
      {enabled && !loading && !hasTabs && (
        <p className="text-xs text-yellow-500/70">
          Could not read tabs — check the spreadsheet ID or service account permissions.
        </p>
      )}
    </div>
  );
}
