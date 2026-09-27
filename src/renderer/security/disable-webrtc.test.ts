import { describe, expect, it } from 'vitest';
import { removeWebRtc } from './disable-webrtc';

describe('removeWebRtc', () => {
  it('removes every WebRTC entry point from the page global', () => {
    const global: Record<string, unknown> = {
      RTCPeerConnection: class {},
      webkitRTCPeerConnection: class {},
      RTCDataChannel: class {},
      RTCSessionDescription: class {},
      RTCIceCandidate: class {},
      fetch: () => undefined,
    };
    removeWebRtc(global);
    expect(Object.keys(global)).toEqual(['fetch']);
  });

  it('tolerates a global without WebRTC', () => {
    expect(() => removeWebRtc({})).not.toThrow();
  });
});
