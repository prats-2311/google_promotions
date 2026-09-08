import { useState } from "react";
import { Check, Loader2, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { addCampaignStops, chatAboutCampaignEdit, removeCampaignStop, updateCampaign } from "../../lib/api";
import type { ChatMessage, ProposedCampaignChanges } from "../../lib/types";
import { CueCard } from "./CueCard";
import { ChatBubble, CHAT_INPUT_CLASS, CHAT_SEND_CLASS, SuggestionChips, TypingIndicator } from "./ChatBits";
import { usePersistentState, clearPersistentState } from "../../lib/usePersistentState";

// Real writes to a live, already-created campaign -- unlike NewCampaign's
// StrategyChat (which only pre-fills a local draft form the user still
// submits), applying a change here immediately mutates BigQuery. That's why
// this always shows a review step before an "Apply" click, rather than
// auto-applying the moment the model marks itself ready.
function describeChanges(changes: ProposedCampaignChanges): string[] {
  const lines: string[] = [];
  if (changes.title) lines.push(`Rename to "${changes.title}"`);
  if (changes.genre) lines.push(`Change genre to "${changes.genre}"`);
  if (changes.campaign_type) lines.push(`Change campaign type to "${changes.campaign_type.replace(/_/g, " ")}"`);
  if (changes.talent_roster) lines.push(`Update talent roster to: ${changes.talent_roster.join(", ") || "(empty)"}`);
  for (const s of changes.add_stops) lines.push(`Add stop: ${s.city_id.replace(/_/g, " ")} on ${s.stop_date}`);
  for (const id of changes.remove_stop_city_ids) lines.push(`Remove stop: ${id.replace(/_/g, " ")}`);
  return lines;
}

const EDIT_SUGGESTIONS = [
  "Add a stop in Berlin this November",
  "Change the genre",
  "Rename this campaign",
];

export function CampaignEditChatToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={open}
      className={`flex shrink-0 items-center gap-2 rounded-lg border px-3.5 py-2 font-sans text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
        open
          ? "border-gold bg-gold/15 text-gold"
          : "border-canvas-line text-canvas-text hover:border-gold/50"
      }`}
    >
      <Sparkles size={14} className="text-gold" aria-hidden />
      Edit with assistant
    </button>
  );
}

