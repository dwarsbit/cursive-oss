import type { ReactNodeViewProps } from "@tiptap/react";
import {
  ArrowDown,
  ArrowUp,
  BookA,
  Columns2,
  Layers,
  ListOrdered,
  PenLine,
  Play,
  Plus,
  Target,
  TextCursorInput,
  X,
} from "lucide-react";
import { useRef } from "react";
import {
  readBlanks,
  readCompare,
  readExercise,
  readFlashcards,
  readGoals,
  readOrder,
  readTerms,
  readVideo,
  splitBlanks,
  videoSource,
  writeBlanks,
  writeCompare,
  writeExercise,
  writeFlashcards,
  writeGoals,
  writeOrder,
  writeTerms,
  writeVideo,
} from "../tutorial/blocks";
import { Frame } from "./TutorialViews";
import { t, tn } from "@scholarkit/i18n";

/** The block's YAML as its fields, and a way to change some of them. */
function useBlock<T>(
  { node, updateAttributes }: ReactNodeViewProps,
  read: (source: string) => T | null,
  write: (block: T, previous: string) => string,
  empty: T,
): [T, (change: Partial<T>) => void] {
  const source = node.attrs.source as string;
  const block = read(source) ?? empty;
  return [
    block,
    (change) => updateAttributes({ source: write({ ...block, ...change }, source) }),
  ];
}

/** What one row of a list is, for its buttons. */
type RowNoun = "goal" | "term" | "item" | "card";

/** The buttons' labels for a row, as whole sentences: other languages inflect the noun. */
function rowLabels(noun: RowNoun, number: number) {
  switch (noun) {
    case "goal":
      return {
        add: t("Add goal"),
        remove: t("Remove goal"),
        removeAt: t("Remove goal {number}", { number }),
        up: "",
        down: "",
      };
    case "term":
      return {
        add: t("Add term"),
        remove: t("Remove term"),
        removeAt: t("Remove term {number}", { number }),
        up: "",
        down: "",
      };
    case "item":
      return {
        add: t("Add item"),
        remove: t("Remove item"),
        removeAt: t("Remove item {number}", { number }),
        up: t("Move item {number} up", { number }),
        down: t("Move item {number} down", { number }),
      };
    case "card":
      return {
        add: t("Add card"),
        remove: t("Remove card"),
        removeAt: t("Remove card {number}", { number }),
        up: "",
        down: "",
      };
  }
}

