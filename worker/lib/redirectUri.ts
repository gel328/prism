// Validation + matching for OAuth redirect_uri values.
//
// Raw-string matching (`registered.includes(uri)`) is unsafe: WHATWG /
// RFC 3986 URL parsing means two strings that *look* alike can resolve to
// different hosts (userinfo smuggling, fragment-based confusion, scheme
// drift). Equally, registration must reject URIs whose host doesn't match
// what a consent UI would render up to the path.
//
// Rules enforced here:
//   • scheme is exactly https:, OR http: against a loopback host
//     (localhost / 127.0.0.1 / [::1]) for local-development clients
//   • no userinfo (`user:pass@`) — this is the host-confusion vector
//   • no fragment (RFC 6749 §3.1.2 forbids it on the registered URI;
//     the authorization server appends its own response params instead)
//   • match compares normalized (scheme, host:port, pathname, search) —
//     never the raw string

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function tryParse(uri: string): URL | null {
  try {
    return new URL(uri);
  } catch {
    return null;
  }
}

/**
 * Returns null if the uri is acceptable as a registration value, otherwise
 * a short human-readable rejection reason.
 */
export function validateRedirectUriForRegistration(uri: string): string | null {
  if (typeof uri !== "string" || !uri) return "missing";
  const parsed = tryParse(uri);
  if (!parsed) return "not a valid URL";
  if (parsed.username || parsed.password)
    return "must not contain userinfo (user:pass@…)";
  if (parsed.hash) return "must not contain a fragment (#…)";
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol === "https:") return null;
  if (parsed.protocol === "http:" && LOOPBACK_HOSTS.has(host)) return null;
  return "scheme must be https: (http:// is only allowed for loopback hosts)";
}

/**
 * Normalize a parsed URL into the tuple we compare on. Trailing-slash
 * differences and default-port noise are ignored; everything else is
 * preserved (the spec requires path + query parity).
 */
function normalizeKey(parsed: URL): string {
  const scheme = parsed.protocol;
  const host = parsed.hostname.toLowerCase();
  const port =
    parsed.port ||
    (scheme === "https:" ? "443" : scheme === "http:" ? "80" : "");
  const path = parsed.pathname.replace(/\/+$/, "") || "/";
  return `${scheme}//${host}:${port}${path}${parsed.search}`;
}

/**
 * Returns true if `candidate` matches one of the `registered` URIs after
 * both sides are URL-parsed and normalized. Mismatched userinfo / fragment
 * / scheme automatically fail.
 */
export function redirectUriMatchesRegistered(
  candidate: string,
  registered: string[],
): boolean {
  if (validateRedirectUriForRegistration(candidate) !== null) return false;
  const candidateKey = normalizeKey(tryParse(candidate)!);
  for (const r of registered) {
    if (validateRedirectUriForRegistration(r) !== null) continue;
    if (normalizeKey(tryParse(r)!) === candidateKey) return true;
  }
  return false;
}
