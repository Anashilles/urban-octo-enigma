"use client";

import { api } from "@/lib/api/client";
import { useRealtimeStore } from "@/store/realtime-store";
import { useVoiceStore, type VoiceError } from "@/store/voice-store";
import { player } from "@/three/runtime";
import type { Peer, VoiceSignal } from "@/features/realtime/protocol";
import { samplePose } from "@/features/realtime/remote-poses";

type Send = (msg: { t: "voice.state"; on: boolean; muted: boolean; speaking: boolean } | { t: "voice.signal"; to: string; data: VoiceSignal }) => void;

interface PeerLink {
  pc: RTCPeerConnection;
  pendingCandidates: RTCIceCandidateInit[];
  audio: HTMLAudioElement | null;
  source: MediaStreamAudioSourceNode | null;
  panner: PannerNode | null;
  gain: GainNode | null;
}

const EAR_HEIGHT = 1.6;

/**
 * Voice chat as a small WebRTC mesh: every pair of people with voice switched
 * on gets a direct audio connection (or a TURN relay when configured). The
 * realtime service only relays the signalling messages. Remote voices are
 * spatialised with Web Audio so they come from the speaker's avatar.
 *
 * Media between browsers is encrypted in transit by WebRTC (DTLS-SRTP); a
 * TURN relay, when used, forwards it without decrypting. Nothing is recorded.
 */
export class VoiceManager {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private links = new Map<string, PeerLink>();
  private iceServers: RTCIceServer[] = [];
  private iceTransportPolicy: RTCIceTransportPolicy = "all";
  private loop: ReturnType<typeof setInterval> | null = null;
  private speakingSince = 0;
  private lastLoud = 0;
  private lastStateSent = "";

  constructor(private readonly send: Send) {}

  get active() {
    return useVoiceStore.getState().status === "on";
  }

  async join(deviceId?: string) {
    const store = useVoiceStore;
    if (store.getState().status !== "off") return;
    store.setState({ status: "starting", error: null });
    try {
      type Ice = { iceServers: RTCIceServer[]; iceTransportPolicy?: RTCIceTransportPolicy };
      const ice = await api<Ice>("/api/realtime/ice").catch((): Ice => ({ iceServers: [] }));
      this.iceServers = ice.iceServers;
      this.iceTransportPolicy = ice.iceTransportPolicy ?? "all";
      // Created inside the click handler's task so browsers allow playback.
      const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      this.ctx = AudioCtx ? new AudioCtx() : null;
      await this.ctx?.resume().catch(() => undefined);

      let listenOnly = false;
      let error: VoiceError = null;
      try {
        this.stream = await this.openMicrophone(deviceId);
      } catch (e) {
        listenOnly = true;
        error = this.classify(e);
      }
      if (this.stream && this.ctx) {
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 512;
        this.ctx.createMediaStreamSource(this.stream).connect(this.analyser);
      }
      store.setState({ status: "on", muted: listenOnly, listenOnly, error, deviceId: deviceId ?? this.trackDeviceId() });
      void this.refreshDevices();
      this.publishState(true);
      this.loop = setInterval(() => this.tick(), 100);
      this.syncPeers(useRealtimeStore.getState().peers);
    } catch (e) {
      this.leave();
      store.setState({ error: this.classify(e) });
    }
  }

  leave() {
    for (const id of [...this.links.keys()]) this.closeLink(id, true);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.analyser = null;
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    const wasOn = useVoiceStore.getState().status !== "off";
    useVoiceStore.setState({ status: "off", muted: false, listenOnly: false, speaking: false, connected: {} });
    if (wasOn) this.send({ t: "voice.state", on: false, muted: true, speaking: false });
    this.lastStateSent = "";
  }

  setMuted(muted: boolean) {
    const s = useVoiceStore.getState();
    if (s.status !== "on" || s.listenOnly) return;
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
    useVoiceStore.setState({ muted, speaking: muted ? false : s.speaking });
    this.publishState(true);
  }