/** Rows a reader adds to, removes from and, where the order matters, moves. */
function Rows<T>({
  rows,
  blank,
  noun,
  ordered = false,
  min = 1,
  onChange,
  children,
}: {
  rows: T[];
  blank: T;
  /** What one row is, for the buttons. */
  noun: RowNoun;
  ordered?: boolean;
  min?: number;
  onChange: (rows: T[]) => void;
  /** The row's fields. The one marked `data-first` takes the caret in a new row. */
  children: (
    row: T,
    set: (row: T) => void,
    index: number,
    add: (from: Element) => void,
  ) => React.ReactNode;
}) {
  /** Adds a row and puts the caret in it. `from` is the control that asked for it. */
  const add = (from: Element) => {
    onChange([...rows, blank]);
    requestAnimationFrame(() => {
      const fields = from
        .closest(".tb-rows")
        ?.querySelectorAll<HTMLElement>("[data-first]");
      fields?.[fields.length - 1]?.focus();
    });
  };
  const move = (index: number, by: number) => {
    const next = [...rows];
    const [row] = next.splice(index, 1);
    next.splice(index + by, 0, row);
    onChange(next);
  };
  return (
    <div className="tb-rows">
      <div className="tb-list">
        {rows.map((row, index) => (
          <div key={index} className="tb-list-row">
            {ordered && <span className="tb-index">{index + 1}</span>}
            {children(
              row,
              (changed) => onChange(rows.map((r, i) => (i === index ? changed : r))),
              index,
              add,
            )}
            {ordered && (
              <>
                <button
                  type="button"
                  className="tb-remove"
                  aria-label={rowLabels(noun, index + 1).up}
                  title={t("Move up")}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp aria-hidden />
                </button>
                <button
                  type="button"
                  className="tb-remove"
                  aria-label={rowLabels(noun, index + 1).down}
                  title={t("Move down")}
                  disabled={index === rows.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown aria-hidden />
                </button>
              </>
            )}
            <button
              type="button"
              className="tb-remove"
              aria-label={rowLabels(noun, index + 1).removeAt}
              title={rowLabels(noun, index + 1).remove}
              disabled={rows.length <= min}
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
            >
              <X aria-hidden />
            </button>
          </div>
        ))}
      </div>
      <div className="tb-row">
        <button
          type="button"
          className="tb-button"
          onClick={(event) => add(event.currentTarget)}
        >
          <Plus aria-hidden />
          {rowLabels(noun, rows.length + 1).add}
        </button>
      </div>
    </div>
  );
}

/** Enter in a one-line field starts the next row. */
const onEnter = (add: (from: Element) => void) => (event: React.KeyboardEvent) => {
  if (event.key === "Enter") {
    event.preventDefault();
    add(event.currentTarget);
  }
};

export function GoalsView(props: ReactNodeViewProps) {
  const [goals, set] = useBlock(props, readGoals, writeGoals, { items: [""] });
  return (
    <Frame
      icon={<Target aria-hidden />}
      kind={t("Learning goals")}
      note={t("What a learner can do after this page")}
      chip={tn(goals.items.length, "{count} goal", "{count} goals")}
      selected={props.selected}
    >
      <Rows
        rows={goals.items}
        blank=""
        noun="goal"
        onChange={(items) => set({ items })}
      >
        {(item, change, index, add) => (
          <input
            data-first
            className="tb-input tb-grow"
            value={item}
            placeholder={t("Goal {number}", { number: index + 1 })}
            aria-label={t("Goal {number}", { number: index + 1 })}
            onChange={(event) => change(event.target.value)}
            onKeyDown={onEnter(add)}
          />
        )}
      </Rows>
    </Frame>
  );
}

export function TermsView(props: ReactNodeViewProps) {
  const [terms, set] = useBlock(props, readTerms, writeTerms, {
    terms: [{ term: "", definition: "" }],
  });
  return (
    <Frame
      icon={<BookA aria-hidden />}
      kind={t("Key terms")}
      note={t("The published page also explains them where its text uses them")}
      chip={tn(terms.terms.length, "{count} term", "{count} terms")}
      selected={props.selected}
    >
      <Rows
        rows={terms.terms}
        blank={{ term: "", definition: "" }}
        noun="term"
        onChange={(rows) => set({ terms: rows })}
      >
        {(row, change, index, add) => (
          <>
            <input
              data-first
              className="tb-input tb-term"
              value={row.term}
              placeholder={t("Term")}
              aria-label={t("Term {number}", { number: index + 1 })}
              onChange={(event) => change({ ...row, term: event.target.value })}
            />
            <input
              className="tb-input tb-grow"
              value={row.definition}
              placeholder={t("Definition")}
              aria-label={t("Definition of term {number}", { number: index + 1 })}
              onChange={(event) => change({ ...row, definition: event.target.value })}
              onKeyDown={onEnter(add)}
            />
          </>
        )}
      </Rows>
    </Frame>
  );
}

const VIDEO_HOST = {
  youtube: "YouTube",
  vimeo: "Vimeo",
  file: t("Video file"),
} as const;

export function VideoView(props: ReactNodeViewProps) {
  const [video, set] = useBlock(props, readVideo, writeVideo, { url: "", title: "" });
  const source = videoSource(video.url);
  return (
    <Frame
      icon={<Play aria-hidden />}
      kind={t("Video")}
      note={t("Plays on the published page")}
      chip={source ? VIDEO_HOST[source.kind] : t("No video yet")}
      selected={props.selected}
    >
      <input
        className="tb-input tb-text"
        type="url"
        value={video.url}
        placeholder={t("Link to a YouTube or Vimeo video, or to a video file")}
        aria-label={t("Link to the video")}
        onChange={(event) => set({ url: event.target.value })}
      />
      <input
        className="tb-input tb-text"
        value={video.title}
        placeholder={t("Title (optional)")}
        aria-label={t("Title")}
        onChange={(event) => set({ title: event.target.value })}
      />
      {video.url.trim() !== "" && !source && (
        <p className="tb-warning" role="status">
          {t(
            "This link is not a video Cursive can show. Use a YouTube or Vimeo link, or an https link to an .mp4 or .webm file.",
          )}
        </p>
      )}
    </Frame>
  );
}

export function CompareView(props: ReactNodeViewProps) {
  const [compare, set] = useBlock(props, readCompare, writeCompare, {
    before: "",
    after: "",
  });
  return (
    <Frame
      icon={<Columns2 aria-hidden />}
      kind={t("Before and after")}
      note={t("A weak version next to a better one")}
      chip="Markdown"
      selected={props.selected}
    >
      <div className="tb-pair">
        <label className="tb-side tb-before">
          <span className="tb-label">{t("Before")}</span>
          <textarea
            className="tb-input tb-text"
            rows={3}
            value={compare.before}
            placeholder={t("The version to improve")}
            onChange={(event) => set({ before: event.target.value })}
          />
        </label>
        <label className="tb-side tb-after">
          <span className="tb-label">{t("After")}</span>
          <textarea
            className="tb-input tb-text"
            rows={3}
            value={compare.after}
            placeholder={t("The better version")}
            onChange={(event) => set({ after: event.target.value })}
          />
        </label>
      </div>
    </Frame>
  );
}

export function BlanksView(props: ReactNodeViewProps) {
  const [blanks, set] = useBlock(props, readBlanks, writeBlanks, { id: "", text: "" });
  const area = useRef<HTMLTextAreaElement>(null);
  const gaps = splitBlanks(blanks.text).gaps.length;
  const makeGap = () => {
    const field = area.current;
    if (!field) return;
    const { selectionStart: from, selectionEnd: to, value } = field;
    const word = value.slice(from, to).trim() || "answer";
    set({ text: `${value.slice(0, from)}{{${word}}}${value.slice(to)}` });
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(from + 2, from + 2 + word.length);
    });
  };
  return (
    <Frame
      icon={<TextCursorInput aria-hidden />}
      kind={t("Fill in the blanks")}
      note={t("Learners type the missing words")}
      chip={tn(gaps, "{count} blank", "{count} blanks")}
      selected={props.selected}
    >
      <textarea
        ref={area}
        className="tb-input tb-text"
        rows={3}
        value={blanks.text}
        placeholder={t(
          "A question that pushes toward one answer is called a {{leading}} question.",
        )}
        aria-label={t("Text with blanks")}
        onChange={(event) => set({ text: event.target.value })}
      />
      <div className="tb-row">
        <button type="button" className="tb-button" onClick={makeGap}>
          <Plus aria-hidden />
          {t("Make the selection a blank")}
        </button>
        <span className="tb-hint">
          {t(
            "A blank is written {{answer}}. {{pilot|pilot study}} takes either answer. Capitals don't count.",
          )}
        </span>
      </div>
      {blanks.text.trim() !== "" && gaps === 0 && (
        <p className="tb-warning" role="status">
          {t("Add at least one blank.")}
        </p>
      )}
    </Frame>
  );
}

