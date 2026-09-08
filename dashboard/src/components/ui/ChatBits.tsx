import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Mic, Square } from "lucide-react";

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

/** Voice input via the browser's Web Speech API -- transcription happens
 * client-side in the browser and lands in the composer as editable text;
 * no audio is ever uploaded. Renders nothing where the API is unsupported
 * (e.g. Firefox), so those browsers keep the exact keyboard-only chat. */
export function MicButton({ onTranscript }: { onTranscript: (text: string) => void }) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<{ stop: () => void; abort?: () => void } | null>(null);
  const supported =
    typeof window !== "undefined" &&
    Boolean(
      (window as unknown as Record<string, unknown>).SpeechRecognition ||
        (window as unknown as Record<string, unknown>).webkitSpeechRecognition
    );

  useEffect(() => () => recRef.current?.abort?.(), []);

  if (!supported) return null;

  function toggle() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const w = window as unknown as Record<string, new () => SpeechRecognitionLike>;
    const Ctor = (w.SpeechRecognition || w.webkitSpeechRecognition)!;
    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      const text = Array.from(e.results)
        .map((r) => r[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (text) onTranscript(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={listening ? "Stop voice input" : "Start voice input"}
      title={listening ? "Stop voice input" : "Speak instead of typing"}
      className={`flex shrink-0 items-center justify-center rounded-lg border p-2.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold/50 ${
        listening
          ? "animate-pulse border-red-400/60 bg-red-400/10 text-red-300 motion-reduce:animate-none"
          : "border-ink/15 bg-paper-raised text-ink-muted hover:border-ink/40 hover:text-ink"
      }`}
    >
      {listening ? <Square size={14} aria-hidden /> : <Mic size={14} aria-hidden />}
    </button>
  );
}

// Minimal structural type for the vendor-prefixed Web Speech API -- not in
// TS's lib.dom, and @types/dom-speech-recognition would be a dep for one use.
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
}
