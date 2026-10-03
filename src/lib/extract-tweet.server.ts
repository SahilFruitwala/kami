import { parseHTML } from "linkedom";
import type { Article } from "./article-types.ts";
import { xmlEscape } from "./xml.ts";
import { isBareXArticleLink, xArticleBlocksToHtml, type FxXArticle } from "./x-article.ts";

import { fetchText } from "./fetch-text.server.ts";
import { buildArticle, countWords, excerptOf, textFromHtml } from "./article-build.server.ts";
import { sanitizeHtml } from "./sanitize-html.server.ts";

function tweetTextToHtml(text: string, baseUrl: string): string {
  const escaped = xmlEscape(text);
  const linked = escaped.replace(/(https?:\/\/[^\s<]+)/g, (url) => `<a href="${url}">${url}</a>`);
  const withHandles = linked.replace(
    /(^|[\s])@([A-Za-z0-9_]+)/g,
    `$1<a href="https://x.com/$2">@$2</a>`,
  );
  const paragraphs = withHandles
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return sanitizeHtml(paragraphs, baseUrl);
}

export function formatTweetDate(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 10_000_000_000 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

type FxTweet = {
  id?: string;
  url?: string;
  text?: string;
  raw_text?: { text?: string };
  author?: { name?: string; screen_name?: string };
  created_at?: string;
  created_timestamp?: number;
  media?: { photos?: { url?: string; altText?: string }[] };
  quote?: FxTweet;
  article?: FxXArticle;
};

function tweetToArticle(tweet: FxTweet, sourceUrl: string): Article | null {
  if (tweet.article?.content?.blocks?.length) {
    const html = xArticleBlocksToHtml(tweet.article);
    const handle = tweet.author?.screen_name ? `@${tweet.author.screen_name}` : "";
    const author = tweet.author?.name
      ? `${tweet.author.name}${handle ? ` (${handle})` : ""}`
      : handle || "X";
    const canonical = tweet.url || sourceUrl;
    const cover = tweet.article.cover_media?.media_info?.original_img_url ?? null;
    return buildArticle({
      url: sourceUrl,
      canonicalUrl: canonical,
      title: tweet.article.title || "X article",
      author,
      siteName: "X",
      published: formatTweetDate(tweet.created_timestamp ?? tweet.created_at),
      contentHtml: html,
      source: "x",
      heroImage: cover,
    });
  }

  const text = (tweet.text || tweet.raw_text?.text || "").trim();
  if (!text || isBareXArticleLink(text)) return null;
  const handle = tweet.author?.screen_name ? `@${tweet.author.screen_name}` : "";
  const author = tweet.author?.name
    ? `${tweet.author.name}${handle ? ` (${handle})` : ""}`
    : handle || "X";
  const canonical = tweet.url || sourceUrl;
  const photos = tweet.media?.photos ?? [];
  const figures = photos
    .map((photo) => {
      if (!photo.url) return "";
      const alt = xmlEscape(photo.altText || "Posted image");
      return `<figure><img src="${xmlEscape(photo.url)}" alt="${alt}"/></figure>`;
    })
    .join("");
  let quoteHtml = "";
  if (tweet.quote?.text) {
    const qAuthor = tweet.quote.author?.screen_name
      ? `@${tweet.quote.author.screen_name}`
      : tweet.quote.author?.name || "quoted post";
    quoteHtml = `<blockquote><p><strong>${xmlEscape(qAuthor)}</strong></p>${tweetTextToHtml(tweet.quote.text, canonical)}</blockquote>`;
  }
  const contentHtml = sanitizeHtml(
    `${tweetTextToHtml(text, canonical)}${quoteHtml}${figures}`,
    canonical,
  );
  const plain = textFromHtml(contentHtml);
  const words = countWords(plain);
  if (!plain) return null;
  return {
    url: sourceUrl,
    canonicalUrl: canonical,
    title: excerptOf(text.replace(/\s+/g, " "), 90),
    author,
    siteName: "X",
    published: formatTweetDate(tweet.created_timestamp ?? tweet.created_at),
    excerpt: excerptOf(plain),
    contentHtml,
    wordCount: words,
    readingMinutes: Math.max(1, Math.round(words / 200)),
    source: "x",
    heroImage: photos[0]?.url ?? null,
  };
}

export async function extractTweet(id: string, sourceUrl: string): Promise<Article | null> {
  const endpoints = [
    `https://api.fxtwitter.com/status/${id}`,
    `https://api.vxtwitter.com/Twitter/status/${id}`,
  ];
  for (const endpoint of endpoints) {
    try {
      const { text } = await fetchText(endpoint, "application/json");
      const json = JSON.parse(text) as {
        tweet?: FxTweet;
        text?: string;
        user_name?: string;
        user_screen_name?: string;
        date?: string;
        media_extended?: { type?: string; url?: string }[];
        tweetURL?: string;
      };
      if (json.tweet) {
        const article = tweetToArticle(json.tweet, sourceUrl);
        if (article) return article;
      }
      if (typeof json.text === "string" && json.text.trim()) {
        const fake: FxTweet = {
          text: json.text,
          url: json.tweetURL || sourceUrl,
          author: { name: json.user_name, screen_name: json.user_screen_name },
          created_at: json.date,
          media: {
            photos: (json.media_extended ?? [])
              .filter((m) => m.type === "image" && m.url)
              .map((m) => ({ url: m.url })),
          },
        };
        const article = tweetToArticle(fake, sourceUrl);
        if (article) return article;
      }
    } catch {
      // try next
    }
  }

  try {
    const oembedUrl = `https://publish.twitter.com/oembed?omit_script=1&dnt=1&url=${encodeURIComponent(sourceUrl)}`;
    const { text } = await fetchText(oembedUrl, "application/json");
    const json = JSON.parse(text) as { html?: string; author_name?: string; author_url?: string };
    if (json.html) {
      const { document } = parseHTML(`<div id="root">${json.html}</div>`);
      const plain = (document.getElementById("root")?.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim();
      if (plain) {
        const contentHtml = tweetTextToHtml(plain, sourceUrl);
        const words = countWords(plain);
        return {
          url: sourceUrl,
          canonicalUrl: sourceUrl,
          title: excerptOf(plain, 90),
          author: json.author_name || "X",
          siteName: "X",
          published: null,
          excerpt: excerptOf(plain),
          contentHtml,
          wordCount: words,
          readingMinutes: Math.max(1, Math.round(words / 200)),
          source: "x",
          heroImage: null,
        };
      }
    }
  } catch {
    // fall through to page fetch
  }
  return null;
}
