import { useSyncExternalStore } from "react";
import {
  AssistantError,
  Conversation,
  type ContextChipData,
  type Entry,
  type SendTurn,
} from "@scholarkit/assistant";
import type { Usage } from "@scholarkit/editor/lib/account";
import type { FoundPaper } from "@scholarkit/editor/references/lookup";
import { t } from "@scholarkit/i18n";
import {
  cursiveKit,
  describeStart,
  newNumbering,
  systemPrompt,
  userMessage,
  type CursiveCard,
  type CursiveHost,
} from "./tools";

/**
 * The assistant's conversation in Cursive, run by the shared
 * `Conversation` of @scholarkit/assistant with Cursive's tools, and what
 * the panel around it shows: the floating bar or the docked panel, the
 * open page and a selection the next question is about, the month used on
 * our model. One per open project; it starts over with the next.
 */

/** What the cards do once accepted, and where the answers come from. */
export interface ChatHost extends CursiveHost {
  /** The model that answers now; null when none can. */
  send(): SendTurn | null;
  /** Whether answers come from our model, which counts the month's use. */
  ours(): boolean;
  /** The page open now, for the question to be about. */
  openPage(): { path: string; title: string } | null;
  /** Makes a card's change in its page. Rejects with what went wrong. */
  applyEdit(card: Extract<CursiveCard, { type: "edit" }>): Promise<void>;
  /** Puts a card's fixed reference in its page's reference list. */
  fixReference(card: Extract<CursiveCard, { type: "reference" }>): Promise<void>;
  /** Cites a paper in the open page, after the selection or at the caret. */
  cite(paper: FoundPaper, selection: Selection | null): Promise<void>;
  usage?(): Promise<Usage | null>;
}

/** A selection in the open page, for the next question. */
export interface Selection {
  path: string;
  text: string;
  /** Where it is in the editor, to cite after it. */
  from: number;
  to: number;
}

/** Where the Ask menu opens, in window coordinates. */
export interface MenuAnchor {
  left: number;
  top: number;
}

export interface ChatState {
  /** The floating bar shows (in the floating layout). */
  barOpen: boolean;
  /** The latest answer shows above the bar. */
  sheetOpen: boolean;
  /** The docked panel shows (in the docked layout). */
  dockShown: boolean;
  /** Whether the next question is about the open page; the chip's ×. */
  aboutPage: boolean;
  selection: Selection | null;
  /** The selection the last question was about: papers are cited after it. */
  asked: Selection | null;
  /** The Ask menu on a selection, while open. */
  menu: MenuAnchor | null;
  usage: Usage | null;
  /** Bumped to put the cursor in the bar or the composer. */
  focusRequest: number;
}

const INITIAL: ChatState = {
  barOpen: false,
  sheetOpen: false,
  dockShown: false,
  aboutPage: true,
  selection: null,
  asked: null,
  menu: null,
  usage: null,
  focusRequest: 0,
};

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** At most this much of a selection goes with the question, in characters. */
const SELECTION_ROOM = 2400;

export class CursiveChat {
  state: ChatState = INITIAL;
  readonly conversation: Conversation<CursiveCard>;
  private numbers = newNumbering();
  /** Outcomes of cards since the last question, told to the model with the next one. */
  private notes: string[] = [];
  private listeners = new Set<() => void>();

  /** The app's side, set after each render: always the latest one. */
  private current: ChatHost | null = null;

  /** `features` says which of the tools that need an account to offer. */
  constructor(private features: { papers: boolean; lookUp: boolean }) {
    this.conversation = new Conversation<CursiveCard>(this.options());
  }

  /** Hands the chat the app as it is now. */
  setHost(host: ChatHost) {
    this.current = host;
  }

  private host(): ChatHost {
    if (!this.current) throw new Error("The assistant isn't ready yet.");
    return this.current;
  }

  private options() {
    const send: SendTurn = (messages, tools, onText, signal) => {
      const model = this.host().send();
      if (!model)
        return Promise.reject(
          new AssistantError("provider", t("Set up the assistant in Settings to ask.")),
        );
      return model(messages, tools, onText, signal);
    };
    return {
      send,
      kit: cursiveKit(this.proxy(), this.numbers),
      system: () => systemPrompt(this.features.papers),
      describeStart,
    };
  }

  /** The host as the tools reach it: always the latest one. */
  private proxy(): CursiveHost {
    const latest = () => this.host();
    const { papers, lookUp } = this.features;
    return {
      pages: () => latest().pages(),
      searchPapers: papers ? (q) => latest().searchPapers!(q) : undefined,
      lookUp: lookUp ? (kind, id) => latest().lookUp!(kind, id) : undefined,
    };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    const off = this.conversation.subscribe(listener);
    return () => {
      this.listeners.delete(listener);
      off();
    };
  };

  getState = () => this.state;

  private set(change: Partial<ChatState>) {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener();
  }

  get working(): boolean {
    return this.conversation.working;
  }

