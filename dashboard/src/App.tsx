import { Routes, Route } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { Dashboard } from "./pages/Dashboard";
import { CityDetail } from "./pages/CityDetail";
import { CompareCities } from "./pages/CompareCities";
import { NewCampaign } from "./pages/NewCampaign";
import { CampaignProvider } from "./lib/campaignContext";

export default function App() {
  return (
    <CampaignProvider>
      <AppShell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/city/:cityId" element={<CityDetail />} />
          <Route path="/compare" element={<CompareCities />} />
          <Route path="/campaigns/new" element={<NewCampaign />} />
        </Routes>
      </AppShell>
    </CampaignProvider>
  );
}
