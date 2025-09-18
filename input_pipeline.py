# input_pipeline.py
import os

# Try Vosk (offline ASR)
_HAS_VOSK = False
try:
    import vosk, sounddevice as sd, json as _json
    _HAS_VOSK = True
except Exception:
    _HAS_VOSK = False

# Try SpeechRecognition (cloud-ish)
_sr = None
try:
    import speech_recognition as sr
    _sr = sr
except Exception:
    _sr = None

def text_input_loop():
    print("[Text Mode] Type commands (or 'quit').")
    while True:
        try:
            line = input("\n[You] ").strip()
        except (EOFError, KeyboardInterrupt):
            line = "quit"
        if not line:
            continue
        yield line

def voice_loop_vosk(wake_word="maestro", model_path=None):
    if not _HAS_VOSK:
        return None
    if model_path is None:
        model_path = os.environ.get("VOSK_MODEL", None)
    if not model_path or not os.path.isdir(model_path):
        print("[Vosk] Model not found. Set VOSK_MODEL env var to model folder.")
        return None

    import queue, time
    print(f"[Voice: Vosk] Say wake word '{wake_word}' then your command. Ctrl+C to stop.")
    model = vosk.Model(model_path)
    samplerate = 16000
    q = queue.Queue()

    def _callback(indata, frames, time_info, status):
        q.put(bytes(indata))

    with sd.RawInputStream(samplerate=samplerate, blocksize=8000, dtype='int16',
                           channels=1, callback=_callback):
        rec = vosk.KaldiRecognizer(model, samplerate)
        heard_wake = False
        try:
            while True:
                data = q.get()
                if rec.AcceptWaveform(data):
                    j = rec.Result()
                    text = (_json.loads(j).get("text", "") if isinstance(j, str) else "").strip()
                else:
                    j = rec.PartialResult()
                    text = (_json.loads(j).get("partial", "") if isinstance(j, str) else "").strip()
                if not text:
                    continue
                print(f"[Heard] {text}")
                if not heard_wake:
                    if wake_word in text.lower().split():
                        heard_wake = True
                        print("[Assistant] Yes?")
                    continue
                yield text
                heard_wake = False
        except KeyboardInterrupt:
            print("\n[Voice: Vosk] Stopped.")
            return

def voice_loop_sr(wake_word="maestro"):
    if _sr is None:
        return None
    r = _sr.Recognizer()
    try:
        mic = _sr.Microphone()
    except Exception as e:
        print("[SR] No microphone:", e)
        return None

    print(f"[Voice: SR] Say wake word '{wake_word}' then your command. Ctrl+C to stop.")
    heard_wake = False
    try:
        while True:
            with mic as source:
                r.adjust_for_ambient_noise(source, duration=0.4)
                audio = r.listen(source, phrase_time_limit=4)
            try:
                utter = r.recognize_google(audio)
                print(f"[Heard] {utter}")
                u = utter.strip().lower()
                if not heard_wake:
                    if wake_word in u.split():
                        heard_wake = True
                        print("[Assistant] Yes?")
                    continue
                yield utter
                heard_wake = False
            except Exception:
                print("[Assistant] Sorry, I didn't catch that.")
    except KeyboardInterrupt:
        print("\n[Voice: SR] Stopped.")
        return

def input_stream(prefer="text", wake_word="maestro", vosk_model_path=None):
    """Yield utterances from the first available mode. Fallback to text."""
    if prefer == "vosk":
        gen = voice_loop_vosk(wake_word=wake_word, model_path=vosk_model_path)
        if gen: return gen
        gen = voice_loop_sr(wake_word=wake_word)
        if gen: return gen
        return text_input_loop()
    if prefer == "sr":
        gen = voice_loop_sr(wake_word=wake_word)
        if gen: return gen
        gen = voice_loop_vosk(wake_word=wake_word, model_path=vosk_model_path)
        if gen: return gen
        return text_input_loop()
    return text_input_loop()