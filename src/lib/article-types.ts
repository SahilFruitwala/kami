export type ArticleSource = "blog" | "x";

export type Article = {
  url: string;
  canonicalUrl: string;
  title: string;
  author: string;
  siteName: string;
  published: string | null;
  excerpt: string;
  contentHtml: string;
  wordCount: number;
  readingMinutes: number;
  source: ArticleSource;
  heroImage: string | null;
};

export type ExtractResult = { ok: true; article: Article } | { ok: false; error: string };
