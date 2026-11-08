import { describe, expect, it } from "vitest";
import { csvRecords, parseCsv } from "../src/lib/csv";

const rows = (text: string) => [...parseCsv(text)];

describe("parseCsv", () => {
  it("reads plain and quoted fields", () => {
    expect(rows('a,b,c\n1,2,3\n')).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
    expect(rows('"a","b","c"\n"1","2","3"\n')).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
  });

  it("keeps commas, doubled quotes and newlines inside quoted fields", () => {
    expect(rows('"a, b","say ""hi""","line1\nline2"\n')).toEqual([["a, b", 'say "hi"', "line1\nline2"]]);
  });

  it("handles CRLF line ends, no trailing newline, and a byte-order mark", () => {
    expect(rows("a,b\r\n1,2\r\n")).toEqual([["a", "b"], ["1", "2"]]);
    expect(rows("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(rows("﻿id,name\n1,x\n")).toEqual([["id", "name"], ["1", "x"]]);
  });

  it("keeps empty fields, including a trailing one, and skips blank lines", () => {
    expect(rows("a,,c\n")).toEqual([["a", "", "c"]]);
    expect(rows("a,b,\n")).toEqual([["a", "b", ""]]);
    expect(rows("a,b,")).toEqual([["a", "b", ""]]);
    expect(rows('"",""\n')).toEqual([["", ""]]);
    expect(rows("a\n\n\nb\n")).toEqual([["a"], ["b"]]);
    expect(rows("")).toEqual([]);
  });

  it("fails loudly on malformed input instead of guessing", () => {
    expect(() => rows('"never closed')).toThrow(/never closed/);
    expect(() => rows('"ok"junk,b\n')).toThrow(/after a closing quote/);
  });

  it("parses a large file quickly and exactly", () => {
    const n = 200_000;
    const text = '"id","name"\n' + Array.from({ length: n }, (_, i) => `"${i}","Test item, number ${i}"`).join("\n") + "\n";
    const t0 = performance.now();
    let count = 0;
    let last: string[] = [];
    for (const r of parseCsv(text)) {
      count++;
      last = r;
    }
    expect(count).toBe(n + 1);
    expect(last).toEqual([String(n - 1), `Test item, number ${n - 1}`]);
    expect(performance.now() - t0).toBeLessThan(3000);
  });
});

describe("csvRecords", () => {
  it("keys rows by the header and reads short rows as empty strings", () => {
    expect([...csvRecords('id,name,note\n1,Test A,x\n2,Test B\n')]).toEqual([
      { id: "1", name: "Test A", note: "x" },
      { id: "2", name: "Test B", note: "" },
    ]);
  });
});
