import { READER_FONTS } from "@/lib/reader-prefs.ts";
import hljs from "highlight.js/lib/common";
import {
  memo,
  useEffect,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
} from "react";

export const ReaderBody = memo(function ReaderBody({
  html,
  fontSizeRem,
  fontId,
  onSelectEnd,
  onClick,
  onKeyDown,
  bodyRef,
}: {
  html: string;
  fontSizeRem: number;
  fontId: string;
  onSelectEnd: () => void;
  onClick: (event: MouseEvent<HTMLDivElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  bodyRef: RefObject<HTMLDivElement | null>;
}) {
  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;
    for (const code of root.querySelectorAll<HTMLElement>("pre > code")) {
      if (code.dataset.highlighted) continue;
      // Only plain-text blocks: highlighting rewrites innerHTML, so skip any with markup
      // (e.g. reader highlights) to keep them intact.
      if (code.querySelector("mark")) continue;
      if (code.children.length) {
        // Source-site highlighter spans / <br>s: flatten to plain text first.
        for (const br of code.querySelectorAll("br")) br.replaceWith("\n");
        code.textContent = code.textContent;
      }
      hljs.highlightElement(code);
    }
  }, [html, bodyRef]);
  const family = READER_FONTS.find((f) => f.id === fontId)?.family;
  return (
    <div
      ref={bodyRef}
      className="reader-body mt-8"
      data-font={fontId}
      style={
        { "--reader-font-size": `${fontSizeRem}rem`, "--reader-font": family } as CSSProperties
      }
      onMouseUp={onSelectEnd}
      onTouchEnd={onSelectEnd}
      onClick={onClick}
      onKeyDown={onKeyDown}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});