  /** The chips above the question: the open page, a selection. */
  chips(page: { title: string } | null): ContextChipData[] {
    const { selection, aboutPage } = this.state;
    if (selection)
      return [{ id: "selection", label: t("Selection"), icon: "text-select" }];
    if (page && aboutPage)
      return [{ id: "page", label: page.title || t("Untitled"), icon: "file-text" }];
    return [];
  }

  removeChip(id: string) {
    if (id === "selection") this.set({ selection: null });
    else this.set({ aboutPage: false });
  }

  async ask(text: string): Promise<void> {
    const question = text.trim();
    if (!question || this.conversation.working) return;
    const host = this.host();
    const selection = this.state.selection;
    const page = selection || this.state.aboutPage ? host.openPage() : null;
    const chips = this.chips(host.openPage());
    const forModel =
      (this.notes.length ? `${this.notes.join(" ")}\n\n` : "") +
      userMessage(question, {
        page,
        selection: selection
          ? selection.text.length > SELECTION_ROOM
            ? `${selection.text.slice(0, SELECTION_ROOM)}…`
            : selection.text
          : null,
      });
    this.notes = [];
    this.set({ selection: null, asked: selection, menu: null, sheetOpen: true });
    const outcome = await this.conversation.ask({ text: question, forModel, chips });
    if (outcome !== "failed" && host.ours()) void this.refreshUsage();
  }

  stop() {
    this.conversation.stop();
  }

  /** Starts over: a new conversation, the cursor in the bar. */
  clear() {
    this.conversation.reset();
    this.numbers.quotes = [];
    this.numbers.cards = 0;
    this.notes = [];
    this.set({ sheetOpen: false, selection: null, asked: null, aboutPage: true });
    this.focus();
  }

  focus() {
    this.set({ focusRequest: this.state.focusRequest + 1 });
  }

  /** Shows the assistant in the layout chosen, with the cursor in it. */
  show(docked: boolean) {
    if (docked) this.set({ dockShown: true });
    else this.set({ barOpen: true, sheetOpen: this.conversation.entries.length > 0 });
    this.focus();
    if (this.state.usage === null) void this.refreshUsage();
  }

  hide() {
    this.set({ barOpen: false, sheetOpen: false, dockShown: false });
  }

  toggle(docked: boolean) {
    const shown = docked ? this.state.dockShown : this.state.barOpen;
    if (shown) this.hide();
    else this.show(docked);
  }

  setSheetOpen(open: boolean) {
    this.set({ sheetOpen: open });
  }

  /** The Ask menu on a selection in the page. */
  openMenu(selection: Selection, anchor: MenuAnchor) {
    this.set({ selection, menu: anchor });
  }

  closeMenu(keepSelection = false) {
    this.set({ menu: null, ...(keepSelection ? {} : { selection: null }) });
  }

  async refreshUsage() {
    const usage = this.host().usage;
    if (!usage) return;
    try {
      this.set({ usage: await usage() });
    } catch {
      // Signed out or offline: the usage line stays away.
      this.set({ usage: null });
    }
  }

  /** Accepts a card: does what it proposes, and tells the model with the next question. */
  async accept(card: CursiveCard, which?: number) {
    if ((card.state ?? "open") !== "open" && card.type !== "papers") return;
    const host = this.host();
    try {
      switch (card.type) {
        case "edit":
          await host.applyEdit(card);
          this.notes.push(`The user applied card ${card.id}.`);
          break;
        case "reference":
          await host.fixReference(card);
          this.notes.push(`The user fixed the reference of card ${card.id}.`);
          break;
        case "papers": {
          if (which === undefined || card.cited?.includes(which)) return;
          const paper = card.papers[which];
          try {
            await host.cite(paper, this.state.asked);
          } catch (error) {
            this.conversation.update(card, {
              ...card,
              notes: { ...card.notes, [which]: messageOf(error) },
            });
            return;
          }
          this.conversation.update(card, {
            ...card,
            cited: [...(card.cited ?? []), which],
          });
          this.notes.push(`The user cited "${paper.title}" from card ${card.id}.`);
          return;
        }
        case "quote":
          return;
      }
    } catch (error) {
      this.conversation.update(card, { ...card, note: messageOf(error) });
      return;
    }
    this.conversation.update(card, { ...card, state: "applied", note: null });
    this.focus();
  }

  dismiss(card: CursiveCard) {
    if ((card.state ?? "open") !== "open" || card.type === "quote") return;
    this.conversation.update(card, { ...card, state: "discarded", note: null });
    this.notes.push(`The user discarded card ${card.id}.`);
    this.focus();
  }
}

/** The chat's state, for components. */
export function useChat(chat: CursiveChat): ChatState {
  return useSyncExternalStore(chat.subscribe, chat.getState);
}

/** The conversation's entries and whether it is working, for components. */
export function useChatEntries(chat: CursiveChat): {
  entries: Entry<CursiveCard>[];
  working: boolean;
} {
  const entries = useSyncExternalStore(chat.subscribe, () => chat.conversation.entries);
  return { entries, working: chat.conversation.working };
}
