import type { ReactNode } from "react";

// Small shared pieces for the two assistant chats (StrategyChat and
// CampaignEditChat) so their visual language stays identical without
// copy-pasting bubble/indicator markup between them.

/** Three-dot "assistant is thinking" bubble, styled like an assistant message. */
export function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <span className="flex items-center gap-1 rounded-lg rounded-bl-[2px] border border-white/[0.07] bg-paper-raised px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 animate-pulse rounded-full bg-ink/30 motion-reduce:animate-none"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
        <span className="sr-only">Assistant is thinking…</span>
      </span>
    </div>
  );
}

/** Empty-state example prompts — clicking one fills the input, never auto-sends. */
export function SuggestionChips({ suggestions, onPick }: { suggestions: string[]; onPick: (s: string) => void }) {
  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {suggestions.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onPick(s)}
          className="rounded-full border border-ink/15 bg-paper-raised px-3 py-1.5 font-sans text-[11.5px] text-ink-muted outline-none transition-colors hover:border-gold hover:text-ink focus-visible:ring-2 focus-visible:ring-gold/50"
        >
          {s}
        </button>
      ))}
    </div>
  );
}

/** One chat message bubble. User = solid gold (the app's selection color); assistant = white card on the grey well. */
export function ChatBubble({ role, children }: { role: "user" | "assistant"; children: ReactNode }) {
  return (
    <div className={`flex ${role === "user" ? "justify-end" : "justify-start"}`}>
      <p
        className={`max-w-[85%] px-3 py-2 font-sans text-[12.5px] leading-relaxed ${
          role === "user"
            ? "rounded-lg rounded-br-[2px] bg-gold font-medium text-on-gold shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
            : "rounded-lg rounded-bl-[2px] border border-white/[0.07] bg-paper-raised text-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
        }`}
      >
        {children}
      </p>
    </div>
  );
}

/** Shared input styling for the chat composer row. */
export const CHAT_INPUT_CLASS =
  "flex-1 resize-none rounded-lg border border-ink/15 bg-paper-raised px-3 py-2.5 font-sans text-[13px] text-ink shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] outline-none transition-colors placeholder:text-ink-muted/60 focus:border-gold focus:ring-2 focus:ring-gold/25";

export const CHAT_SEND_CLASS =
  "flex shrink-0 items-center justify-center rounded-lg btn-gold p-2.5 text-on-gold shadow-[0_1px_2px_rgba(0,0,0,0.15)] outline-none transition-colors hover:opacity-90 focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:cursor-not-allowed disabled:bg-none disabled:bg-white/10 disabled:text-ink/35 disabled:shadow-none";
