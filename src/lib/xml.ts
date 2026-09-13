const AMP = "\u0026";

export function xmlEscape(value: string): string {
  return value
    .replaceAll("&", `${AMP}amp;`)
    .replaceAll("<", `${AMP}lt;`)
    .replaceAll(">", `${AMP}gt;`)
    .replaceAll('"', `${AMP}quot;`);
}

export function decodeBasicEntities(value: string): string {
  return value
    .replaceAll(`${AMP}nbsp;`, " ")
    .replaceAll(`${AMP}amp;`, "&")
    .replaceAll(`${AMP}lt;`, "<")
    .replaceAll(`${AMP}gt;`, ">")
    .replaceAll(`${AMP}#39;`, "'")
    .replaceAll(`${AMP}apos;`, "'")
    .replaceAll(`${AMP}quot;`, '"');
}
