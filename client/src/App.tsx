import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { OfflineBanner } from "./components/OfflineBanner";
import Home from "./pages/Home";
import AdminDashboard from "./pages/AdminDashboard";
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

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
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
