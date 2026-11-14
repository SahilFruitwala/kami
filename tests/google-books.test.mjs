import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  googleBooksCoverUrl,
  googleVolumeIdFromLink,
  mapGoogleBookVolume,
  stripHtmlBlurb,
  upgradeGoogleBooksCover,
} from "../src/lib/google-books.ts";

describe("mapGoogleBookVolume", () => {
  it("maps a volume onto a shelf lookup row", () => {
    const row = mapGoogleBookVolume({
      id: "zyTCAlFPjgYC",
      volumeInfo: {
        title: "The Hunger Games",
        authors: ["Suzanne Collins"],
        publishedDate: "2008-09-14",
        description: "<p>In the ruins of a place once known as North America…</p>",
        pageCount: 374,
        categories: ["Juvenile Fiction / Action & Adventure"],
        imageLinks: {
          thumbnail:
            "http://books.google.com/books/content?id=zyTCAlFPjgYC&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api",
        },
        canonicalVolumeLink: "https://books.google.com/books/about?id=zyTCAlFPjgYC",
        industryIdentifiers: [
          { type: "ISBN_10", identifier: "0439023483" },
          { type: "ISBN_13", identifier: "9780439023481" },
        ],
      },
    });
    assert.deepEqual(row, {
      title: "The Hunger Games",
      imageUrl:
        "https://books.google.com/books/content?id=zyTCAlFPjgYC&printsec=frontcover&img=1&zoom=2&source=gbs_api",
      link: "https://books.google.com/books?id=zyTCAlFPjgYC",
      metadata: {
        googleVolumeId: "zyTCAlFPjgYC",
        author: "Suzanne Collins",
        year: "2008",
        pages: "374",
        genre: "Juvenile Fiction, Action & Adventure",
        overview: "In the ruins of a place once known as North America…",
        isbn: "9780439023481",
      },
    });
  });

  it("skips volumes with no title", () => {
    assert.equal(mapGoogleBookVolume({ id: "x", volumeInfo: { authors: ["Anon"] } }), null);
  });
});

describe("googleVolumeIdFromLink", () => {
  it("reads id= query, edition paths, and bare ids", () => {
    assert.equal(
      googleVolumeIdFromLink("https://books.google.com/books?id=zyTCAlFPjgYC"),
      "zyTCAlFPjgYC",
    );
    assert.equal(
      googleVolumeIdFromLink("https://www.google.com/books/edition/_/zyTCAlFPjgYC"),
      "zyTCAlFPjgYC",
    );
    assert.equal(
      googleVolumeIdFromLink("https://play.google.com/store/books/details?id=zyTCAlFPjgYC"),
      "zyTCAlFPjgYC",
    );
    assert.equal(googleVolumeIdFromLink("zyTCAlFPjgYC"), "zyTCAlFPjgYC");
    assert.equal(googleVolumeIdFromLink("https://openlibrary.org/works/OL123W"), undefined);
    assert.equal(googleVolumeIdFromLink("https://www.goodreads.com/book/show/2767052"), undefined);
  });
});

describe("covers and blurbs", () => {
  it("upgrades http thumbnails to https zoom=2 without a page curl", () => {
    const url = googleBooksCoverUrl({
      thumbnail: "http://books.google.com/books/content?id=abc&img=1&zoom=1&edge=curl",
    });
    assert.equal(url, "https://books.google.com/books/content?id=abc&img=1&zoom=2");
    assert.equal(
      upgradeGoogleBooksCover("https://books.google.com/books/content?id=abc&zoom=3"),
      "https://books.google.com/books/content?id=abc&zoom=3",
    );
  });

  it("strips HTML from Google descriptions", () => {
    assert.equal(stripHtmlBlurb("<p>Hello <b>world</b>&amp; co</p>"), "Hello world& co");
    assert.equal(stripHtmlBlurb("   "), undefined);
  });
});
