const CONNECT = /\bconnect\(\d+,\s*(.*)$/;
const FAMILY = /^\{sa_family=(AF_[A-Z0-9]+)/;
const LOCAL_FAMILIES = new Set(['AF_UNIX', 'AF_LOCAL', 'AF_NETLINK', 'AF_UNSPEC']);

/**
 * The lines of a `strace -f -e trace=connect` log that connect to the network (SR-07): any
 * AF_INET/AF_INET6 connect, and any connect whose address strace couldn't decode.
 */
export function networkConnects(log: string): string[] {
  return log.split('\n').filter((line) => {
    const call = CONNECT.exec(line);
    if (!call) return false;
    const family = FAMILY.exec(call[1]!)?.[1];
    return family === undefined || !LOCAL_FAMILIES.has(family);
  });
}
