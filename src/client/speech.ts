/**
 * Listen (text to speech) and Speak (speech to text), on the device only.
 *
 * The wireframes promise: "When you speak, your voice is only turned into
 * text. The recording is never kept." Browsers can quietly send audio or text
 * to a cloud service, so this module only uses:
 * - speech synthesis voices that report `localService: true`, and
 * - speech recognition that supports `processLocally` and says on-device
 *   recognition is available.
 * If the device can't do either locally, the matching button is not shown.
 */

let localVoice: SpeechSynthesisVoice | null | undefined;

function pickLocalVoice(): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices().filter((v) => v.localService);
  const lang = document.documentElement.lang || 'en';
  return (
    voices.find((v) => v.lang.toLowerCase().startsWith(`${lang.toLowerCase()}-us`)) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(lang.toLowerCase())) ??
    null
  );
}

export function canListen(): boolean {
  if (localVoice === undefined || localVoice === null) localVoice = pickLocalVoice();
  return localVoice !== null;
}

/**
 * Some browsers load voices after the page. If a local voice turns up later,
 * calls back once so the page can show its Listen buttons. Does nothing if
 * voices were already known.
 */
export function onLocalVoicesLoaded(callback: () => void): void {
  if (!('speechSynthesis' in window)) return;
  if (window.speechSynthesis.getVoices().length > 0) return;
  window.speechSynthesis.addEventListener(
    'voiceschanged',
    () => {
      localVoice = pickLocalVoice();
      if (localVoice) callback();
    },
    { once: true },
  );
}

export function speak(text: string): boolean {
  if (!canListen() || !localVoice) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = localVoice;
  utterance.lang = localVoice.lang;
  utterance.rate = 0.95;
  window.speechSynthesis.speak(utterance);
  return true;
}

export function stopSpeaking(): void {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

// ---- Speech recognition -------------------------------------------------------

interface RecognitionResultEvent extends Event {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

export interface LocalRecognizer {
  start(): void;
  stop(): void;
  onText: (text: string, final: boolean) => void;
  onEnd: () => void;
}

interface RecognitionInstance extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  processLocally?: boolean;
  start(): void;
  stop(): void;
}

interface RecognitionConstructor {
  new (): RecognitionInstance;
  available?: (options: { langs: string[]; processLocally: boolean }) => Promise<string>;
}

function recognitionClass(): RecognitionConstructor | null {
  const w = window as unknown as Record<string, unknown>;
  const ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
    RecognitionConstructor | undefined;
  return ctor ?? null;
}

/** True only when the browser confirms recognition will run on this device. */
export async function canSpeakLocally(): Promise<boolean> {
  const Ctor = recognitionClass();
  if (!Ctor || typeof Ctor.available !== 'function') return false;
  try {
    const status = await Ctor.available({ langs: ['en-US'], processLocally: true });
    return status === 'available';
  } catch {
    return false;
  }
}

export function createLocalRecognizer(): LocalRecognizer | null {
  const Ctor = recognitionClass();
  if (!Ctor) return null;
  const recognition = new Ctor();
  if (!('processLocally' in recognition)) return null;
  recognition.processLocally = true;
  recognition.lang = 'en-US';
  recognition.interimResults = true;
  recognition.continuous = false;

  const recognizer: LocalRecognizer = {
    start: () => {
      recognition.start();
    },
    stop: () => {
      recognition.stop();
    },
    onText: () => undefined,
    onEnd: () => undefined,
  };
  recognition.addEventListener('result', (event) => {
    const results = (event as RecognitionResultEvent).results;
    let text = '';
    let final = false;
    for (let i = 0; i < results.length; i += 1) {
      const result = results[i];
      if (!result) continue;
      text += result[0]?.transcript ?? '';
      final = result.isFinal;
    }
    recognizer.onText(text.trim(), final);
  });
  recognition.addEventListener('end', () => {
    recognizer.onEnd();
  });
  recognition.addEventListener('error', () => {
    recognizer.onEnd();
  });
  return recognizer;
}
