import { Routes, Route } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { Dashboard } from "./pages/Dashboard";
import { CityDetail } from "./pages/CityDetail";
import { CompareCities } from "./pages/CompareCities";

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/city/:cityId" element={<CityDetail />} />
        <Route path="/compare" element={<CompareCities />} />
      </Routes>
    </AppShell>
  );
}
