// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Speech = typeof import('../../../src/client/speech.ts');
let speech: Speech;

class FakeUtterance {
  voice: unknown = null;
  lang = '';
  rate = 1;
  constructor(public text: string) {}
}

function installSynthesis(voices: { lang: string; localService: boolean; name: string }[]) {
  const synth = Object.assign(new EventTarget(), {
    getVoices: vi.fn(() => voices),
    speak: vi.fn(),
    cancel: vi.fn(),
  });
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  return synth;
}

beforeEach(async () => {
  vi.resetModules();
  document.documentElement.lang = 'en';
  speech = await import('../../../src/client/speech.ts');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Listen (on-device text to speech only)', () => {
  it('speaks with a local voice', () => {
    const synth = installSynthesis([
      { lang: 'en-US', localService: false, name: 'Cloud voice' },
      { lang: 'en-US', localService: true, name: 'Device voice' },
    ]);
    expect(speech.canListen()).toBe(true);
    expect(speech.speak('Hello')).toBe(true);
    const utterance = synth.speak.mock.calls[0]?.[0] as FakeUtterance;
    expect(utterance.text).toBe('Hello');
    expect((utterance.voice as { name: string }).name).toBe('Device voice');
    speech.stopSpeaking();
    expect(synth.cancel).toHaveBeenCalled();
  });

  it('refuses cloud-only voices', () => {
    installSynthesis([{ lang: 'en-US', localService: false, name: 'Cloud voice' }]);
    expect(speech.canListen()).toBe(false);
    expect(speech.speak('Hello')).toBe(false);
  });

  it('calls back once when local voices load late', () => {
    const voices: { lang: string; localService: boolean; name: string }[] = [];
    const synth = installSynthesis(voices);
    const callback = vi.fn();
    speech.onLocalVoicesLoaded(callback);
    voices.push({ lang: 'en-GB', localService: true, name: 'Device voice' });
    synth.dispatchEvent(new Event('voiceschanged'));
    expect(callback).toHaveBeenCalledOnce();
  });
});

describe('Speak (on-device speech recognition only)', () => {
  it('is unavailable without on-device support', async () => {
    expect(speech.mightSpeakLocally()).toBe(false);
    expect(await speech.canSpeakLocally()).toBe(false);
    expect(speech.createLocalRecognizer()).toBeNull();

    class CloudOnly extends EventTarget {
      static available = vi.fn(() => Promise.resolve('unavailable'));
    }
    vi.stubGlobal('SpeechRecognition', CloudOnly);
    expect(await speech.canSpeakLocally()).toBe(false);
    // No processLocally property: would send audio to a server, so refused.
    expect(speech.createLocalRecognizer()).toBeNull();
  });

  it('turns speech into text on the device', async () => {
    class Local extends EventTarget {
      static last: Local | undefined;
      static available = vi.fn(() => Promise.resolve('available'));
      processLocally = false;
      lang = '';
      interimResults = false;
      continuous = true;
      start = vi.fn();
      stop = vi.fn();
      constructor() {
        super();
        Local.last = this;
      }
    }
    vi.stubGlobal('SpeechRecognition', Local);
    // processLocally is an instance field here, so the cheap check can't see it.
    expect(speech.mightSpeakLocally()).toBe(false);
    Object.defineProperty(Local.prototype, 'processLocally', { value: false, writable: true });
    expect(speech.mightSpeakLocally()).toBe(true);
    expect(await speech.canSpeakLocally()).toBe(true);
    const recognizer = speech.createLocalRecognizer()!;
    const instance = Local.last!;
    expect(instance.processLocally).toBe(true);
    expect(instance.interimResults).toBe(true);

    const onText = vi.fn();
    const onEnd = vi.fn();
    recognizer.onText = onText;
    recognizer.onEnd = onEnd;
    recognizer.start();
    expect(instance.start).toHaveBeenCalled();

    instance.dispatchEvent(
      Object.assign(new Event('result'), {
        results: [Object.assign([{ transcript: 'Dana ' }], { isFinal: true })],
      }),
    );
    expect(onText).toHaveBeenCalledWith('Dana', true);
    instance.dispatchEvent(new Event('end'));
    expect(onEnd).toHaveBeenCalled();
    recognizer.stop();
    expect(instance.stop).toHaveBeenCalled();
  });

  it('Take a break discards what was heard: no text and no end callback (UC-BRK-01 AC09)', () => {
    class Local extends EventTarget {
      static available = vi.fn(() => Promise.resolve('available'));
      processLocally = false;
      lang = '';
      interimResults = false;
      continuous = false;
      start = vi.fn();
      stop = vi.fn(() => {
        this.dispatchEvent(new Event('end'));
      });
    }
    vi.stubGlobal('SpeechRecognition', Local);
    const recognizer = speech.createLocalRecognizer()!;
    const onText = vi.fn();
    const onEnd = vi.fn();
    recognizer.onText = onText;
    recognizer.onEnd = onEnd;
    recognizer.start();
    speech.abortListening();
    expect(onEnd).not.toHaveBeenCalled();
    expect(onText).not.toHaveBeenCalled();
    // Nothing is listening any more, so a second abort does nothing.
    speech.abortListening();
  });
});
