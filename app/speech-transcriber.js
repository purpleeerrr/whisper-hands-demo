export class SpeechTranscriber {
  constructor({ onUpdate = () => {}, onAvailability = () => {}, elapsed = () => 0, isPriority = () => false } = {}) {
    this.onUpdate = onUpdate;
    this.onAvailability = onAvailability;
    this.elapsed = elapsed;
    this.isPriority = isPriority;
    this.segments = [];
    this.running = false;
    this.recognition = null;
  }

  start() {
    const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
    if (!Recognition) {
      this.onAvailability(false);
      return false;
    }
    if (this.running) return true;
    this.running = true;
    this.onAvailability(true);
    this.recognition = new Recognition();
    this.recognition.lang = 'zh-CN';
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.onresult = (event) => {
      let interim = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = String(result[0]?.transcript || '').trim();
        if (!text) continue;
        if (result.isFinal) {
          this.segments.push({ atMs: this.elapsed(), text, priority: this.isPriority() });
        } else interim += text;
      }
      this.onUpdate([...this.segments], interim);
    };
    this.recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') this.running = false;
    };
    this.recognition.onend = () => {
      if (!this.running) return;
      setTimeout(() => {
        if (this.running) {
          try { this.recognition.start(); } catch { /* Chrome can still be closing the last session. */ }
        }
      }, 250);
    };
    try {
      this.recognition.start();
      return true;
    } catch {
      this.running = false;
      return false;
    }
  }

  stop() {
    this.running = false;
    try { this.recognition?.stop(); } catch { /* Already stopped. */ }
  }

  replaceFromText(text) {
    const lines = String(text || '').split(/\n+/).map((line) => line.trim()).filter(Boolean);
    this.segments = lines.map((line, index) => ({
      atMs: this.segments[index]?.atMs ?? this.elapsed(),
      priority: this.segments[index]?.priority ?? false,
      text: line,
    }));
    this.onUpdate([...this.segments], '');
  }
}