export function CampaignEditChat({
  campaignId,
  onApplied,
  onClose,
}: {
  campaignId: string;
  onApplied: () => void;
  onClose: () => void;
}) {
  // Persisted per campaign: a refresh mid-edit must not eat the
  // conversation or a proposed-but-not-yet-applied change set. The parent
  // passes key={campaignId}, so switching campaigns remounts this with the
  // right history (see usePersistentState's key-change note).
  const [messages, setMessages] = usePersistentState<ChatMessage[]>(`edit-chat:${campaignId}:messages`, []);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingChanges, setPendingChanges] = usePersistentState<ProposedCampaignChanges | null>(
    `edit-chat:${campaignId}:pending`,
    null
  );

  function startOver() {
    setMessages([]);
    setPendingChanges(null);
    setApplied(false);
    setError(null);
    setApplyError(null);
    clearPersistentState(`edit-chat:${campaignId}:messages`, `edit-chat:${campaignId}:pending`);
  }
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  async function send() {
    const content = input.trim();
    if (!content || sending) return;
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    setError(null);
    setApplied(false);
    try {
      const result = await chatAboutCampaignEdit(campaignId, nextMessages);
      setMessages((prev) => [...prev, { role: "assistant", content: result.reply }]);
      setPendingChanges(result.ready_to_apply ? result.proposed_changes : null);
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

  async function handleApply() {
    if (!pendingChanges) return;
    setApplying(true);
    setApplyError(null);
    try {
      const scalarChanges: Record<string, string | string[]> = {};
      if (pendingChanges.title) scalarChanges.title = pendingChanges.title;
      if (pendingChanges.genre) scalarChanges.genre = pendingChanges.genre;
      if (pendingChanges.campaign_type) scalarChanges.campaign_type = pendingChanges.campaign_type;
      if (pendingChanges.talent_roster) scalarChanges.talent_roster = pendingChanges.talent_roster;
      if (Object.keys(scalarChanges).length > 0) {
        await updateCampaign(campaignId, scalarChanges);
      }
      if (pendingChanges.add_stops.length > 0) {
        await addCampaignStops(campaignId, pendingChanges.add_stops);
      }
      for (const cityId of pendingChanges.remove_stop_city_ids) {
        await removeCampaignStop(campaignId, cityId);
      }
      setPendingChanges(null);
      setApplied(true);
      onApplied();
    } catch (err) {
      setApplyError(String(err));
    } finally {
      setApplying(false);
    }
  }

  return (
    <CueCard accent="var(--color-gold)" className="mb-6" bodyClassName="p-5">
      <div className="mb-1 flex items-start justify-between gap-2">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">
          AI assistant · nothing writes until you apply
        </p>
        <div className="flex items-center gap-3">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={startOver}
              className="flex items-center gap-1.5 rounded font-sans text-[11px] text-ink-muted outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-gold/50"
            >
              <RotateCcw size={11} aria-hidden /> New chat
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-0.5 text-ink-muted outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-gold/50"
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      </div>
      <div className="mb-1.5 flex items-center gap-2">
        <Sparkles size={15} className="text-gold" aria-hidden />
        <p className="font-display text-[16px] text-ink">Edit this campaign</p>
      </div>
      <p className="mb-4 font-sans text-[12.5px] text-ink-muted">
        Describe a change — add a stop, drop one, tweak the genre or roster — then review the diff before applying.
      </p>

      {messages.length > 0 && (
        <div className="mb-3 max-h-64 space-y-2.5 overflow-y-auto rounded-lg bg-paper-raised/80 p-3">
          {messages.map((m, i) => (
            <ChatBubble key={i} role={m.role}>
              {m.content}
            </ChatBubble>
          ))}
          {sending && <TypingIndicator />}
        </div>
      )}

      {messages.length === 0 && <SuggestionChips suggestions={EDIT_SUGGESTIONS} onPick={setInput} />}

      {pendingChanges && (
        <div className="mb-3 rounded-lg border border-gold/50 bg-gold/10 p-3.5">
          <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-ink">
            Review before applying
          </p>
          <ul className="mb-3 space-y-1.5">
            {describeChanges(pendingChanges).map((line, i) => (
              <li key={i} className="flex items-start gap-2 font-sans text-[12.5px] text-ink">
                <span className="mt-[6px] size-1.5 shrink-0 bg-gold" aria-hidden />
                {line}
              </li>
            ))}
          </ul>
          {applyError && <p className="mb-2 font-sans text-[12px] text-red-300">Couldn't apply: {applyError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleApply}
              disabled={applying}
              className="btn-gold flex items-center gap-1.5 rounded-lg px-3.5 py-2 font-sans text-[12px] font-semibold text-on-gold outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:cursor-not-allowed disabled:opacity-50"
            >
              {applying ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Check size={12} aria-hidden />}
              {applying ? "Applying…" : "Apply changes"}
            </button>
            <button
              type="button"
              onClick={() => setPendingChanges(null)}
              disabled={applying}
              className="rounded-lg border border-ink/15 px-3.5 py-2 font-sans text-[12px] text-ink-muted outline-none transition-colors hover:border-ink/40 hover:text-ink focus-visible:ring-2 focus-visible:ring-gold/50"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {applied && (
        <p className="mb-3 flex items-center gap-1.5 font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-emerald-300">
          <Check size={12} aria-hidden /> Applied — the campaign now reflects these changes
        </p>
      )}

      {error && (
        <div className="mb-3 rounded-lg border border-red-300/20 bg-red-300/[0.06] px-3 py-2 font-sans text-[12px] text-red-300">
          Couldn't reach the assistant: {error}
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. Add a stop in Berlin on November 10th"
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
