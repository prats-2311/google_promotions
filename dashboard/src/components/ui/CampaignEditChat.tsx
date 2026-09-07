import { useState } from "react";
import { Check, Loader2, Search, Send, Sparkles, X } from "lucide-react";
import { addCampaignStops, chatAboutCampaignEdit, removeCampaignStop, updateCampaign } from "../../lib/api";
import type { ChatMessage, ProposedCampaignChanges } from "../../lib/types";

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

export function CampaignEditChatToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex shrink-0 items-center gap-2 rounded-lg border px-3.5 py-2 font-sans text-[13px] transition-colors ${
        open ? "border-gold/50 text-ink bg-gold/10" : "border-canvas-line text-canvas-text hover:border-gold/50"
      }`}
    >
      <Sparkles size={14} className="text-gold" />
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingChanges, setPendingChanges] = useState<ProposedCampaignChanges | null>(null);
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
    <div className="mb-6 rounded-2xl bg-paper p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-gold" />
          <p className="font-display text-[15px] text-ink">Edit this campaign</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close">
          <X size={14} className="text-ink-muted hover:text-ink" />
        </button>
      </div>
      <p className="mb-4 font-sans text-[12.5px] text-ink-muted">
        Describe a change — add a stop, drop one, tweak the genre or roster. Nothing is written until you
        review and apply it below.
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
        </div>
      )}

      {pendingChanges && (
        <div className="mb-3 rounded-lg border border-gold/40 bg-gold/10 p-3">
          <p className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-ink">
            Review before applying
          </p>
          <ul className="mb-3 space-y-1">
            {describeChanges(pendingChanges).map((line, i) => (
              <li key={i} className="flex items-start gap-1.5 font-sans text-[12.5px] text-ink">
                <Search size={11} className="mt-0.5 shrink-0 text-ink-muted" />
                {line}
              </li>
            ))}
          </ul>
          {applyError && <p className="mb-2 font-sans text-[12px] text-red-800">Couldn't apply: {applyError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleApply}
              disabled={applying}
              className="flex items-center gap-1.5 rounded-lg bg-gold px-3 py-1.5 font-sans text-[12px] font-semibold text-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {applying ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              {applying ? "Applying…" : "Apply changes"}
            </button>
            <button
              type="button"
              onClick={() => setPendingChanges(null)}
              disabled={applying}
              className="rounded-lg border border-line px-3 py-1.5 font-sans text-[12px] text-ink-muted hover:text-ink"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {applied && (
        <p className="mb-3 font-sans text-[11px] uppercase tracking-[0.08em] text-emerald-700">
          Applied — the campaign now reflects these changes
        </p>
      )}

      {error && (
        <div className="mb-3 rounded-lg border border-red-900/20 bg-red-950/5 px-3 py-2 font-sans text-[12px] text-red-800">
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
