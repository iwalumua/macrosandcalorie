/**
 * A small RFC 4180 CSV reader, written out here because the importers need
 * nothing more and USDA's files are plain: every field quoted, commas and
 * doubled quotes inside fields, CRLF or LF line ends, sometimes a BOM.
 * Rows are yielded one at a time so a 35 MB file does not become a 35 MB array.
 */

/** Yield each row as an array of fields. Blank lines are skipped. */
export function* parseCsv(text: string): Generator<string[]> {
  const n = text.length;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; // skip a byte-order mark
  let row: string[] = [];
  let expectField = i < n;

  while (i < n || expectField) {
    expectField = false;
    let field: string;

    if (i < n && text.charCodeAt(i) === 34) {
      // Quoted field: runs to the next quote that is not doubled.
      i++;
      let start = i;
      let out = "";
      for (;;) {
        const q = text.indexOf('"', i);
        if (q === -1) throw new Error("Malformed CSV: a quoted field is never closed.");
        if (text.charCodeAt(q + 1) === 34) {
          out += text.slice(start, q + 1); // keep one of the two quotes
          i = q + 2;
          start = i;
        } else {
          out += text.slice(start, q);
          i = q + 1;
          break;
        }
      }
      field = out;
      const after = text.charCodeAt(i);
      if (i < n && after !== 44 && after !== 10 && after !== 13) {
        throw new Error("Malformed CSV: unexpected text after a closing quote.");
      }
    } else {
      let j = i;
      while (j < n) {
        const c = text.charCodeAt(j);
        if (c === 44 || c === 10 || c === 13) break;
        j++;
      }
      field = text.slice(i, j);
      i = j;
    }

    row.push(field);

    const c = text.charCodeAt(i);
    if (i < n && c === 44) {
      i++;
      expectField = true; // a comma always starts another field, even an empty one at the very end
      continue;
    }
    if (i < n && c === 13) i++;
    if (i < n && text.charCodeAt(i) === 10) i++;
    if (!(row.length === 1 && row[0] === "")) yield row;
    row = [];
    expectField = false;
  }
  if (row.length > 0 && !(row.length === 1 && row[0] === "")) yield row;
}

/** Yield each data row as an object keyed by the header row. Missing trailing fields read as "". */
export function* csvRecords(text: string): Generator<Record<string, string>> {
  let header: string[] | null = null;
  for (const row of parseCsv(text)) {
    if (header === null) {
      header = row;
      continue;
    }
    const rec: Record<string, string> = {};
    for (let k = 0; k < header.length; k++) rec[header[k]!] = row[k] ?? "";
    yield rec;
  }
}
