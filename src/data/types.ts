export type SectionKey = 'deg1' | 'deg2' | 'deg3' | 'admin' | 'delit' | 'art94' | 'stop';

export interface Section {
  key: SectionKey;
  title: string;
  short: string;
  color: string;
  main: boolean;
  count: number;
  firstPdfPage: number;
  lastPdfPage: number;
}

export interface Violation {
  id: string;
  /** Code as printed in the «الرمز» column (primary code). */
  code: string;
  /** Raw content of the code cell, e.g. "184221C1 + 096061AD". */
  codeRaw: string;
  relatedCodes: string[];
  codeNote: string | null;
  section: SectionKey;
  order: number;
  /** «توصيف المخالفة» — verbatim. */
  description: string;
  /** «المرجع القانوني» — verbatim lines. */
  legalRefs: string[];
  /** «المسطرة» — verbatim lines. */
  procedure: string[];
  /** Notes added during extraction (uncertainties, duplicates). Not legal content. */
  extractionNotes: string[];
  pdfPage: number;
  printedPage: number;
  sharedCell: string | null;
  sharedWith: string[];
  articles: string[];
  duplicateCode: boolean;
}

export interface Dataset {
  version: string;
  source: { title: string; subtitle: string; edition: string; pdfPages: number };
  sections: Section[];
  violations: Violation[];
}
