import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseBookCsv, parseCsv, parseGoodreadsCsv } from "../src/lib/goodreads.ts";

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

const SG_HEADER =
  "Title,Authors,Contributors,ISBN/UID,Format,Read Status,Date Added,Last Date Read,Dates Read,Read Count,Moods,Pace,Character- or Plot-Driven?,Strong Character Development?,Loveable Characters?,Diverse Characters?,Flawed Characters?,Star Rating,Review,Content Warnings,Content Warning Description,Tags,Owned?";

// Rows from a real StoryGraph export.
const STORYGRAPH = [
  SG_HEADER,
  `Deep Work: Rules for Focused Success in a Distracted World,Cal Newport,"",9781455586691,hardcover,to-read,2019/08/21,"","",0,"",,,,,,,,,"",,bought,Yes`,
  `"The Psychology of Money: Timeless Lessons on Wealth, Greed, and Happiness",Morgan Housel,"",9780857197689,paperback,read,2021/08/06,2022/09/04,2022/09/04,1,"",,,,,,,5.0,,"",,"",No`,
  `"""Surely You're Joking, Mr. Feynman!"": Adventures of a Curious Character",Richard P. Feynman,"Bill Gates (Contributor), Ralph Leighton",9780393355628,paperback,to-read,2023/09/20,"","",0,"",,,,,,,,,"",,tim-ferris-suggestion,No`,
  `Tuesdays with Morrie,Mitch Albom,"",B07HQMSL58,paperback,read,2024/09/30,"","",1,"",,,,,,,3.75,,"",,"",No`,
  `12 Rules for Life: An Antidote to Chaos,Jordan B. Peterson,"",9781984833976,audio,paused,2024/12/19,"","",0,"",,,,,,,,,"",,"",No`,
  `Lekin / لیکن,Jaun Elia,"",,,did-not-finish,2024/02/07,"","",0,"",,,,,,,,,"",,bought,Yes`,
  `The Art of War,Sun Tzu,Thomas Cleary,0143105752,paperback,read,2019/08/15,2020/11/01,2020/11/01,1,"",,,,,,,4.0,,"",,"",No`,
  "",
].join("\n");

describe("parseBookCsv (StoryGraph)", () => {
  const { source, books } = parseBookCsv(STORYGRAPH);

  it("recognises a StoryGraph export and reads every row", () => {
    assert.equal(source, "storygraph");
    assert.equal(books.length, 7);
    assert.equal(
      books[2].title,
      `"Surely You're Joking, Mr. Feynman!": Adventures of a Curious Character`,
    );
  });

  it("maps read status, ratings, ISBNs and dates", () => {
    assert.deepEqual(books[1], {
      title: "The Psychology of Money: Timeless Lessons on Wealth, Greed, and Happiness",
      author: "Morgan Housel",
      isbn: "9780857197689",
      status: "done",
      rating: 5,
      dateAdded: "2021-08-06",
      dateRead: "2022-09-04",
      review: undefined,
    });
    assert.deepEqual(
      books.map((b) => b.status),
      ["to_try", "done", "to_try", "done", "in_progress", "abandoned", "done"],
    );
    assert.equal(books[3].rating, 3.75);
    assert.equal(books[3].isbn, undefined); // ASIN, not an ISBN
    assert.equal(books[3].dateRead, undefined);
    assert.equal(books[6].isbn, "0143105752");
  });

  it("still routes Goodreads exports to the Goodreads parser", () => {
    assert.equal(parseBookCsv(EXPORT).source, "goodreads");
    assert.throws(() => parseBookCsv("name,url\nx,y"), /Goodreads/);
  });
});
