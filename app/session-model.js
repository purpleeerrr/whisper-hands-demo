export const SESSION_STATES = Object.freeze({
  IDLE: 'IDLE',
  RECORDING: 'RECORDING',
  PAUSED: 'PAUSED',
  FINISHING: 'FINISHING',
  COMPLETE: 'COMPLETE',
});

export class SessionModel {
  constructor({ now = Date.now } = {}) {
    this.now = now;
    this.reset();
  }

  reset() {
    this.state = SESSION_STATES.IDLE;
    this.startedAt = null;
    this.completedAt = null;
    this.durationMs = 0;
    this.pausedAt = null;
    this.accumulatedPausedMs = 0;
    this.mode = 1;
    this.events = [];
    this.audioMarks = [];
    this.activeAudioMark = null;
  }

  elapsedAt(at = this.now()) {
    if (this.startedAt === null) return 0;
    const activePauseMs = this.pausedAt === null ? 0 : Math.max(0, at - this.pausedAt);
    return Math.max(0, at - this.startedAt - this.accumulatedPausedMs - activePauseMs);
  }

  apply(event, payload = {}) {
    const at = this.now();

    if (event === 'MODE') {
      const mode = Number(payload.mode);
      if (!Number.isInteger(mode) || mode < 1 || mode > 4) return { accepted: false, state: this.state };
      this.mode = mode;
      this.events.push({ event, atMs: this.elapsedAt(at), payload: { mode } });
      return { accepted: true, state: this.state };
    }

    if (event === 'VIDEO_TOGGLE') {
      if (this.state === SESSION_STATES.IDLE || this.state === SESSION_STATES.COMPLETE) {
        if (this.state === SESSION_STATES.COMPLETE) this.reset();
        this.startedAt = at;
        this.state = SESSION_STATES.RECORDING;
      } else if (this.state === SESSION_STATES.RECORDING) {
        this.state = SESSION_STATES.PAUSED;
        this.pausedAt = at;
      } else if (this.state === SESSION_STATES.PAUSED) {
        this.accumulatedPausedMs += Math.max(0, at - this.pausedAt);
        this.pausedAt = null;
        this.state = SESSION_STATES.RECORDING;
      } else {
        return { accepted: false, state: this.state };
      }
      this.events.push({ event, atMs: this.elapsedAt(at), state: this.state });
      return { accepted: true, state: this.state };
    }

    if (event === 'VIDEO_FINISH') {
      if (![SESSION_STATES.RECORDING, SESSION_STATES.PAUSED].includes(this.state)) {
        return { accepted: false, state: this.state };
      }
      this.closeAudioMark(at);
      this.state = SESSION_STATES.COMPLETE;
      this.completedAt = at;
      this.durationMs = this.elapsedAt(at);
      this.events.push({ event, atMs: this.durationMs, state: this.state });
      return { accepted: true, state: this.state };
    }

    if (![SESSION_STATES.RECORDING, SESSION_STATES.PAUSED].includes(this.state)) {
      return { accepted: false, state: this.state };
    }

    if (event === 'AUDIO_MARK_START') {
      if (this.activeAudioMark) return { accepted: false, state: this.state };
      this.activeAudioMark = { startedAtMs: this.elapsedAt(at) };
    } else if (event === 'AUDIO_MARK_STOP') {
      if (!this.activeAudioMark) return { accepted: false, state: this.state };
      this.closeAudioMark(at);
    } else if (event !== 'SNAPSHOT') {
      return { accepted: false, state: this.state };
    }

    this.events.push({ event, atMs: this.elapsedAt(at), payload: { ...payload } });
    return { accepted: true, state: this.state };
  }

  closeAudioMark(at = this.now()) {
    if (!this.activeAudioMark) return null;
    const mark = {
      startedAtMs: this.activeAudioMark.startedAtMs,
      endedAtMs: this.elapsedAt(at),
    };
    this.audioMarks.push(mark);
    this.activeAudioMark = null;
    return mark;
  }
}
