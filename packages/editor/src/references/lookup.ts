import {
  emptyReference,
  suggestKey,
  type Reference,
  type ReferenceType,
} from "./reference";
import { t } from "@scholarkit/i18n";

/**
 * A work found by its DOI, its ISBN, its arXiv ID or its PubMed ID,
 * for a work that is in no library yet. Typing `@10.1038/nature14539`,
 * `@978-0-201-13447-6`, `@arXiv:1706.03762` or `@PMID:31452104` in the
 * text looks it up.
 *
 * The Scholarkit server does the looking up (GET /api/lookup/work, in
 * apps/api/src/lookup.ts): it asks Crossref, DataCite, Open Library or
 * PubMed. The apps never ask those services themselves, so a lookup
 * needs the account: each app hands its server to setWorkLookup.
 */

export type Lookup =
  | { kind: "doi"; id: string }
  | { kind: "isbn"; id: string }
  /** `1706.03762`, or an older one like `hep-th/9901001`, without its version. */
  | { kind: "arxiv"; id: string }
  /** A PubMed ID, `31452104`, or a PubMed Central one, `PMC6744368`. */
  | { kind: "pubmed"; id: string };

export type LookupKind = Lookup["kind"];

/** A work as the server's lookup answers it (`lookedUpWork` in @scholarkit/contracts). */
export interface LookedUpWork {
  type: ReferenceType;
  author: string[];
  editor: string[];
  title: string;
  year: string;
  container: string;
  publisher: string;
  place: string;
  volume: string;
  issue: string;
  pages: string;
  doi: string;
  url: string;
  isbn: string;
  arxiv: string;
  pmid: string;
}

/**
 * A paper a search found (`foundPaper` in @scholarkit/contracts): the
 * work, OpenAlex's ID for it, and whether a free PDF of it is known.
 */
export type FoundPaper = LookedUpWork & {
  openAlexId: string;
  freePdf: boolean;
  /** False when the search gave only the title, authors and DOI (Plus). */
  detailed: boolean;
};

/** What a paper search answers: the papers, best first. */
export interface PaperSearch {
  works: FoundPaper[];
}

/** A work as a lookup found it: a reference, with the IDs a reference doesn't keep. */
export type FoundWork = Reference & { isbn: string; arxiv: string; pmid: string };

/** Asks the server for a work; null when there is none. */
export type WorkLookup = (
  kind: LookupKind | "openalex",
  id: string,
) => Promise<LookedUpWork | null>;

let workLookup: WorkLookup | null = null;

/** Where lookups go: the app's Scholarkit server. Without it, a lookup asks to sign in. */
export function setWorkLookup(lookup: WorkLookup | null) {
  workLookup = lookup;
}

/**
 * An arXiv ID, bare or after `arXiv:`, or an arxiv.org address. New IDs
 * are `YYMM.NNNNN`, older ones name the archive: `math.GT/0309136`.
 */
const ARXIV =
  /^(?:arxiv:\s*|(?:https?:\/\/)?(?:www\.|export\.)?arxiv\.org\/(?:abs|pdf|html)\/)?(\d{2}(?:0[1-9]|1[0-2])\.\d{4,5}|[a-z]+(?:-[a-z]+)?(?:\.[a-z]{2})?\/\d{7})(?:v\d+)?(?:\.pdf)?\/?$/i;

/** A PubMed ID after `PMID`, or a PubMed address; never a bare number. */
const PUBMED =
  /^(?:pmid:?\s*|(?:https?:\/\/)?(?:www\.)?(?:pubmed\.ncbi\.nlm\.nih\.gov|ncbi\.nlm\.nih\.gov\/pubmed)\/)(\d{1,9})\/?$/i;

/** A PubMed Central ID, bare or as an address. */
const PMC =
  /^(?:pmcid:?\s*|(?:https?:\/\/)?(?:www\.)?(?:ncbi\.nlm\.nih\.gov\/pmc|pmc\.ncbi\.nlm\.nih\.gov)\/articles\/)?(pmc\d{1,9})\/?$/i;

const DOI = /^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:)?(10\.\d{4,9}\/\S+)$/i;

function isbnOk(digits: string): boolean {
  if (/^\d{9}[\dX]$/.test(digits)) {
    const sum = [...digits].reduce(
      (total, ch, index) => total + (ch === "X" ? 10 : Number(ch)) * (10 - index),
      0,
    );
    return sum % 11 === 0;
  }
  if (/^97[89]\d{10}$/.test(digits)) {
    const sum = [...digits].reduce(
      (total, ch, index) => total + Number(ch) * (index % 2 ? 3 : 1),
      0,
    );
    return sum % 10 === 0;
  }
  return false;
}

/** An old arXiv ID as arXiv writes it: the archive in lower case, the subject class in capitals. */
function arxivId(id: string): string {
  const old = /^([a-z-]+)(?:\.([a-z]{2}))?\/(\d{7})$/i.exec(id);
  if (!old) return id;
  return `${old[1].toLowerCase()}${old[2] ? `.${old[2].toUpperCase()}` : ""}/${old[3]}`;
}

/** What a typed query looks up: a DOI, an ISBN, an arXiv or PubMed ID, or nothing. */
export function lookupOf(query: string): Lookup | null {
  const text = query.trim().replace(/[.,;]+$/, "");
  const doi = DOI.exec(text);
  if (doi) return { kind: "doi", id: doi[1] };
  const arxiv = ARXIV.exec(text);
  if (arxiv) return { kind: "arxiv", id: arxivId(arxiv[1]) };
  const pubmed = PUBMED.exec(text);
  if (pubmed) return { kind: "pubmed", id: pubmed[1] };
  const pmc = PMC.exec(text);
  if (pmc) return { kind: "pubmed", id: pmc[1].toUpperCase() };
  const digits = text
    .replace(/^isbn:?/i, "")
    .replace(/[\s-]/g, "")
    .toUpperCase();
  return isbnOk(digits) ? { kind: "isbn", id: digits } : null;
}

/** The server's answer as a reference, with a key no other reference has. */
export function foundWork(work: LookedUpWork, taken: Iterable<string>): FoundWork {
  const ref: FoundWork = {
    ...emptyReference(""),
    type: work.type,
    author: work.author,
    editor: work.editor,
    title: work.title,
    year: work.year,
    container: work.container,
    publisher: work.publisher,
    place: work.place,
    volume: work.volume,
    issue: work.issue,
    pages: work.pages,
    doi: work.doi,
    url: work.url,
    isbn: work.isbn,
    arxiv: work.arxiv,
    pmid: work.pmid,
  };
  ref.key = suggestKey(ref, taken);
  return ref;
}

/** The work with this DOI, ISBN, arXiv or PubMed ID; null when there is none. */
export async function lookUp(
  lookup: Lookup,
  taken: Iterable<string>,
): Promise<FoundWork | null> {
  if (!workLookup)
    throw new Error(
      t(
        "Sign in to your Scholarkit account to look up DOIs, ISBNs, arXiv and PubMed IDs.",
      ),
    );
  const work = await workLookup(lookup.kind, lookup.id);
  return work ? foundWork(work, taken) : null;
}

/**
 * A found paper with all its details: as the search gave them, or
 * looked up by its OpenAlex ID when the search gave only its title,
 * authors and DOI. The paper as found when that lookup fails.
 */
export async function paperDetails(paper: FoundPaper): Promise<LookedUpWork> {
  if (paper.detailed || !paper.openAlexId || !workLookup) return paper;
  try {
    return (await workLookup("openalex", paper.openAlexId)) ?? paper;
  } catch {
    return paper;
  }
}
