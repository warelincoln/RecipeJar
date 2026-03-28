import type { LookupAddress } from "node:dns";
import { lookup as dnsLookup } from "node:dns/promises";
import net from "node:net";

/**
 * Non–globally routable and special-use ranges we refuse for server-side URL fetch (SSRF mitigation).
 * IPv4: RFC 1918, loopback, link-local, CGNAT, this-host, documentation, multicast, reserved.
 * IPv6: loopback, link-local, unique local (ULA).
 */
function createSsrfBlocklist(): net.BlockList {
  const bl = new net.BlockList();

  bl.addSubnet("127.0.0.0", 8, "ipv4");
  bl.addSubnet("10.0.0.0", 8, "ipv4");
  bl.addSubnet("172.16.0.0", 12, "ipv4");
  bl.addSubnet("192.168.0.0", 16, "ipv4");
  bl.addSubnet("169.254.0.0", 16, "ipv4");
  bl.addSubnet("100.64.0.0", 10, "ipv4");
  bl.addSubnet("0.0.0.0", 8, "ipv4");
  bl.addSubnet("192.0.0.0", 24, "ipv4");
  bl.addSubnet("192.0.2.0", 24, "ipv4");
  bl.addSubnet("198.51.100.0", 24, "ipv4");
  bl.addSubnet("203.0.113.0", 24, "ipv4");
  bl.addSubnet("224.0.0.0", 4, "ipv4");
  bl.addSubnet("240.0.0.0", 4, "ipv4");

  bl.addAddress("::1", "ipv6");
  bl.addSubnet("fe80::", 10, "ipv6");
  bl.addSubnet("fc00::", 7, "ipv6");

  return bl;
}

const SSRF_BLOCKLIST = createSsrfBlocklist();

const IPV4_MAPPED_DOTTED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

/** IPv4-mapped IPv6 tail as dotted quad, e.g. ::ffff:127.0.0.1 */
function ipv4MappedDottedQuad(ip: string): string | null {
  const m = ip.match(IPV4_MAPPED_DOTTED);
  return m ? m[1]! : null;
}

/**
 * IPv4-mapped IPv6 in compressed hex (Node normalizes e.g. ::ffff:127.0.0.1 to ::ffff:7f00:1).
 */
function ipv4MappedHexTail(ip: string): string | null {
  const m = ip.match(/^::ffff:(.+)$/i);
  if (!m) return null;
  const payload = m[1]!;
  const hexParts = payload.split(":").filter(Boolean);
  if (hexParts.length === 1 && hexParts[0]!.length === 8) {
    const n = parseInt(hexParts[0]!, 16);
    if (!Number.isFinite(n)) return null;
    return `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`;
  }
  if (hexParts.length === 2) {
    const hi = parseInt(hexParts[0]!, 16);
    const lo = parseInt(hexParts[1]!, 16);
    if (!Number.isFinite(hi) || !Number.isFinite(lo)) return null;
    const n = (hi << 16) | lo;
    return `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`;
  }
  return null;
}

function isBlockedIp(ip: string, family: 4 | 6): boolean {
  if (family === 4) {
    return SSRF_BLOCKLIST.check(ip, "ipv4");
  }
  const mapped4 =
    ipv4MappedDottedQuad(ip) ?? ipv4MappedHexTail(ip);
  if (mapped4) {
    return SSRF_BLOCKLIST.check(mapped4, "ipv4");
  }
  return SSRF_BLOCKLIST.check(ip, "ipv6");
}

/**
 * Throws if the URL must not be fetched (scheme, credentials, or disallowed resolved addresses).
 * Uses getaddrinfo via dns.lookup(all:true) to align with typical TCP resolution.
 */
export async function assertUrlSafeForSsrf(urlString: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error("Invalid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed");
  }

  if (url.username !== "" || url.password !== "") {
    throw new Error("URL must not contain credentials");
  }

  let host = url.hostname;
  if (!host) {
    throw new Error("Missing host");
  }

  // WHATWG URL can surface IPv6 with brackets; net.isIP / lookup need the bare address.
  if (host.startsWith("[") && host.endsWith("]")) {
    host = host.slice(1, -1);
  }

  const literalKind = net.isIP(host);
  if (literalKind === 4) {
    if (isBlockedIp(host, 4)) {
      throw new Error("Target address is not allowed");
    }
    return;
  }
  if (literalKind === 6) {
    if (isBlockedIp(host, 6)) {
      throw new Error("Target address is not allowed");
    }
    return;
  }

  let records: LookupAddress[];
  try {
    records = await dnsLookup(host, { all: true, verbatim: true });
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOTFOUND" || err.code === "EAI_AGAIN") {
      throw new Error(`Could not resolve host: ${host}`);
    }
    throw e;
  }

  if (records.length === 0) {
    throw new Error(`Could not resolve host: ${host}`);
  }

  for (const { address, family } of records) {
    if (family !== 4 && family !== 6) continue;
    if (isBlockedIp(address, family)) {
      throw new Error("Target resolves to a disallowed address");
    }
  }
}
