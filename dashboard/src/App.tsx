import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { Dashboard } from "./pages/Dashboard";
import { CampaignProvider } from "./lib/campaignContext";

// Dashboard is the landing route, loaded eagerly -- it's needed on first
// paint anyway, so splitting it out would just add a chunk-fetch delay with
// no benefit. The other three are only needed once the user navigates to
// them, so they ship as separate chunks instead of bloating the initial
// bundle every visitor downloads.
const CityDetail = lazy(() => import("./pages/CityDetail").then((m) => ({ default: m.CityDetail })));
const CompareCities = lazy(() => import("./pages/CompareCities").then((m) => ({ default: m.CompareCities })));
const NewCampaign = lazy(() => import("./pages/NewCampaign").then((m) => ({ default: m.NewCampaign })));

export default function App() {
  return (
    <CampaignProvider>
      <AppShell>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/city/:cityId" element={<CityDetail />} />
            <Route path="/compare" element={<CompareCities />} />
            <Route path="/campaigns/new" element={<NewCampaign />} />
          </Routes>
        </Suspense>
      </AppShell>
    </CampaignProvider>
  );
}
