import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Clapperboard, LayoutGrid, ArrowLeftRight, ChevronsUpDown, Plus, Check } from "lucide-react";
import { useCampaignContext } from "../lib/campaignContext";

const NAV_ITEMS = [
  { to: "/", label: "Campaign", icon: LayoutGrid, end: true },
  { to: "/compare", label: "Compare Cities", icon: ArrowLeftRight, end: false },
];

function typeLabel(campaignType: string) {
  return campaignType.replace(/_/g, " ");
}

function CampaignSwitcher() {
  const { campaigns, activeCampaignId, activeCampaign, setActiveCampaignId } = useCampaignContext();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  return (
    <div ref={rootRef} className="relative mt-auto">
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-full overflow-hidden rounded-lg border border-canvas-line bg-canvas-raised shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)]">
          <div className="max-h-56 overflow-y-auto py-1">
            {campaigns.map((c) => (
              <button
                key={c.campaign_id}
                onClick={() => {
                  setActiveCampaignId(c.campaign_id);
                  setOpen(false);
                  navigate("/");
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left font-sans text-[12px] text-canvas-text hover:bg-canvas-line/50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-display text-[13px]">{c.title}</span>
                  <span className="block truncate text-[10px] uppercase tracking-[0.08em] text-canvas-muted">
                    {typeLabel(c.campaign_type)}
                  </span>
                </span>
                {c.campaign_id === activeCampaignId && <Check size={13} className="shrink-0 text-gold" />}
              </button>
            ))}
          </div>
          <NavLink
            to="/campaigns/new"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 border-t border-canvas-line px-3 py-2.5 font-sans text-[12px] text-gold hover:bg-canvas-line/50"
          >
            <Plus size={13} /> New Campaign
          </NavLink>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-canvas-line bg-canvas-raised px-3 py-3 text-left transition-colors hover:border-gold/40"
      >
        <span className="min-w-0">
          <span className="block font-sans text-[10px] uppercase tracking-[0.1em] text-canvas-muted">
            Active Campaign
          </span>
          <span className="mt-1 block truncate font-display text-[14px] text-canvas-text">
            {activeCampaign?.title ?? "Loading…"}
          </span>
          {activeCampaign && (
            <span className="block truncate font-sans text-[11px] text-canvas-muted">
              {typeLabel(activeCampaign.campaign_type)} · {activeCampaign.genre}
            </span>
          )}
        </span>
        <ChevronsUpDown size={14} className="shrink-0 text-canvas-muted" />
      </button>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-canvas">
      <aside className="flex w-60 shrink-0 flex-col border-r border-canvas-line px-5 py-6">
        <div className="mb-10 flex items-center gap-2.5 px-1">
          <Clapperboard size={20} className="text-gold" />
          <div>
            <p className="font-display text-[15px] leading-tight text-canvas-text">Tour Intelligence</p>
            <p className="font-sans text-[10px] uppercase tracking-[0.14em] text-canvas-muted">
              Agentic Cinema OS
            </p>
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2 font-sans text-[13px] transition-colors ${
                  isActive
                    ? "bg-canvas-raised text-canvas-text"
                    : "text-canvas-muted hover:bg-canvas-raised/60 hover:text-canvas-text"
                }`
              }
            >
              <Icon size={15} />
              {label}
            </NavLink>
          ))}
        </nav>

        <CampaignSwitcher />
      </aside>

      <main className="min-w-0 flex-1 px-10 py-8">{children}</main>
    </div>
  );
}
