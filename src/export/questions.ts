import {
  readBlanks,
  readExercise,
  readQuiz,
  splitBlanks,
} from "@scholarkit/editor/tutorial/blocks";
import type { ExportJob } from "./job";

/**
 * The tutorial blocks a course export turns into questions, apart from
 * the cartridge itself so the Export dialog can count them without
 * loading it.
 */

/** A question as the cartridge writes it. */
export type Question =
  | {
      kind: "choice";
      text: string;
      options: string[];
      /** The correct options, counted from 0. More than one: tick boxes. */
      answer: number[];
      points: number;
      attempts: number;
      feedback: string;
    }
  | { kind: "blank"; text: string; answers: string[]; points: number }
  | { kind: "essay"; html: string; points: number; feedback: string };

/**
 * A tutorial block as a question, or null when it stays on the page.
 * `html` is the exercise's prompt as the page draws it.
 */
export function questionOf(kind: string, source: string, html = ""): Question | null {
  if (kind === "quiz") {
    const quiz = readQuiz(source);
    if (!quiz) return null;
    const kept = quiz.options
      .map((option, index) => ({
        option: option.trim(),
        correct: quiz.answer.includes(index + 1),
      }))
      .filter((entry) => entry.option);
    const answer = kept.flatMap((entry, index) => (entry.correct ? [index] : []));
    if (!quiz.question.trim() || kept.length < 2 || answer.length === 0) return null;
    return {
      kind: "choice",
      text: quiz.question.trim(),
      options: kept.map((entry) => entry.option),
      answer,
      points: quiz.points || 1,
      attempts: quiz.attempts,
      feedback: quiz.explanation.trim(),
    };
  }
  if (kind === "blanks") {
    const blanks = readBlanks(source);
    if (!blanks) return null;
    const { parts, gaps } = splitBlanks(blanks.text);
    if (gaps.length !== 1) return null;
    const rest = blanks.text.slice(blanks.text.lastIndexOf("}}") + 2);
    return {
      kind: "blank",
      text: `${parts[0]}_____${rest}`.trim(),
      answers: gaps[0].answers,
      points: 1,
    };
  }
  if (kind === "exercise") {
    const exercise = readExercise(source);
    if (!exercise?.prompt.trim()) return null;
    return {
      kind: "essay",
      html: html.trim() || `<p>${escape(exercise.prompt.trim())}</p>`,
      points: 1,
      feedback: exercise.answer.trim(),
    };
  }
  return null;
}

/** Text in XML and HTML, with the marks that end it escaped. */
export const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (ch) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot", "'": "apos" }[ch]};`,
  );

/** How many of each block an export holds, for the dialog to say what comes along. */
export interface CourseSummary {
  pages: number;
  questions: number;
  /** Tutorial blocks with answers that stay on their page: put in order, several blanks, assignments. */
  onPage: number;
}

const FENCE =
  /^ {0,3}(`{3,}|~{3,})\s*(quiz|blanks|exercise|order|assignment)\s*\n([\s\S]*?)\n {0,3}\1\s*$/gm;

/** What a course export of a job holds, read from its Markdown. */
export function courseSummary(job: ExportJob): CourseSummary {
  const out: CourseSummary = { pages: job.parts.length, questions: 0, onPage: 0 };
  for (const part of job.parts) {
    const markdown =
      part.kind === "page"
        ? part.markdown
        : part.slides.map((slide) => slide.body).join("\n\n");
    for (const match of markdown.matchAll(FENCE)) {
      const kind = match[2];
      if (questionOf(kind, match[3])) out.questions++;
      else if (kind !== "quiz" && kind !== "exercise") out.onPage++;
    }
  }
  return out;
}
