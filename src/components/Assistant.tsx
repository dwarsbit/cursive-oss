/**
 * The assistant in Cursive, from the shared parts of @scholarkit/assistant:
 * the Ask button next to the avatar, the floating bar over the page (the
 * default), the panel docked on the right (the alternative), and the Ask
 * menu on a selection. Cursive adds its cards: changes to a page, papers
 * to cite, references to fix and checked quotes.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  BookOpenText,
  Eraser,
  Languages,
  ListChecks,
  Minimize2,
  Search,
  SpellCheck,
} from "lucide-react";
import {
  AnswerActions,
  AskBar,
  AskButton,
  AssistantFloating,
  AssistantPanel,
  Composer,
  ConversationView,
  DiffCard,
  EmptyState,
  PaperCard,
  SelectionMenu,
  SourceQuote,
  Suggestions,
  UsageLine,
  lineDiff,
  useAskShortcut,
  type AssistantEntry,
  type Entry,
  type MenuGroup,
  type UsageSource,
} from "@scholarkit/assistant";
import type { Usage } from "@scholarkit/editor/lib/account";
import { t } from "@scholarkit/i18n";
import {
  useChat,
  useChatEntries,
  type CursiveChat,
  type MenuAnchor,
  type Selection,
} from "@/lib/assistant/chat";
import {
  OUR_MODEL,
  providerById,
  sourceOf,
  type AssistantSettings,
} from "@/lib/assistant/providers";
import {
  authorsShort,
  type CursiveCard,
  type ReferenceChange,
} from "@/lib/assistant/tools";

/** Where the answers come from, as the bar and the usage line say it. */
export interface SourceInfo {
  label: string;
  usage: UsageSource | null;
  /** Why no question can be asked now; null when one can. */
  blocked: string | null;
}

export function sourceInfo(
  settings: AssistantSettings,
  account: boolean,
  usage: Usage | null,
  ownReady: boolean,
): SourceInfo {
  if (sourceOf(settings, account) === "own") {
    const provider = providerById(settings.provider);
    if (!ownReady || !provider)
      return {
        label: t("Set up a model"),
        usage: null,
        blocked: account
          ? t("Set up a model in Settings, or choose Scholarkit AI there, to ask.")
          : t("Set up a model in Settings to ask."),
      };
    return {
      label: settings.model || provider.name,
      usage: provider.needsKey
        ? { kind: "own-key", provider: provider.name }
        : { kind: "local", model: settings.model || provider.name },
      blocked: null,
    };
  }
  const plan = usage?.plan;
  if (plan === "free")
    return {
      label: OUR_MODEL,
      usage: null,
      blocked: t(
        "The assistant on our model comes with Plus. On Free, set up your own key or a model on your computer in Settings.",
      ),
    };
  return {
    label: OUR_MODEL,
    usage:
      (plan === "plus" || plan === "pro") && usage?.assistant
        ? { kind: "ours", plan, usedPercent: usage.assistant.usedPercent }
        : null,
    blocked: null,
  };
}

/** What the cards and the panels do in the project. */
export interface AssistantProps {
  chat: CursiveChat;
  /** The page open now, which the next question is about. */
  openPage: { path: string; title: string } | null;
  source: SourceInfo;
  /** Opens a checked quote's page, with the quote found in it. */
  onOpenQuote: (card: Extract<CursiveCard, { type: "quote" }>) => void;
  onSettings: () => void;
  /** Switches between the floating bar and the docked panel. */
  onLayout: (layout: "floating" | "docked") => void;
}

const FIELD_LABELS: Record<ReferenceChange["field"], () => string> = {
  title: () => t("Title"),
  author: () => t("Authors"),
  year: () => t("Year"),
  container: () => t("Published in"),
  volume: () => t("Volume"),
  issue: () => t("Issue"),
  pages: () => t("Pages"),
  doi: () => "DOI",
};

