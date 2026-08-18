import { selectRecorderMimeType } from './session-record.js';

export class RoadshowMediaController {
  constructor({
    canvas,
    source,
    mediaDevices = globalThis.navigator?.mediaDevices,
    MediaRecorderCtor = globalThis.MediaRecorder,
    MediaStreamCtor = globalThis.MediaStream,
    scheduleFrame = globalThis.requestAnimationFrame?.bind(globalThis),
    cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis),
    frameRate = 15,
  }) {
    this.canvas = canvas;
    this.source = source;
    this.context = canvas?.getContext?.('2d');
    this.mediaDevices = mediaDevices;
    this.MediaRecorderCtor = MediaRecorderCtor;
    this.MediaStreamCtor = MediaStreamCtor;
    this.scheduleFrame = scheduleFrame || ((callback) => setTimeout(callback, 66));
    this.cancelFrame = cancelFrame || clearTimeout;
    this.frameRate = frameRate;
    this.frameRequest = null;
    this.microphoneStream = null;
    this.canvasStream = null;
    this.combinedStream = null;
    this.recorder = null;
    this.chunks = [];
  }

  setSource(source) {
    this.source = source;
  }

  sourceDimensions() {
    return {
      width: Number(this.source?.naturalWidth || this.source?.videoWidth || 0),
      height: Number(this.source?.naturalHeight || this.source?.videoHeight || 0),
    };
  }

  drawFrame() {
    if (!this.context || !this.source) return false;
    const { width, height } = this.sourceDimensions();
    if (!width || !height) return false;
    this.context.drawImage(this.source, 0, 0, this.canvas.width, this.canvas.height);
    return true;
  }

  render = () => {
    this.drawFrame();
    this.frameRequest = this.scheduleFrame(this.render);
  };

  async start() {
    if (!this.mediaDevices?.getUserMedia) throw new Error('浏览器无法访问麦克风');
    if (!this.MediaRecorderCtor || !this.MediaStreamCtor) throw new Error('当前浏览器不支持录像');
    if (this.recorder && this.recorder.state !== 'inactive') return;

    this.microphoneStream = await this.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    this.canvasStream = this.canvas.captureStream(this.frameRate);
    this.combinedStream = new this.MediaStreamCtor([
      ...this.canvasStream.getVideoTracks(),
      ...this.microphoneStream.getAudioTracks(),
    ]);
    const mimeType = selectRecorderMimeType(this.MediaRecorderCtor);
    this.recorder = new this.MediaRecorderCtor(this.combinedStream, mimeType ? { mimeType } : undefined);
    this.chunks = [];
    this.recorder.ondataavailable = (event) => {
      if (event.data?.size) this.chunks.push(event.data);
    };
    this.render();
    this.recorder.start(1_000);
  }

  pause() {
    if (this.recorder?.state === 'recording') this.recorder.pause();
  }

  resume() {
    if (this.recorder?.state === 'paused') this.recorder.resume();
  }

  snapshot() {
    this.drawFrame();
    return new Promise((resolve, reject) => {
      this.canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('截屏失败')), 'image/png');
    });
  }

  async finish() {
    if (!this.recorder || this.recorder.state === 'inactive') throw new Error('当前没有正在录制的内容');
    const mimeType = this.recorder.mimeType || selectRecorderMimeType(this.MediaRecorderCtor) || 'video/webm';
    const videoBlob = await new Promise((resolve, reject) => {
      this.recorder.onerror = (event) => reject(event.error || new Error('录像保存失败'));
      this.recorder.onstop = () => resolve(new Blob(this.chunks, { type: mimeType }));
      this.recorder.stop();
    });
    this.stopTracks();
    return videoBlob;
  }

  stopTracks() {
    if (this.frameRequest !== null) this.cancelFrame(this.frameRequest);
    this.frameRequest = null;
    for (const stream of [this.microphoneStream, this.canvasStream]) {
      for (const track of stream?.getTracks?.() || []) track.stop();
    }
  }
}
