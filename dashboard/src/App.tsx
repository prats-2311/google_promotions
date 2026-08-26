import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { Dashboard } from "./pages/Dashboard";
import { CampaignProvider } from "./lib/campaignContext";
import { CityDetailSkeleton, CompareCitiesSkeleton, NewCampaignSkeleton } from "./components/ui/Skeletons";

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
        {/* Each lazy route gets its own Suspense + matching skeleton, not one
            shared fallback={null} -- a bare null meant a direct/hard load of
            any of these routes (a fresh visit, a shared link, a reload) showed
            a totally blank page for however long that route's JS chunk took
            to fetch, indistinguishable from the app being broken. */}
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route
            path="/city/:cityId"
            element={
              <Suspense fallback={<CityDetailSkeleton />}>
                <CityDetail />
              </Suspense>
            }
          />
          <Route
            path="/compare"
            element={
              <Suspense fallback={<CompareCitiesSkeleton />}>
                <CompareCities />
              </Suspense>
            }
          />
          <Route
            path="/campaigns/new"
            element={
              <Suspense fallback={<NewCampaignSkeleton />}>
                <NewCampaign />
              </Suspense>
            }
          />
        </Routes>
      </AppShell>
    </CampaignProvider>
  );
}
