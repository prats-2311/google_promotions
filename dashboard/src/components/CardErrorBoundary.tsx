import { Component, type ReactNode } from "react";

// Each Culture Intelligence card is independent (its own data, its own
// on-demand fetch) -- one card throwing during render must not blank out
// every sibling after it in the grid. Scoped per-card rather than once
// around the whole tab so a single bad card degrades gracefully instead of
// taking the rest of the page down with it.
export class CardErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error("Card failed to render:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-2xl bg-paper p-6">
          <p className="font-sans text-[12.5px] text-red-300">
            This card couldn't be displayed: {this.state.error.message}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
