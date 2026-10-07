import { createHash } from "node:crypto";
import { z } from "zod";
import {
  MAX_ENTRY_HTML,
  excerptFrom,
  httpUrl,
  plainText,
  type ParsedEntry,
} from "./feed-parse.server.ts";
import { decodeBasicEntities } from "./xml.ts";

/**
 * Inbound newsletter parsing — pure (no I/O), unit-tested. Normalizes the
 * provider payload, finds the recipient's inbox token, and turns a message
 * into a feed entry with tracking pixels and hidden preheaders removed.
 */

const TOKEN_RE = /^[a-z0-9]{10,32}$/;

// ---------- Payload normalization ----------

const postmarkSchema = z.object({
  From: z.string().optional(),
  FromName: z.string().optional(),
  FromFull: z.object({ Email: z.string().optional(), Name: z.string().optional() }).optional(),
  To: z.string().optional(),
  ToFull: z.array(z.object({ Email: z.string().optional() })).optional(),
  Cc: z.string().optional(),
  OriginalRecipient: z.string().optional(),
  Subject: z.string().optional(),
  HtmlBody: z.string().optional(),
  TextBody: z.string().optional(),
  Date: z.string().optional(),
  MessageID: z.string().optional(),
  Headers: z.array(z.object({ Name: z.string(), Value: z.string() })).optional(),
});

const genericSchema = z.object({
  to: z.union([z.string(), z.array(z.string())]),
  from: z.string(),
  fromName: z.string().optional(),
  subject: z.string().optional(),
  html: z.string().optional(),
  text: z.string().optional(),
  date: z.string().optional(),
  messageId: z.string().optional(),
});

export type InboundEmail = {
  recipients: string[];
  fromEmail: string;
  fromName: string;
  subject: string;
  html: string;
  text: string;
  date: number | null;
  messageId: string;
};

const EMAIL_RE = /[^\s<>"',;]+@[^\s<>"',;]+/g;

function emailsIn(value: string | undefined): string[] {
  return (value?.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase());
}

/** Accept Postmark's inbound JSON or the minimal generic shape. */
export function normalizeInbound(payload: unknown): InboundEmail | null {
  const generic = genericSchema.safeParse(payload);
  if (generic.success) {
    const g = generic.data;
    const fromEmail = emailsIn(g.from)[0] ?? "";
    return {
      recipients: (Array.isArray(g.to) ? g.to : [g.to]).flatMap(emailsIn),
      fromEmail,
      fromName:
        g.fromName?.trim() ||
        g.from
          .replace(/<[^>]*>/, "")
          .replace(/"/g, "")
          .trim(),
      subject: g.subject ?? "",
      html: g.html ?? "",
      text: g.text ?? "",
      date: g.date ? Date.parse(g.date) || null : null,
      messageId: g.messageId ?? "",
    };
  }
  const pm = postmarkSchema.safeParse(payload);
  if (pm.success && (pm.data.From || pm.data.FromFull)) {
    const p = pm.data;
    const header = (name: string) =>
      p.Headers?.filter((h) => h.Name.toLowerCase() === name).map((h) => h.Value) ?? [];
    return {
      recipients: [
        ...emailsIn(p.OriginalRecipient),
        ...(p.ToFull ?? []).flatMap((t) => emailsIn(t.Email)),
        ...emailsIn(p.To),
        ...emailsIn(p.Cc),
        ...header("x-original-to").flatMap(emailsIn),
        ...header("delivered-to").flatMap(emailsIn),
      ],
      fromEmail: (p.FromFull?.Email ?? emailsIn(p.From)[0] ?? "").toLowerCase(),
      fromName: p.FromFull?.Name?.trim() || p.FromName?.trim() || "",
      subject: p.Subject ?? "",
      html: p.HtmlBody ?? "",
      text: p.TextBody ?? "",
      date: p.Date ? Date.parse(p.Date) || null : null,
      messageId: p.MessageID ?? "",
    };
  }
  return null;
}

/** `<token>[+tag]@domain` → token, for the first recipient on our domain. */
export function tokenFromRecipients(recipients: string[], domain: string): string | null {
  for (const address of recipients) {
    const at = address.lastIndexOf("@");
    if (at < 1 || address.slice(at + 1) !== domain) continue;
    const token = address.slice(0, at).split("+")[0]!;
    if (TOKEN_RE.test(token)) return token;
  }
  return null;
}

const WEB_VERSION_TEXT =
  /view (?:this |it |the )?(?:email |post |issue |newsletter )?(?:online|in (?:your |a )?browser|on (?:the )?web)|read (?:it |this )?online|web version|open in (?:your )?browser/i;

/** The "View in browser" link most newsletters carry, if any. */
export function findWebVersionUrl(html: string): string | null {
  for (const match of html.matchAll(
    /<a\b[^>]*?\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const label = plainText(match[2] ?? "");
    if (!WEB_VERSION_TEXT.test(label)) continue;
    const url = httpUrl(decodeBasicEntities(match[1] ?? ""));
    if (url && !/unsubscribe/i.test(url)) return url;
  }
  return null;
}

const PIXEL_URL =
  /\/(?:open|o|track(?:ing)?|pixel|beacon|e\/o|wf\/open)(?:[./?]|$)|1x1|spacer\.gif|open\.gif/i;

/**
 * Drop open-tracking pixels (tiny or hidden images, known beacon paths) and
 * hidden preheader text, so reading an issue in KAMI reports nothing back to
 * the sender and excerpts start with the real content.
 */
export function stripEmailTracking(html: string): string {
  return html
    .replace(/<img\b[^>]*>/gi, (tag) => {
      const attr = (name: string) =>
        new RegExp(`\\b${name}\\s*=\\s*["']?([^"'\\s>]+)`, "i").exec(tag)?.[1] ?? "";
      const tiny = (v: string) => /^[0-2](?:px)?$/i.test(v);
      const style = attr("style") + (/style\s*=\s*"([^"]*)"/i.exec(tag)?.[1] ?? "");
      if (tiny(attr("width")) || tiny(attr("height"))) return "";
      if (/display\s*:\s*none|visibility\s*:\s*hidden|(?:width|height)\s*:\s*[0-2]px/i.test(style))
        return "";
      if (PIXEL_URL.test(attr("src"))) return "";
      return tag;
    })
    .replace(
      /<(div|span|p|td)\b[^>]*style\s*=\s*["'][^"']*(?:display\s*:\s*none|max-height\s*:\s*0|mso-hide\s*:\s*all)[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi,
      "",
    );
}

function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Turn an inbound message into a feed entry (pure). */
export function emailToEntry(mail: InboundEmail): ParsedEntry {
  let html = stripEmailTracking(mail.html.trim());
  if (!html || html.length > MAX_ENTRY_HTML) html = textToHtml(mail.text).slice(0, MAX_ENTRY_HTML);
  const plain = plainText(html);
  const guid =
    mail.messageId.trim() ||
    createHash("sha256")
      .update(`${mail.fromEmail}\n${mail.subject}\n${mail.date ?? ""}\n${plain.slice(0, 500)}`)
      .digest("hex");
  return {
    guid: guid.slice(0, 1000),
    url: findWebVersionUrl(html) ?? "",
    title: plainText(mail.subject).slice(0, 500) || excerptFrom(plain, 90) || "Untitled issue",
    author: mail.fromName.slice(0, 300),
    contentHtml: html,
    excerpt: excerptFrom(plain),
    imageUrl: null,
    publishedAt: mail.date && Number.isFinite(mail.date) ? mail.date : null,
  };
}
