import { memo, type CSSProperties, type MouseEvent, type RefObject } from "react";

export const ReaderBody = memo(function ReaderBody({
  html,
  fontSizeRem,
  fontId,
  onSelectEnd,
  onClick,
  bodyRef,
}: {
  html: string;
  fontSizeRem: number;
  fontId: string;
  onSelectEnd: () => void;
  onClick: (event: MouseEvent<HTMLDivElement>) => void;
  bodyRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={bodyRef}
      className="reader-body mt-8"
      data-font={fontId}
      style={{ "--reader-font-size": `${fontSizeRem}rem` } as CSSProperties}
      onMouseUp={onSelectEnd}
      onTouchEnd={onSelectEnd}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});
