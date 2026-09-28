/** Fire-and-forget: analytics should never interrupt playback if the network is down. */
export function recordBeatPlay(beatId: number) {
  void fetch(`/api/beats/${beatId}/plays`, { method: "POST", keepalive: true }).catch(() => {});
}
