import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Clapperboard, LayoutGrid, ArrowLeftRight } from "lucide-react";

const NAV_ITEMS = [
  { to: "/", label: "Campaign", icon: LayoutGrid, end: true },
  { to: "/compare", label: "Compare Cities", icon: ArrowLeftRight, end: false },
];

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

        <div className="mt-auto rounded-lg border border-canvas-line bg-canvas-raised px-3 py-3">
          <p className="font-sans text-[10px] uppercase tracking-[0.1em] text-canvas-muted">Active Campaign</p>
          <p className="mt-1 font-display text-[14px] text-canvas-text">Nova Horizon</p>
          <p className="font-sans text-[11px] text-canvas-muted">Film Promo Tour · Sci-fi Action</p>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-10 py-8">{children}</main>
    </div>
  );
}
