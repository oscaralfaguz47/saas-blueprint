import "server-only";

import { lookup } from "node:dns/promises";
import { BlockList, isIPv4, isIPv6 } from "node:net";

/** Stable failure codes for logs and tests (no secrets). */
export type WebhookUrlBlockReason =
  | "invalid_url"
  | "non_https"
  | "host_forbidden"
  | "dns_failed"
  | "dns_timeout"
  | "ip_forbidden";

const DNS_TIMEOUT_MS = 5000;

/** Static SSRF deny ranges — not DNS caching (Decision G). */
function createForbiddenIpBlockList(): BlockList {
  const b = new BlockList();
  b.addSubnet("10.0.0.0", 8, "ipv4");
  b.addSubnet("172.16.0.0", 12, "ipv4");
  b.addSubnet("192.168.0.0", 16, "ipv4");
  b.addSubnet("127.0.0.0", 8, "ipv4");
  b.addSubnet("169.254.0.0", 16, "ipv4");
  b.addSubnet("::1", 128, "ipv6");
  b.addSubnet("fc00::", 7, "ipv6");
  b.addSubnet("fe80::", 10, "ipv6");
  return b;
}

const FORBIDDEN_IPS = createForbiddenIpBlockList();

/** `new URL` keeps brackets on IPv6 hostnames, e.g. `[::1]` — `net.isIPv6` needs them stripped. */
function unbracketIpv6Host(hostname: string): string {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

function isIpForbidden(addr: string): boolean {
  const type: "ipv4" | "ipv6" = isIPv6(addr) ? "ipv6" : "ipv4";
  return FORBIDDEN_IPS.check(addr, type);
}

function isLocalHostname(host: string): boolean {
  const h = host.toLowerCase();
  return h === "localhost" || h.endsWith(".localhost");
}

function allowsHttpInDev(): boolean {
  return process.env.NODE_ENV === "development";
}

/**
 * SSRF-safe webhook URL check with fresh DNS lookup (no caching). Dual-stack: every resolved address must be public.
 */
export async function validateWebhookUrl(
  urlString: string
): Promise<{ ok: true } | { ok: false; reason: WebhookUrlBlockReason }> {
  let url: URL;
  try {
    url = new URL(urlString.trim());
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  if (url.username || url.password) {
    return { ok: false, reason: "invalid_url" };
  }

  const protocol = url.protocol.toLowerCase();
  if (protocol === "https:") {
    // ok
  } else if (protocol === "http:" && allowsHttpInDev()) {
    // ok (development only)
  } else {
    return { ok: false, reason: "non_https" };
  }

  const hostnameRaw = url.hostname;
  if (!hostnameRaw) {
    return { ok: false, reason: "invalid_url" };
  }

  const ipCandidate = unbracketIpv6Host(hostnameRaw);

  if (isLocalHostname(hostnameRaw)) {
    return { ok: false, reason: "host_forbidden" };
  }

  if (isIPv4(ipCandidate) || isIPv6(ipCandidate)) {
    return isIpForbidden(ipCandidate)
      ? { ok: false, reason: "ip_forbidden" }
      : { ok: true };
  }

  try {
    const addresses = await Promise.race([
      lookup(hostnameRaw, { all: true, verbatim: true }),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("dns_timeout")), DNS_TIMEOUT_MS)
      ),
    ]);

    for (const entry of addresses) {
      if (isIpForbidden(entry.address)) {
        return { ok: false, reason: "ip_forbidden" };
      }
    }

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "dns_timeout") {
      return { ok: false, reason: "dns_timeout" };
    }
    return { ok: false, reason: "dns_failed" };
  }
}
