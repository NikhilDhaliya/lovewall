import net from "node:net";

// Addresses a server-side fetch must never reach: private, loopback, link-local, CGNAT, multicast, reserved.
const blocked = new net.BlockList();
for (const [addr, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(addr, bits, "ipv4");
for (const [addr, bits] of [
  ["::", 128],
  ["::1", 128],
  ["::", 96], // IPv4-compatible (deprecated)
  ["fec0::", 10], // site-local (deprecated)
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
] as const)
  blocked.addSubnet(addr, bits, "ipv6");

export function isPrivateAddress(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return blocked.check(ip, "ipv4");
  if (family === 6) {
    const mapped = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return blocked.check(mapped[1], "ipv4");
    if (/^::ffff:/i.test(ip)) return true; // hex-form mapped addresses: refuse
    return blocked.check(ip, "ipv6");
  }
  return true;
}

// A URL whose host is a private IP literal ("127.0.0.1", "[::1]", "2130706433" once parsed). Names are checked when
// they resolve; literals never go through DNS, so they are checked here.
export function isPrivateLiteral(url: URL): boolean {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  return net.isIP(host) !== 0 && isPrivateAddress(host);
}
