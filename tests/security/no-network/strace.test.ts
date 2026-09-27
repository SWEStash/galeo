import { describe, expect, it } from 'vitest';
import { networkConnects } from './strace';

describe('networkConnects', () => {
  it('ignores Unix, netlink and unspecified-family connects', () => {
    const log = [
      '4242  connect(12, {sa_family=AF_UNIX, sun_path="/run/user/1000/bus"}, 110) = 0',
      '4243  connect(7, {sa_family=AF_UNIX, sun_path=@"/tmp/.X11-unix/X99"}, 20) = 0',
      '4250  connect(9, {sa_family=AF_NETLINK, nl_pid=0, nl_groups=00000000}, 12) = 0',
      '4251  connect(9, {sa_family=AF_UNSPEC, sa_data="\\0\\0\\0\\0"}, 16) = 0',
      '4252  socket(AF_INET, SOCK_DGRAM, IPPROTO_IP) = 5',
    ].join('\n');
    expect(networkConnects(log)).toEqual([]);
  });

  it('reports IPv4 and IPv6 connects, whatever their result', () => {
    const v4 = '4300  connect(45, {sa_family=AF_INET, sin_port=htons(53), sin_addr=inet_addr("127.0.0.53")}, 16) = 0';
    const v6 =
      '4301  connect(46, {sa_family=AF_INET6, sin6_port=htons(443), sin6_flowinfo=htonl(0), inet_pton(AF_INET6, "2606:4700::6810:85e5", &sin6_addr), sin6_scope_id=0}, 28) = -1 EINPROGRESS (Operation now in progress)';
    expect(networkConnects(`${v4}\n${v6}\n`)).toEqual([v4, v6]);
  });

  it('reports a connect split by another thread (unfinished/resumed)', () => {
    const start = '4400  connect(50, {sa_family=AF_INET, sin_port=htons(443), sin_addr=inet_addr("93.184.215.14")}, 16 <unfinished ...>';
    const log = [start, '4401  futex(0x7f, FUTEX_WAKE, 1) = 0', '4400  <... connect resumed>) = 0'].join('\n');
    expect(networkConnects(log)).toEqual([start]);
  });

  it('treats a connect whose address strace could not decode as a violation', () => {
    const undecoded = '4500  connect(51, 0x7ffd5a1b2c30, 16) = -1 EFAULT (Bad address)';
    expect(networkConnects(undecoded)).toEqual([undecoded]);
  });
});