export function OrderView(props: ReactNodeViewProps) {
  const [order, set] = useBlock(props, readOrder, writeOrder, {
    id: "",
    prompt: "",
    items: ["", ""],
  });
  return (
    <Frame
      icon={<ListOrdered aria-hidden />}
      kind={t("Put in order")}
      note={t("Write the items in the correct order. Learners get them shuffled.")}
      chip={tn(order.items.length, "{count} item", "{count} items")}
      selected={props.selected}
    >
      <input
        className="tb-input tb-question"
        value={order.prompt}
        placeholder={t("Question, such as: Put the steps of a pilot in order")}
        aria-label={t("Question")}
        onChange={(event) => set({ prompt: event.target.value })}
      />
      <Rows
        rows={order.items}
        blank=""
        noun="item"
        ordered
        min={2}
        onChange={(items) => set({ items })}
      >
        {(item, change, index, add) => (
          <input
            data-first
            className="tb-input tb-grow"
            value={item}
            placeholder={t("Item {number}", { number: index + 1 })}
            aria-label={t("Item {number}", { number: index + 1 })}
            onChange={(event) => change(event.target.value)}
            onKeyDown={onEnter(add)}
          />
        )}
      </Rows>
    </Frame>
  );
}

export function ExerciseView(props: ReactNodeViewProps) {
  const [exercise, set] = useBlock(props, readExercise, writeExercise, {
    id: "",
    prompt: "",
    hint: "",
    answer: "",
  });
  return (
    <Frame
      icon={<PenLine aria-hidden />}
      kind={t("Exercise")}
      note={t("Learners write an answer and compare it with yours")}
      chip={t("Not graded")}
      selected={props.selected}
    >
      <textarea
        className="tb-input tb-text"
        rows={3}
        value={exercise.prompt}
        placeholder={t("What should learners do? You can write Markdown here.")}
        aria-label={t("Exercise")}
        onChange={(event) => set({ prompt: event.target.value })}
      />
      <label className="tb-side">
        <span className="tb-label">{t("Hint")}</span>
        <textarea
          className="tb-input tb-text"
          rows={2}
          value={exercise.hint}
          placeholder={t("Shown when a learner asks for it (optional)")}
          onChange={(event) => set({ hint: event.target.value })}
        />
      </label>
      <label className="tb-side">
        <span className="tb-label">{t("Model answer")}</span>
        <textarea
          className="tb-input tb-text"
          rows={2}
          value={exercise.answer}
          placeholder={t("Shown when a learner asks for it (optional)")}
          onChange={(event) => set({ answer: event.target.value })}
        />
      </label>
    </Frame>
  );
}

export function FlashcardsView(props: ReactNodeViewProps) {
  const [flashcards, set] = useBlock(props, readFlashcards, writeFlashcards, {
    cards: [{ front: "", back: "" }],
  });
  return (
    <Frame
      icon={<Layers aria-hidden />}
      kind={t("Flashcards")}
      note={t("Learners click a card to turn it")}
      chip={tn(flashcards.cards.length, "{count} card", "{count} cards")}
      selected={props.selected}
    >
      <Rows
        rows={flashcards.cards}
        blank={{ front: "", back: "" }}
        noun="card"
        onChange={(cards) => set({ cards })}
      >
        {(card, change, index, add) => (
          <>
            <input
              data-first
              className="tb-input tb-term"
              value={card.front}
              placeholder={t("Front")}
              aria-label={t("Front of card {number}", { number: index + 1 })}
              onChange={(event) => change({ ...card, front: event.target.value })}
            />
            <input
              className="tb-input tb-grow"
              value={card.back}
              placeholder={t("Back")}
              aria-label={t("Back of card {number}", { number: index + 1 })}
              onChange={(event) => change({ ...card, back: event.target.value })}
              onKeyDown={onEnter(add)}
            />
          </>
        )}
      </Rows>
    </Frame>
  );
}
