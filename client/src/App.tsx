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
import SeatingChart from "./pages/SeatingChart";
import AdLanding from "./pages/AdLanding";
import OfflineDoor from "./pages/OfflineDoor";
import OperatorSetupGuide from "./pages/OperatorSetupGuide";
import EdLogin from "./pages/EdLogin";
import EDStaffLogin from "./pages/EDStaffLogin";
import MasterSheetImport from "./pages/MasterSheetImport";
import { VideoSplash } from "./components/VideoSplash";
import { useLocation } from "wouter";

const ED_ICON_URL = "https://d2xsxph8kpxj0f.cloudfront.net/118351434/Y8eYwESKJRiDArjEnFPr6k/ed-icon-512-Vu5wULChGrkz9WqWNQ6rBh.png";

/** Injects the ED-specific icon + manifest when the user is on the /ed route.
 *  This makes "Add to Home Screen" on Android save the gold ED icon. */
function EdIconInjector() {
  const [location] = useLocation();
  const isEdRoute = location === "/ed" || location.startsWith("/ed/");

  useEffect(() => {
    if (!isEdRoute) return;

    // --- favicon ---
    let favicon = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!favicon) {
      favicon = document.createElement("link");
      favicon.rel = "icon";
      document.head.appendChild(favicon);
    }
    const prevFavicon = favicon.href;
    favicon.href = ED_ICON_URL;

    // --- apple-touch-icon ---
    let appleIcon = document.querySelector<HTMLLinkElement>("link[rel='apple-touch-icon']");
    if (!appleIcon) {
      appleIcon = document.createElement("link");
      appleIcon.rel = "apple-touch-icon";
      document.head.appendChild(appleIcon);
    }
    const prevApple = appleIcon.href;
    appleIcon.href = ED_ICON_URL;

    // --- manifest override ---
    const manifestEl = document.querySelector<HTMLLinkElement>("link[rel='manifest']");
    let prevManifest = "";
    let blobUrl = "";
    if (manifestEl) {
      prevManifest = manifestEl.href;
      const manifestData = {
        name: "ED Portal — Event Director",
        short_name: "ED Portal",
        icons: [
          { src: ED_ICON_URL, sizes: "512x512", type: "image/png" },
        ],
        theme_color: "#ffd700",
        background_color: "#0d0d1a",
        display: "standalone",
        start_url: "/ed",
      };
      const blob = new Blob([JSON.stringify(manifestData)], { type: "application/json" });
      blobUrl = URL.createObjectURL(blob);
      manifestEl.href = blobUrl;
    }

    // --- page title ---
    const prevTitle = document.title;
    document.title = "ED Portal — Event Director";

    return () => {
      // Restore when navigating away
      if (favicon) favicon.href = prevFavicon;
      if (appleIcon) appleIcon.href = prevApple;
      if (manifestEl && prevManifest) manifestEl.href = prevManifest;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      document.title = prevTitle;
    };
  }, [isEdRoute]);

  return null;
}

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
      <Route path="/ed-login" component={EdLogin} />
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
      <Route path="/offline-door" component={OfflineDoor} />
      <Route path="/seating-chart" component={SeatingChart} />
      <Route path="/ad" component={AdLanding} />
      <Route path="/invite" component={AdLanding} />
      <Route path="/setup-guide" component={OperatorSetupGuide} />
      <Route path="/admin/master-sheet" component={MasterSheetImport} />
      <Route path="/admin/staff-login" component={EDStaffLogin} />
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

/** Redirects wwwfuntimeteamchallenge.com straight to the ED portal */
function EdDomainRedirector() {
  const [location, navigate] = useLocation();
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  const isEdDomain =
    hostname === "wwwfuntimeteamchallenge.com" ||
    hostname === "www.wwwfuntimeteamchallenge.com";

  useEffect(() => {
    if (isEdDomain && location === "/") {
      navigate("/ed", { replace: true });
    }
  }, [isEdDomain, location, navigate]);

  return null;
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <PwaIconInjector />
          <EdIconInjector />
          <EdDomainRedirector />
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
