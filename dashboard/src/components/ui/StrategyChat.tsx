import { useRef, useState } from "react";
import { Loader2, Paperclip, Send, Sparkles, X } from "lucide-react";
import { chatAboutStrategy } from "../../lib/api";
import type { ChatMessage, SuggestedCampaign } from "../../lib/types";

// .txt/.md only, read client-side via FileReader -- no multer/multipart on
// the server (none installed today), no PDF parsing. A clean later add, not
// a blocker for a first version of this feature.
const ACCEPTED_FILE_TYPES = ".txt,.md";

export function StrategyChat({ onSuggestion }: { onSuggestion: (suggested: SuggestedCampaign) => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [strategyText, setStrategyText] = useState<string | null>(null);
  const [strategyFileName, setStrategyFileName] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setStrategyText(String(reader.result || ""));
      setStrategyFileName(file.name);
    };
    reader.readAsText(file);
  }

  function clearFile() {
    setStrategyText(null);
    setStrategyFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function send() {
    const content = input.trim();
    if (!content || sending) return;
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    setError(null);
    try {
      const result = await chatAboutStrategy(nextMessages, strategyText);
      setMessages((prev) => [...prev, { role: "assistant", content: result.reply }]);
      if (result.ready && result.suggested_campaign) {
        onSuggestion(result.suggested_campaign);
        setApplied(true);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="mb-6 rounded-2xl bg-paper p-5">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles size={14} className="text-gold" />
        <p className="font-display text-[15px] text-ink">Draft with an assistant</p>
      </div>
      <p className="mb-4 font-sans text-[12.5px] text-ink-muted">
        Paste or attach an existing strategy, or just describe the tour — the form below will
        fill in once there's enough to propose a campaign.
      </p>

      {messages.length > 0 && (
        <div className="mb-3 max-h-64 space-y-2 overflow-y-auto rounded-lg border border-line bg-black/[0.015] p-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <p
                className={`max-w-[85%] rounded-lg px-3 py-1.5 font-sans text-[12.5px] leading-relaxed ${
                  m.role === "user" ? "bg-gold/20 text-ink" : "bg-paper-raised text-ink"
                }`}
              >
                {m.content}
              </p>
            </div>
          ))}
          {applied && (
            <p className="pt-1 text-center font-sans text-[11px] uppercase tracking-[0.08em] text-emerald-700">
              Applied to the form below — review and edit before creating
            </p>
          )}
        </div>
      )}

      {strategyFileName && (
        <div className="mb-3 flex w-fit items-center gap-2 rounded-full border border-line bg-paper-raised px-3 py-1">
          <Paperclip size={11} className="text-ink-muted" />
          <span className="font-sans text-[11px] text-ink">{strategyFileName}</span>
          <button type="button" onClick={clearFile} aria-label="Remove attached strategy">
            <X size={11} className="text-ink-muted hover:text-ink" />
          </button>
        </div>
      )}

      {error && (
        <div className="mb-3 rounded-lg border border-red-900/20 bg-red-950/5 px-3 py-2 font-sans text-[12px] text-red-800">
          Couldn't reach the assistant: {error}
        </div>
      )}

      <div className="flex items-end gap-2">
        <label
          className="flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-line bg-paper-raised p-2.5 text-ink-muted hover:text-ink"
          title="Attach a .txt or .md strategy document"
        >
          <Paperclip size={14} />
          <input ref={fileInputRef} type="file" accept={ACCEPTED_FILE_TYPES} onChange={handleFile} className="hidden" />
        </label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. We're planning a synth-pop tour, Tokyo and London this fall…"
          rows={1}
          className="flex-1 resize-none rounded-lg border border-line bg-paper-raised px-3 py-2.5 font-sans text-[13px] text-ink outline-none focus:border-ink/30"
        />
        <button
          type="button"
          onClick={send}
          disabled={sending || !input.trim()}
          className="flex shrink-0 items-center justify-center rounded-lg bg-gold p-2.5 text-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Send"
        >
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>
    </div>
  );
}
