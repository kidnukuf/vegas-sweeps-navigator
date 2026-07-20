import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { detectGroupSlug, GROUP_THEMES, setSelectedEventId } from "@/lib/eventGroup";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Trophy, Calendar, Users } from "lucide-react";

interface EventRow {
  id: number;
  eventName: string;
  eventYear: number;
  status: string;
  sortOrder: number;
  startDate?: string;
  endDate?: string;
}

interface GroupRow {
  id: number;
  name: string;
  slug: string;
  domain: string;
  themeColor: string;
  isMultiEvent: boolean;
}

export default function LeagueSelector() {
  const [, navigate] = useLocation();
  const slug = detectGroupSlug();
  const theme = GROUP_THEMES[slug];

  const groupsQuery = trpc.event.listGroups.useQuery();
  const [groupId, setGroupId] = useState<number | null>(null);

  useEffect(() => {
    if (groupsQuery.data) {
      const groups = groupsQuery.data as unknown as GroupRow[];
      const match = groups.find((g) => g.slug === slug);
      if (match) {
        setGroupId(match.id);
        // If single-event group, auto-redirect to bowler login after selecting the only event
        if (!match.isMultiEvent) {
          // Will be handled below once events load
        }
      }
    }
  }, [groupsQuery.data, slug]);

  const eventsQuery = trpc.event.listByGroup.useQuery(
    { groupId: groupId! },
    { enabled: groupId !== null }
  );

  // Auto-select for single-event groups
  useEffect(() => {
    if (!eventsQuery.data) return;
    const events = eventsQuery.data as unknown as EventRow[];
    if (!theme.isMultiEvent && events.length === 1) {
      setSelectedEventId(events[0].id);
      navigate("/bowler-login");
    }
  }, [eventsQuery.data, theme.isMultiEvent, navigate]);

  const handleSelectEvent = (event: EventRow) => {
    setSelectedEventId(event.id);
    navigate("/bowler-login");
  };

  if (groupsQuery.isLoading || eventsQuery.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center"
           style={{ background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)" }}>
        <Spinner className="w-12 h-12" style={{ color: theme.color }} />
      </div>
    );
  }

  const events = (eventsQuery.data ?? []) as unknown as EventRow[];

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)" }}
    >
      {/* Header */}
      <div className="text-center mb-10">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Trophy className="w-12 h-12" style={{ color: theme.color }} />
          <h1
            className="text-4xl font-extrabold tracking-tight"
            style={{ color: theme.color, textShadow: `0 0 20px ${theme.color}80` }}
          >
            {theme.name}
          </h1>
        </div>
        <p className="text-white/70 text-xl">{theme.description}</p>
        <div
          className="mt-4 text-2xl font-bold"
          style={{ color: theme.color }}
        >
          Which league are you bowling in?
        </div>
        <p className="text-white/50 mt-2">
          Select your league below to continue to sign-up or sign-in.
        </p>
      </div>

      {/* League Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-2xl">
        {events.map((event) => (
          <Card
            key={event.id}
            className="cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: `2px solid ${theme.color}60`,
              boxShadow: `0 4px 24px ${theme.color}20`,
            }}
            onClick={() => handleSelectEvent(event)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle
                  className="text-2xl font-extrabold"
                  style={{ color: theme.color }}
                >
                  {event.eventName}
                </CardTitle>
                <Badge
                  style={{
                    background: event.status === "active" ? "#22c55e" : `${theme.color}30`,
                    color: event.status === "active" ? "#fff" : theme.color,
                    border: `1px solid ${theme.color}60`,
                  }}
                >
                  {event.status === "active" ? "Active" : "Upcoming"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2 text-white/70">
                {event.startDate && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" style={{ color: theme.color }} />
                    <span>
                      {event.startDate}
                      {event.endDate && event.endDate !== event.startDate
                        ? ` – ${event.endDate}`
                        : ""}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4" style={{ color: theme.color }} />
                  <span>Independent registration</span>
                </div>
              </div>
              <Button
                className="w-full mt-4 text-black font-bold text-lg"
                style={{ background: theme.color }}
              >
                Select {event.eventName}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Footer note */}
      <p className="mt-8 text-white/40 text-sm text-center max-w-md">
        If you bowl in multiple leagues, you will need to sign up separately for each one.
        Each league has its own independent registration.
      </p>
    </div>
  );
}
