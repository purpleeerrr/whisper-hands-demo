import test from 'node:test';
import assert from 'node:assert/strict';

import { RoadshowMediaController } from '../app/media-controller.js';

class FakeTrack {
  constructor(kind) { this.kind = kind; this.stopped = false; }
  stop() { this.stopped = true; }
}

class FakeMediaStream {
  constructor(tracks = []) { this.tracks = tracks; }
  getTracks() { return this.tracks; }
  getAudioTracks() { return this.tracks.filter((track) => track.kind === 'audio'); }
  getVideoTracks() { return this.tracks.filter((track) => track.kind === 'video'); }
}

class FakeMediaRecorder {
  static isTypeSupported() { return true; }
  constructor(stream, options) {
    this.stream = stream;
    this.options = options;
    this.state = 'inactive';
  }
  start() { this.state = 'recording'; }
  pause() { this.state = 'paused'; }
  resume() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['recorded'], { type: 'video/webm' }) });
    this.onstop?.();
  }
}

function fixture() {
  const audioTrack = new FakeTrack('audio');
  const videoTrack = new FakeTrack('video');
  const drawCalls = [];
  const canvas = {
    width: 640,
    height: 480,
    getContext: () => ({ drawImage: (...args) => drawCalls.push(args), fillRect() {} }),
    captureStream: () => new FakeMediaStream([videoTrack]),
    toBlob: (callback) => callback(new Blob(['snapshot'], { type: 'image/png' })),
  };
  const source = { naturalWidth: 640, naturalHeight: 480 };
  const mediaDevices = { getUserMedia: async () => new FakeMediaStream([audioTrack]) };
  const controller = new RoadshowMediaController({
    canvas,
    source,
    mediaDevices,
    MediaRecorderCtor: FakeMediaRecorder,
    MediaStreamCtor: FakeMediaStream,
    scheduleFrame: () => 1,
    cancelFrame: () => {},
  });
  return { controller, audioTrack, videoTrack, drawCalls };
}

test('records canvas video and microphone audio in one stream', async () => {
  const { controller } = fixture();
  await controller.start();

  assert.equal(controller.recorder.state, 'recording');
  assert.equal(controller.recorder.stream.getVideoTracks().length, 1);
  assert.equal(controller.recorder.stream.getAudioTracks().length, 1);
});

test('pause and resume control the same recorder', async () => {
  const { controller } = fixture();
  await controller.start();
  controller.pause();
  assert.equal(controller.recorder.state, 'paused');
  controller.resume();
  assert.equal(controller.recorder.state, 'recording');
});

test('snapshot returns a PNG from the current T5 frame', async () => {
  const { controller, drawCalls } = fixture();
  controller.drawFrame();
  const image = await controller.snapshot();

  assert.equal(image.type, 'image/png');
  assert.equal(drawCalls.length, 2);
});

test('finish returns a WebM and releases microphone and canvas tracks', async () => {
  const { controller, audioTrack, videoTrack } = fixture();
  await controller.start();
  const video = await controller.finish();

  assert.match(video.type, /^video\/webm/);
  assert.equal(audioTrack.stopped, true);
  assert.equal(videoTrack.stopped, true);
});
