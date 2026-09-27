const WEBRTC_GLOBALS = [
  'RTCPeerConnection',
  'webkitRTCPeerConnection',
  'RTCDataChannel',
  'RTCSessionDescription',
  'RTCIceCandidate',
];

/**
 * A reader never needs WebRTC, and gathering ICE candidates resolves hosts and probes routes below
 * the network guard (SR-06). The page's own script is the only one that runs, so deleting the
 * constructors at startup leaves nothing to call even after a sanitizer bypass.
 */
export function removeWebRtc(global: object): void {
  for (const name of WEBRTC_GLOBALS) Reflect.deleteProperty(global, name);
}
