import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { OfflineBanner } from "./components/OfflineBanner";
import Home from "./pages/Home";
import AdminDashboard from "./pages/AdminDashboard";
import { useEffect } from "react";
import { detectGroupSlug, GROUP_THEMES } from "./lib/eventGroup";
import BowlerRegistration from "./pages/BowlerRegistration";
import TeamCaptain from "./pages/TeamCaptain";
import DoormanCheckIn from "./pages/DoormanCheckIn";
import BowlerProfile from "./pages/BowlerProfile";
import ImportData from "./pages/ImportData";
import ProgramDirector from "./pages/ProgramDirector";
import BowlerLogin from "./pages/BowlerLogin";
import BowlerDashboard from "./pages/BowlerDashboard";
import BowlerConfirmation from "./pages/BowlerConfirmation";
import CaptainDashboard from "./pages/CaptainDashboard";
import CaptainLogin from "./pages/CaptainLogin";
import CaptainConfirmation from "./pages/CaptainConfirmation";
import ScanPassport from "./pages/ScanPassport";
import DoormanTablet from "./pages/DoormanTablet";
import LeagueSelector from "./pages/LeagueSelector";
import { VideoSplash } from "./components/VideoSplash";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/register" component={BowlerRegistration} />
      <Route path="/team-captain" component={TeamCaptain} />
      <Route path="/doorman" component={DoormanCheckIn} />
      <Route path="/bowler/:id" component={BowlerProfile} />
      <Route path="/import" component={ImportData} />
      <Route path="/program-director" component={ProgramDirector} />
      <Route path="/league-select" component={LeagueSelector} />
      <Route path="/ed" component={AdminDashboard} />
      <Route path="/bowler-login" component={BowlerLogin} />
      <Route path="/bowler" component={BowlerDashboard} />
      <Route path="/bowler-dashboard" component={BowlerDashboard} />
      <Route path="/bowler-confirmation" component={BowlerConfirmation} />
      <Route path="/captain-login" component={CaptainLogin} />
      <Route path="/captain-dashboard" component={CaptainDashboard} />
      <Route path="/captain" component={CaptainDashboard} />
      <Route path="/captain-confirmation" component={CaptainConfirmation} />
      <Route path="/scan/:type/:token" component={ScanPassport} />
      <Route path="/doorman-tablet" component={DoormanTablet} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function PwaIconInjector() {
  useEffect(() => {
    const groupSlug = detectGroupSlug();
    const groupTheme = GROUP_THEMES[groupSlug];
    // Only inject if non-BOB theme has custom icons
    if (groupSlug === "bob" || !groupTheme.faviconUrl) return;

    // Update favicon
    const favicon = document.querySelector<HTMLLinkElement>("link[rel='icon'], link[rel='shortcut icon']");
    if (favicon) favicon.href = groupTheme.faviconUrl;
    else {
      const link = document.createElement("link");
      link.rel = "icon";
      link.href = groupTheme.faviconUrl;
      document.head.appendChild(link);
    }

    // Update apple-touch-icon
    const appleIcon = document.querySelector<HTMLLinkElement>("link[rel='apple-touch-icon']");
    if (appleIcon && groupTheme.icon192) appleIcon.href = groupTheme.icon192;
    else if (groupTheme.icon192) {
      const link = document.createElement("link");
      link.rel = "apple-touch-icon";
      link.href = groupTheme.icon192;
      document.head.appendChild(link);
    }

    // Update manifest icons (if manifest is dynamically injectable)
    const manifest = document.querySelector<HTMLLinkElement>("link[rel='manifest']");
    if (manifest) {
      // Build a data-URI manifest override with themed icons
      const manifestData = {
        name: groupTheme.name,
        short_name: groupTheme.name.split(" ")[0],
        icons: [
          { src: groupTheme.icon192, sizes: "192x192", type: "image/png" },
          { src: groupTheme.icon512, sizes: "512x512", type: "image/png" },
        ],
        theme_color: groupTheme.color,
        background_color: groupTheme.bgColor ?? "#0d0d0d",
        display: "standalone",
        start_url: "/",
      };
      const blob = new Blob([JSON.stringify(manifestData)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      manifest.href = url;
      return () => URL.revokeObjectURL(url);
    }
  }, []);
  return null;
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <PwaIconInjector />
          <VideoSplash />
          <OfflineBanner />
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
