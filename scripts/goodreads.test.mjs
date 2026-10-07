import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCsv, parseGoodreadsCsv } from "../src/lib/goodreads.ts";

const HEADER =
  "Book Id,Title,Author,Author l-f,Additional Authors,ISBN,ISBN13,My Rating,Average Rating,Publisher,Binding,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Bookshelves with positions,Exclusive Shelf,My Review,Spoiler,Private Notes,Read Count,Owned Copies";

const EXPORT = [
  "﻿" + HEADER,
  `2767052,"The Hunger Games (The Hunger Games, #1)",Suzanne Collins,"Collins, Suzanne",,"=""0439023483""","=""9780439023481""",4,4.33,Scholastic Press,Hardcover,374,2008,2008,2023/05/14,2023/01/02,,,read,"Loved it.<br/><br/>Would ""re-read"".",,,1,0`,
  `11,Dune,Frank Herbert,"Herbert, Frank",,"=""""","=""""",0,4.25,Ace,Paperback,,2005,1965,,2024/02/10,to-read,to-read (#3),to-read,,,,0,0`,
  `12,Ulysses,James Joyce,"Joyce, James",,,,0,3.7,,,730,1922,,,2022/07/01,dnf,dnf (#1),did-not-finish,,,,0,0`,
  `13,Middlemarch,George Eliot,"Eliot, George",,,,0,4.0,,,880,1871,,,2024/03/01,,,currently-reading,,,,0,0`,
].join("\r\n");

describe("parseCsv", () => {
  it("handles quotes, doubled quotes, embedded commas and newlines", () => {
    assert.deepEqual(parseCsv('a,"b,c","d ""e""\nf"\r\n1,2,3\n'), [
      ["a", "b,c", 'd "e"\nf'],
      ["1", "2", "3"],
    ]);
  });
});

describe("parseGoodreadsCsv", () => {
  const books = parseGoodreadsCsv(EXPORT);

  it("maps shelves, ISBNs, dates and ratings", () => {
    assert.equal(books.length, 4);
    assert.deepEqual(books[0], {
      title: "The Hunger Games (The Hunger Games, #1)",
      author: "Suzanne Collins",
      isbn: "9780439023481",
      year: 2008,
      pages: 374,
      status: "done",
      rating: 4,
      goodreadsId: "2767052",
      dateAdded: "2023-01-02",
      dateRead: "2023-05-14",
      review: 'Loved it.\n\nWould "re-read".',
    });
  });

  it("prefers the original publication year and drops empty fields", () => {
    const dune = books[1];
    assert.equal(dune.status, "to_try");
    assert.equal(dune.year, 1965);
    assert.equal(dune.isbn, undefined);
    assert.equal(dune.rating, undefined);
    assert.equal(dune.pages, undefined);
  });

  it("reads custom DNF shelves as abandoned and currently-reading as in progress", () => {
    assert.equal(books[2].status, "abandoned");
    assert.equal(books[3].status, "in_progress");
  });

  it("rejects files that aren't Goodreads exports", () => {
    assert.throws(() => parseGoodreadsCsv("name,url\nx,y"), /Goodreads/);
    assert.throws(() => parseGoodreadsCsv(""), /empty/);
  });
});
