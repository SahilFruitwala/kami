export function isKindleEmail(value: string): boolean {
  return /^[a-z0-9._%+\-]+@(?:free\.)?kindle\.(?:com|cn|co\.uk|de|es|fr|it|co\.jp|in|com\.au|com\.br|ca|com\.mx|nl|pl|se|com\.be|com\.tr|ae|sg|sa|eg)$/i.test(
    value.trim(),
  );
}

export function gmailComposeUrl(kindleEmail: string, title: string): string {
  const subject = encodeURIComponent(title.slice(0, 80) || "convert");
  const body = encodeURIComponent(
    "Attach the EPUB that just downloaded, then send this message. Amazon will convert it and it will appear on your Kindle shortly.",
  );
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(kindleEmail)}&su=${subject}&body=${body}`;
}

export function mailtoComposeUrl(kindleEmail: string, title: string): string {
  const subject = encodeURIComponent(title.slice(0, 80) || "convert");
  return `mailto:${encodeURIComponent(kindleEmail)}?subject=${subject}`;
}

export const SEND_TO_KINDLE_URL = "https://www.amazon.com/sendtokindle";
export const KINDLE_SETTINGS_URL =
  "https://www.amazon.com/hz/mycd/digital-console/alldevices";