function CardView({
  card,
  props,
}: {
  card: CursiveCard;
  props: AssistantProps;
}): ReactNode {
  const { chat } = props;
  const state = card.state ?? "open";
  switch (card.type) {
    case "quote":
      return (
        <SourceQuote
          n={card.n}
          source={card.source}
          found
          quote={card.quote}
          onOpen={() => props.onOpenQuote(card)}
        />
      );
    case "edit":
      return (
        <>
          {card.explanation && <p className="assistant-note">{card.explanation}</p>}
          <DiffCard
            file={card.title}
            diff={lineDiff(card.before, card.after)}
            note={card.note ?? undefined}
            state={state}
            mono={false}
            onApply={() => void chat.accept(card)}
            onDiscard={() => chat.dismiss(card)}
          />
        </>
      );
    case "reference":
      return (
        <div className="assistant-card" data-state={state}>
          <div className="assistant-card-head">
            <span className="assistant-card-title">
              {t("The reference {key}", { key: card.key })}
            </span>
          </div>
          <dl className="assistant-props">
            {card.changes.map((change) => (
              <div key={change.field}>
                <dt>{FIELD_LABELS[change.field]()}</dt>
                <dd>
                  {change.after}
                  {change.before && (
                    <span className="assistant-muted">
                      {t("Now: {now}", { now: change.before })}
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <div className="assistant-card-foot">
            {state === "open" ? (
              <>
                <span className="assistant-muted assistant-grow">{card.note}</span>
                <AnswerActions
                  actions={[
                    { label: t("Dismiss"), onClick: () => chat.dismiss(card) },
                    {
                      label: t("Fix the reference"),
                      icon: "check",
                      primary: true,
                      onClick: () => void chat.accept(card),
                    },
                  ]}
                />
              </>
            ) : (
              <span className="assistant-muted assistant-grow">
                {state === "applied" ? t("Fixed.") : t("Dismissed.")}
              </span>
            )}
          </div>
        </div>
      );
    case "papers":
      return (
        <div className="assistant-papers">
          {card.papers.map((paper, i) => {
            const cited = card.cited?.includes(i);
            return (
              <div key={paper.openAlexId || paper.doi || i}>
                <PaperCard
                  title={paper.title}
                  meta={[authorsShort(paper.author), paper.container, paper.year]
                    .filter(Boolean)
                    .join(" · ")}
                  freePdf={paper.freePdf}
                  best={i === 0}
                  actions={
                    cited
                      ? []
                      : [
                          {
                            label: t("Cite"),
                            icon: "at-sign",
                            primary: i === 0,
                            onClick: () => void chat.accept(card, i),
                          },
                        ]
                  }
                />
                {(cited || card.notes?.[i]) && (
                  <p className="assistant-note" data-tone={cited ? undefined : "error"}>
                    {cited ? t("Cited, and added to the references.") : card.notes?.[i]}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      );
  }
}

/** The checked quote a citation names, in the conversation so far. */
function quoteOf(entries: Entry<CursiveCard>[], n: number) {
  for (const entry of entries) {
    if (entry.kind !== "assistant") continue;
    for (const card of entry.attachments)
      if (card.type === "quote" && card.n === n) return card;
  }
  return null;
}

function useRender(props: AssistantProps, entries: Entry<CursiveCard>[]) {
  const renderAttachment = (card: CursiveCard, _entry: AssistantEntry<CursiveCard>) => (
    <CardView card={card} props={props} />
  );
  const onCite = (n: number) => {
    const card = quoteOf(entries, n);
    if (card) props.onOpenQuote(card);
  };
  return { renderAttachment, onCite };
}

/** Puts the cursor in the bar or the composer when asked to. */
function useFocusRequests(chat: CursiveChat) {
  const input = useRef<HTMLTextAreaElement>(null);
  const { focusRequest } = useChat(chat);
  useEffect(() => {
    if (focusRequest > 0) input.current?.focus();
  }, [focusRequest]);
  return input;
}

/** The draft and sending it, shared by the bar and the composer. */
function useDraft(chat: CursiveChat) {
  const [draft, setDraft] = useState("");
  const send = () => {
    const text = draft.trim();
    if (!text || chat.working) return;
    setDraft("");
    void chat.ask(text);
  };
  return { draft, setDraft, send };
}

/** A selection in the page, with where to show the Ask menu; null without one. */
export type ReadSelection = () => { selection: Selection; anchor: MenuAnchor } | null;

/**
 * The Ask button next to the avatar. Cmd/Ctrl+J does the same, or opens
 * the Ask menu on a selection in the page.
 */
export function AskAssistantButton({
  chat,
  docked,
  readSelection,
}: {
  chat: CursiveChat;
  docked: boolean;
  readSelection: ReadSelection;
}) {
  const state = useChat(chat);
  const latest = useRef({ docked, readSelection });
  useEffect(() => {
    latest.current = { docked, readSelection };
  });
  useAskShortcut(() => {
    const selected = latest.current.readSelection();
    if (selected && !chat.state.menu) {
      chat.openMenu(selected.selection, selected.anchor);
      return;
    }
    chat.toggle(latest.current.docked);
  }, true);
  return (
    <AskButton
      on={docked ? state.dockShown : state.barOpen}
      onClick={() => chat.toggle(docked)}
    />
  );
}

/** The floating layout: the bar at the bottom of the page, the latest answer above it. */
export function AssistantFloatingLayer(props: AssistantProps) {
  const { chat, source } = props;
  const state = useChat(chat);
  const { entries, working } = useChatEntries(chat);
  const { draft, setDraft, send } = useDraft(chat);
  const input = useFocusRequests(chat);
  const { renderAttachment, onCite } = useRender(props, entries);
  if (!state.barOpen) return null;
  return (
    <div
      onKeyDown={(e) => {
        // Escape closes the answer first, then the bar.
        if (e.key === "Escape" && !chat.state.sheetOpen) {
          e.preventDefault();
          chat.hide();
        }
      }}
    >
      <AssistantFloating
        entries={entries}
        open={state.sheetOpen}
        onClose={() => chat.setSheetOpen(false)}
        onDock={() => {
          chat.hide();
          props.onLayout("docked");
          chat.show(true);
        }}
        renderAttachment={renderAttachment}
        onCite={onCite}
        bar={
          <AskBar
            value={draft}
            onChange={setDraft}
            onSend={send}
            onStop={() => chat.stop()}
            working={working}
            placeholder={source.blocked ?? t("Ask about your writing")}
            chips={chat.chips(props.openPage)}
            onRemoveChip={(id) => chat.removeChip(id)}
            model={source.label}
            onPickModel={props.onSettings}
            disabled={source.blocked !== null}
            inputRef={input}
          />
        }
      />
    </div>
  );
}

const SUGGESTIONS = (papers: boolean) => [
  t("How can this page read more clearly?"),
  ...(papers ? [t("Which claims on this page need a source?")] : []),
  t("Summarize this page in three sentences."),
];

/** The docked layout: the whole conversation in a panel on the right. */
export function AssistantDock(props: AssistantProps & { papers: boolean }) {
  const { chat, source } = props;
  const state = useChat(chat);
  const { entries, working } = useChatEntries(chat);
  const { draft, setDraft, send } = useDraft(chat);
  const input = useFocusRequests(chat);
  const { renderAttachment, onCite } = useRender(props, entries);
  useEffect(() => {
    if (chat.state.usage === null) void chat.refreshUsage();
  }, [chat]);
  if (!state.dockShown) return null;
  return (
    <aside className="assistant-dock">
      <AssistantPanel
        onClose={() => chat.hide()}
        onNew={() => chat.clear()}
        onFloat={() => {
          chat.hide();
          props.onLayout("floating");
          chat.show(false);
        }}
        composer={
          <Composer
            value={draft}
            onChange={setDraft}
            onSend={send}
            onStop={() => chat.stop()}
            working={working}
            placeholder={t("Ask about your writing")}
            chips={chat.chips(props.openPage)}
            onRemoveChip={(id) => chat.removeChip(id)}
            model={source.label}
            onPickModel={props.onSettings}
            disabled={source.blocked !== null}
            inputRef={input}
          />
        }
        footer={source.usage && <UsageLine source={source.usage} />}
      >
        <ConversationView
          entries={entries}
          renderAttachment={renderAttachment}
          onCite={onCite}
          empty={
            <EmptyState
              title={t("Ask about your writing")}
              text={
                source.blocked ??
                t(
                  "The assistant rewrites, finds sources to cite and checks your references. Every change is a card you apply, or not.",
                )
              }
            >
              {source.blocked === null && props.openPage && (
                <Suggestions
                  items={SUGGESTIONS(props.papers).map((label) => ({
                    label,
                    onPick: () => void chat.ask(label),
                  }))}
                />
              )}
            </EmptyState>
          }
        />
      </AssistantPanel>
    </aside>
  );
}

const ICON = "size-3.5";

function menuGroups(papers: boolean, lookUp: boolean): MenuGroup[] {
  return [
    {
      label: t("Rewrite"),
      items: [
        {
          id: t(
            "Make the selection shorter, and keep what it says. Propose it as a change.",
          ),
          label: t("Make it shorter"),
          icon: <Minimize2 className={ICON} />,
        },
        {
          id: t(
            "Make the selection clearer, and keep what it says. Propose it as a change.",
          ),
          label: t("Make it clearer"),
          icon: <Eraser className={ICON} />,
        },
        {
          id: t(
            "Fix the spelling and grammar of the selection. Propose it as a change.",
          ),
          label: t("Fix spelling and grammar"),
          icon: <SpellCheck className={ICON} />,
        },
        {
          id: t("Translate the selection into English. Propose it as a change."),
          label: t("Translate into English"),
          icon: <Languages className={ICON} />,
        },
      ],
    },
    {
      label: t("Sources"),
      items: [
        ...(papers
          ? [
              {
                id: t("Find papers that back what the selection says, for me to cite."),
                label: t("Find a source to cite"),
                icon: <Search className={ICON} />,
              },
            ]
          : []),
        ...(lookUp
          ? [
              {
                id: t("Check the references the selection cites."),
                label: t("Check its references"),
                icon: <ListChecks className={ICON} />,
              },
            ]
          : []),
        {
          id: t("What do my other pages say about this?"),
          label: t("Compare with my other pages"),
          icon: <BookOpenText className={ICON} />,
        },
      ],
    },
  ];
}

/** The Ask menu under a selection in the page. */
export function AssistantMenuLayer({
  chat,
  docked,
  papers,
  lookUp,
  onAsked,
}: {
  chat: CursiveChat;
  docked: boolean;
  papers: boolean;
  lookUp: boolean;
  /** The question went: the page lets go of the selection. */
  onAsked: () => void;
}) {
  const { menu } = useChat(chat);
  if (menu === null) return null;
  const ask = (text: string) => {
    chat.closeMenu(true);
    onAsked();
    chat.show(docked);
    void chat.ask(text);
  };
  // Kept on screen: the menu is 384px wide and about 340px tall.
  const left = Math.max(8, Math.min(menu.left, window.innerWidth - 392));
  const top = Math.min(menu.top, window.innerHeight - 360);
  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onMouseDown={() => chat.closeMenu()} />
      <div className="fixed z-50" style={{ left, top }}>
        <SelectionMenu
          groups={menuGroups(papers, lookUp)}
          placeholder={t("Ask about the selection…")}
          onPick={ask}
          onAsk={ask}
          onClose={() => chat.closeMenu()}
        />
      </div>
    </>,
    document.body,
  );
}
