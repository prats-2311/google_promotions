import { useEffect, useRef, useState } from "react";
import { Loader2, Paperclip, RotateCcw, Search, Send, Sparkles, X } from "lucide-react";
import { chatAboutStrategy, getChatSession, saveChatSession } from "../../lib/api";
import type { ChatMessage, FranchiseContext, SuggestedCampaign } from "../../lib/types";
import { CueCard } from "./CueCard";
import { ChatBubble, CHAT_INPUT_CLASS, CHAT_SEND_CLASS, SuggestionChips, TypingIndicator } from "./ChatBits";
import { usePersistentState, clearPersistentState } from "../../lib/usePersistentState";

// .txt/.md only, read client-side via FileReader -- no multer/multipart on
// the server (none installed today), no PDF parsing. A clean later add, not
// a blocker for a first version of this feature.
const ACCEPTED_FILE_TYPES = ".txt,.md";

const STRATEGY_SUGGESTIONS = [
  "Synth-pop world tour, Tokyo and London this fall",
  "Promo tour for a sci-fi film across Asia",
  "3-city Europe press tour in May",
];

export function StrategyChat({ onSuggestion }: { onSuggestion: (suggested: SuggestedCampaign) => void }) {
  // Conversation, franchise research, and any attached strategy doc are
  // persisted -- a refresh or dropped connection mid-planning must not eat
  // the chat (a real reported failure), and re-fetching the research would
  // cost a second live Parallel+Gemini round for identical input.
  const [messages, setMessages] = usePersistentState<ChatMessage[]>("strategy-chat:messages", []);
  const [input, setInput] = useState("");
  const [strategyText, setStrategyText] = usePersistentState<string | null>("strategy-chat:doc-text", null);
  const [strategyFileName, setStrategyFileName] = usePersistentState<string | null>("strategy-chat:doc-name", null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const [franchiseContext, setFranchiseContext] = usePersistentState<FranchiseContext | null>(
    "strategy-chat:franchise",
    null
  );

  // Server tier of the history (localStorage above is the instant tier):
  // adopt another device's session when local is empty; push every turn.
  const sessionKey = "strategy:default";
  useEffect(() => {
    let cancelled = false;
    getChatSession(sessionKey)
      .then((s) => {
        if (cancelled || s.messages.length === 0) return;
        setMessages((local) => (local.length > 0 ? local : s.messages));
        const ctx = s.context as { franchise_context?: FranchiseContext | null; doc_text?: string | null; doc_name?: string | null } | null;
        if (ctx?.franchise_context) setFranchiseContext((local) => local ?? ctx.franchise_context ?? null);
        if (ctx?.doc_text) setStrategyText((local) => local ?? ctx.doc_text ?? null);
        if (ctx?.doc_name) setStrategyFileName((local) => local ?? ctx.doc_name ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pushSession(nextMessages: ChatMessage[], fc: FranchiseContext | null, docText: string | null, docName: string | null) {
    void saveChatSession(sessionKey, nextMessages, {
      franchise_context: fc,
      doc_text: docText,
      doc_name: docName,
    }).catch(() => {});
  }

  function startOver() {
    setMessages([]);
    setFranchiseContext(null);
    setStrategyText(null);
    setStrategyFileName(null);
    setApplied(false);
    setError(null);
    clearPersistentState(
      "strategy-chat:messages",
      "strategy-chat:doc-text",
      "strategy-chat:doc-name",
      "strategy-chat:franchise"
    );
    pushSession([], null, null, null);
  }
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
      const result = await chatAboutStrategy(nextMessages, strategyText, franchiseContext);
      const withReply: ChatMessage[] = [...nextMessages, { role: "assistant", content: result.reply }];
      setMessages(withReply);
      setFranchiseContext(result.franchise_context);
      pushSession(withReply, result.franchise_context, strategyText, strategyFileName);
      // Fill the form live from every partial suggestion, not only once the
      // whole campaign is ready -- applySuggestion itself never overwrites a
      // field the user has already typed/toggled by hand.
      if (result.suggested_campaign) {
        onSuggestion(result.suggested_campaign);
      }
      if (result.ready && result.suggested_campaign) {
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
    <CueCard accent="var(--color-gold)" className="mb-6" bodyClassName="p-5">
      <p className="mb-1 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">
        AI co-planner · grounded with live web research
      </p>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-gold" aria-hidden />
          <p className="font-display text-[16px] text-ink">Draft with an assistant</p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={startOver}
            className="flex items-center gap-1.5 rounded font-sans text-[11px] text-ink-muted outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-gold/50"
          >
            <RotateCcw size={11} aria-hidden /> Start over
          </button>
        )}
      </div>
      <p className="mb-4 font-sans text-[12.5px] text-ink-muted">
        Paste or attach an existing strategy, or just describe the tour — the form below will
        fill in once there's enough to propose a campaign.
      </p>

      {messages.length > 0 && (
        <div className="mb-3 max-h-64 space-y-2.5 overflow-y-auto rounded-lg bg-paper-raised/80 p-3">
          {messages.map((m, i) => (
            <ChatBubble key={i} role={m.role}>
              {m.content}
            </ChatBubble>
          ))}
          {sending && <TypingIndicator />}
          {applied && (
            <p className="pt-1 text-center font-sans text-[11px] uppercase tracking-[0.08em] text-emerald-300">
              Applied to the form below — review and edit before creating
            </p>
          )}
        </div>
      )}

      {messages.length === 0 && <SuggestionChips suggestions={STRATEGY_SUGGESTIONS} onPick={setInput} />}

      {franchiseContext && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-ink/10 bg-paper-raised px-3 py-2">
          <Search size={12} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden />
          <p className="font-sans text-[11.5px] leading-relaxed text-ink-muted">
            {franchiseContext.is_real_property ? (
              <>
                Researched <span className="font-semibold text-ink">{franchiseContext.title}</span>
                {franchiseContext.source_type ? ` (${franchiseContext.source_type})` : ""} —{" "}
                {franchiseContext.core_themes.join(", ") || "no clear themes found"}
              </>
            ) : (
              <>
                Couldn't find <span className="font-semibold text-ink">{franchiseContext.title}</span> as an
                existing property — treating it as an original title.
              </>
            )}
          </p>
        </div>
      )}

      {strategyFileName && (
        <div className="mb-3 flex w-fit items-center gap-2 rounded-full border border-ink/15 bg-paper-raised px-3 py-1">
          <Paperclip size={11} className="text-ink-muted" aria-hidden />
          <span className="font-sans text-[11px] text-ink">{strategyFileName}</span>
          <button
            type="button"
            onClick={clearFile}
            aria-label="Remove attached strategy"
            className="rounded outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
          >
            <X size={11} className="text-ink-muted hover:text-ink" aria-hidden />
          </button>
        </div>
      )}

      {error && (
        <div className="mb-3 rounded-lg border border-red-300/20 bg-red-300/[0.06] px-3 py-2 font-sans text-[12px] text-red-300">
          Couldn't reach the assistant: {error}
        </div>
      )}

      <div className="flex items-end gap-2">
        <label
          className="flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-ink/15 bg-paper-raised p-2.5 text-ink-muted transition-colors hover:border-ink/40 hover:text-ink"
          title="Attach a .txt or .md strategy document"
        >
          <Paperclip size={14} aria-hidden />
          <span className="sr-only">Attach a .txt or .md strategy document</span>
          <input ref={fileInputRef} type="file" accept={ACCEPTED_FILE_TYPES} onChange={handleFile} className="hidden" />
        </label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. We're planning a synth-pop tour, Tokyo and London this fall…"
          rows={1}
          className={CHAT_INPUT_CLASS}
        />
        <button
          type="button"
          onClick={send}
          disabled={sending || !input.trim()}
          className={CHAT_SEND_CLASS}
          aria-label="Send"
        >
          {sending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Send size={14} aria-hidden />}
        </button>
      </div>
    </CueCard>
  );
}
