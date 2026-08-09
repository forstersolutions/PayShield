export function normalizeSiteUrl(value) {
  const url = new URL(value);

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error("Site URL must be an absolute HTTP(S) URL without credentials.");
  }

  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${url.pathname}`;
}