  async switchDevice(deviceId: string) {
    if (!this.active || useVoiceStore.getState().listenOnly) return;
    const next = await this.openMicrophone(deviceId);
    const track = next.getAudioTracks()[0]!;
    track.enabled = !useVoiceStore.getState().muted;
    for (const link of this.links.values()) {
      const sender = link.pc.getSenders().find((s) => s.track?.kind === "audio" || s.track === null);
      await sender?.replaceTrack(track);
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = next;
    if (this.ctx) {
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.ctx.createMediaStreamSource(next).connect(this.analyser);
    }
    useVoiceStore.setState({ deviceId });
  }

  /** Opens or closes connections to match who currently has voice on. */
  syncPeers(peers: Record<string, Peer>) {
    if (!this.active) return;
    const selfId = useRealtimeStore.getState().selfId;
    for (const [id] of this.links) {
      if (!peers[id]?.voice.on) this.closeLink(id, false);
    }
    for (const peer of Object.values(peers)) {
      if (!selfId || peer.id === selfId || !peer.voice.on || this.links.has(peer.id)) continue;
      // The smaller connection id makes the offer, so exactly one side does.
      if (selfId < peer.id) void this.offer(peer.id);
    }
  }

  async handleSignal(from: string, data: VoiceSignal) {
    if (!this.active) return;
    if (data.type === "bye") return this.closeLink(from, false);
    if (data.type === "offer" && data.sdp) {
      const link = this.links.get(from) ?? this.createLink(from);
      await link.pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
      const transceiver = link.pc.getTransceivers()[0];
      if (transceiver) {
        transceiver.direction = this.stream ? "sendrecv" : "recvonly";
        if (this.stream) await transceiver.sender.replaceTrack(this.stream.getAudioTracks()[0] ?? null);
      }
      await this.flushCandidates(link);
      const answer = await link.pc.createAnswer();
      await link.pc.setLocalDescription(answer);
      this.send({ t: "voice.signal", to: from, data: { type: "answer", sdp: answer.sdp ?? "" } });
      return;
    }
    const link = this.links.get(from);
    if (!link) return;
    if (data.type === "answer" && data.sdp) {
      await link.pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
      await this.flushCandidates(link);
    } else if (data.type === "candidate" && data.candidate) {
      if (link.pc.remoteDescription) await link.pc.addIceCandidate(data.candidate).catch(() => undefined);
      else link.pendingCandidates.push(data.candidate);
    }
  }

  peerLeft(id: string) {
    this.closeLink(id, false);
  }

  /** After a reconnect the service knows nothing about us: announce again and reconnect audio. */
  resync() {
    if (!this.active) return;
    for (const id of [...this.links.keys()]) this.closeLink(id, false);
    this.publishState(true);
    this.syncPeers(useRealtimeStore.getState().peers);
  }

  /** How each connected peer is reached: candidate types of the selected pair (diagnostics and tests). */
  async routes(): Promise<Array<{ peerId: string; local: string; remote: string }>> {
    const out: Array<{ peerId: string; local: string; remote: string }> = [];
    for (const [peerId, link] of this.links) {
      const stats = await link.pc.getStats();
      let pairId: string | undefined;
      stats.forEach((r) => {
        if (r.type === "transport" && r.selectedCandidatePairId) pairId = r.selectedCandidatePairId;
      });
      const pair = pairId ? stats.get(pairId) : undefined;
      if (!pair) continue;
      out.push({ peerId, local: stats.get(pair.localCandidateId)?.candidateType ?? "?", remote: stats.get(pair.remoteCandidateId)?.candidateType ?? "?" });
    }
    return out;
  }

  private async offer(peerId: string) {
    const link = this.createLink(peerId);
    const transceiver = link.pc.addTransceiver("audio", { direction: this.stream ? "sendrecv" : "recvonly" });
    if (this.stream) await transceiver.sender.replaceTrack(this.stream.getAudioTracks()[0] ?? null);
    const offer = await link.pc.createOffer();
    await link.pc.setLocalDescription(offer);
    this.send({ t: "voice.signal", to: peerId, data: { type: "offer", sdp: offer.sdp ?? "" } });
  }

  private createLink(peerId: string): PeerLink {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers, iceTransportPolicy: this.iceTransportPolicy });
    const link: PeerLink = { pc, pendingCandidates: [], audio: null, source: null, panner: null, gain: null };
    this.links.set(peerId, link);
    this.setConnected(peerId, "connecting");
    pc.onicecandidate = (e) => {
      if (e.candidate) this.send({ t: "voice.signal", to: peerId, data: { type: "candidate", candidate: e.candidate.toJSON() as never } });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") this.setConnected(peerId, "connected");
      else if (pc.connectionState === "failed") this.setConnected(peerId, "failed");
    };
    pc.ontrack = (e) => this.attachRemote(link, e.streams[0] ?? new MediaStream([e.track]));
    return link;
  }

  private attachRemote(link: PeerLink, stream: MediaStream) {
    // Chrome only feeds remote WebRTC audio into Web Audio when the stream is
    // also attached to a media element, so keep a muted one alongside.
    const audio = new Audio();
    audio.srcObject = stream;
    audio.autoplay = true;
    link.audio = audio;
    if (this.ctx) {
      audio.muted = true;
      const source = this.ctx.createMediaStreamSource(stream);
      const panner = this.ctx.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = 2;
      panner.rolloffFactor = 0.8;
      panner.maxDistance = 40;
      const gain = this.ctx.createGain();
      source.connect(panner).connect(gain).connect(this.ctx.destination);
      Object.assign(link, { source, panner, gain });
    }
    void audio.play().catch(() => undefined);
  }

  private closeLink(id: string, notify: boolean) {
    const link = this.links.get(id);
    if (!link) return;
    this.links.delete(id);
    if (notify) this.send({ t: "voice.signal", to: id, data: { type: "bye" } });
    link.pc.close();
    link.source?.disconnect();
    link.gain?.disconnect();
    if (link.audio) {
      link.audio.srcObject = null;
      link.audio.remove();
    }
    useVoiceStore.setState((s) => {
      const connected = { ...s.connected };
      delete connected[id];
      return { connected };
    });
  }

  private async flushCandidates(link: PeerLink) {
    for (const c of link.pendingCandidates.splice(0)) await link.pc.addIceCandidate(c).catch(() => undefined);
  }

  private setConnected(id: string, state: "connecting" | "connected" | "failed") {
    useVoiceStore.setState((s) => ({ connected: { ...s.connected, [id]: state } }));
  }

  /** Speaking detection and spatial positions, ten times a second. */
  private tick() {
    const now = performance.now();
    const s = useVoiceStore.getState();
    if (this.analyser && !s.muted) {
      const data = new Float32Array(this.analyser.fftSize);
      this.analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += v * v;
      const rms = Math.sqrt(sum / data.length);
      if (rms > 0.02) {
        this.lastLoud = now;
        if (!this.speakingSince) this.speakingSince = now;
      }
      const speaking = now - this.lastLoud < 450 && now - this.speakingSince > 120;
      if (now - this.lastLoud >= 450) this.speakingSince = 0;
      if (speaking !== s.speaking) {
        useVoiceStore.setState({ speaking });
        this.publishState(false);
      }
    }
    const ctx = this.ctx;
    if (!ctx) return;
    const l = ctx.listener;
    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    if (l.positionX) {
      l.positionX.value = player.x;
      l.positionY.value = EAR_HEIGHT;
      l.positionZ.value = player.z;
      l.forwardX.value = fx;
      l.forwardY.value = 0;
      l.forwardZ.value = fz;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      l.setPosition(player.x, EAR_HEIGHT, player.z);
      l.setOrientation(fx, 0, fz, 0, 1, 0);
    }
    for (const [id, link] of this.links) {
      const p = samplePose(id);
      if (!link.panner || !p) continue;
      if (link.panner.positionX) {
        link.panner.positionX.value = p.x;
        link.panner.positionY.value = EAR_HEIGHT;
        link.panner.positionZ.value = p.z;
      } else link.panner.setPosition(p.x, EAR_HEIGHT, p.z);
    }
  }

  private publishState(force: boolean) {
    const s = useVoiceStore.getState();
    const state = { on: s.status === "on", muted: s.muted, speaking: s.speaking && !s.muted };
    const key = JSON.stringify(state);
    if (!force && key === this.lastStateSent) return;
    this.lastStateSent = key;
    this.send({ t: "voice.state", ...state });
  }

  private async openMicrophone(deviceId?: string): Promise<MediaStream> {
    if (!window.isSecureContext) throw Object.assign(new Error("insecure"), { name: "InsecureContext" });
    if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error("unsupported"), { name: "NotSupportedError" });
    return navigator.mediaDevices.getUserMedia({
      audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
  }

  private trackDeviceId() {
    return this.stream?.getAudioTracks()[0]?.getSettings().deviceId ?? null;
  }

  private async refreshDevices() {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      useVoiceStore.setState({
        devices: all.filter((d) => d.kind === "audioinput").map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1}` })),
      });
    } catch {
      // Device labels are optional.
    }
  }

  private classify(e: unknown): VoiceError {
    const name = (e as { name?: string })?.name;
    if (name === "NotAllowedError" || name === "SecurityError") return "permission_denied";
    if (name === "NotFoundError" || name === "OverconstrainedError") return "no_microphone";
    if (name === "InsecureContext") return "insecure_context";
    if (name === "NotSupportedError") return "unsupported";
    return "failed";
  }
}
