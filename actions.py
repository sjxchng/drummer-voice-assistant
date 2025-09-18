# actions.py
import os, time, threading, webbrowser
from dataclasses import dataclass, field

# Optional TTS
try:
    import pyttsx3
    _tts = pyttsx3.init()
    TTS_ON = True
except Exception:
    _tts = None; TTS_ON = False

def speak(text: str):
    print(f"[Assistant] {text}")
    if TTS_ON:
        try:
            _tts.say(text); _tts.runAndWait()
        except Exception:
            pass

# ---- Metronome (print tick; easy to swap with audio) ----
class Metronome(threading.Thread):
    def __init__(self, bpm=100):
        super().__init__(daemon=True)
        self._bpm = max(20, min(300, int(bpm)))
        self._interval = 60.0 / self._bpm
        self._running = threading.Event()
        self._stop_all = threading.Event()
        self._beat = 0
        self._subdivision = 1  # quarter by default

    def set_bpm(self, bpm):
        self._bpm = max(20, min(300, int(bpm)))
        self._interval = 60.0 / self._bpm / max(1, self._subdivision)
        speak(f"Tempo set to {self._bpm} BPM.")

    def increase(self, delta): self.set_bpm(self._bpm + int(delta))
    def decrease(self, delta): self.set_bpm(self._bpm - int(delta))

    def set_subdivision(self, sub: str):
        mapping = {"quarter":1, "eighth":2, "triplet":3, "sixteenth":4}
        if sub in mapping:
            self._subdivision = mapping[sub]
            self._interval = 60.0 / self._bpm / self._subdivision
            speak(f"Subdivision set to {sub}.")

    @property
    def bpm(self): return self._bpm

    def run(self):
        while not self._stop_all.is_set():
            if self._running.is_set():
                self._beat = (self._beat % (4*self._subdivision)) + 1
                print(f"[Tick] {self._beat}")
                time.sleep(self._interval)
            else:
                time.sleep(0.02)

    def start_click(self):
        if not self.is_alive(): self.start()
        self._running.set(); speak("Metronome started.")

    def stop_click(self):
        self._running.clear(); speak("Metronome stopped.")

    def shutdown(self):
        self._running.clear(); self._stop_all.set()

# ---- Page turner via browser (PDF #page=N anchor) ----
@dataclass
class PageTurner:
    pdf_path: str
    current_page: int = 1
    total_pages: int = field(default=None)

    def __post_init__(self):
        if not os.path.exists(self.pdf_path):
            raise FileNotFoundError(self.pdf_path)

    def _open_page(self):
        url = f"file://{os.path.abspath(self.pdf_path)}#page={self.current_page}"
        webbrowser.open(url)

    def next_page(self):
        self.current_page += 1
        speak(f"Page {self.current_page}.")
        self._open_page()

    def prev_page(self):
        if self.current_page > 1:
            self.current_page -= 1
        speak(f"Page {self.current_page}.")
        self._open_page()

    def goto_page(self, n: int):
        self.current_page = max(1, int(n))
        speak(f"Page {self.current_page}.")
        self._open_page()

# ---- Dispatcher ----
@dataclass
class State:
    metronome: Metronome
    pager: PageTurner|None
    scheduled_timer: threading.Timer|None = None

def do_action(intent: dict, state: State):
    name = intent.get("name")
    if name == "unknown":
        speak("Sorry, I didn’t understand. Say 'help' for options.")
        return

    if name == "start_met": state.metronome.start_click(); return
    if name == "stop_met":  state.metronome.stop_click(); return

    if name == "set_tempo":
        bpm = intent.get("bpm")
        if bpm: state.metronome.set_bpm(bpm)
        else: speak("Say a BPM number, like 'set tempo to 120'.")
        return

    if name == "inc_tempo": state.metronome.increase(intent.get("delta", 5)); return
    if name == "dec_tempo": state.metronome.decrease(intent.get("delta", 5)); return
    if name == "what_tempo": speak(f"Tempo is {state.metronome.bpm} BPM."); return

    if name == "set_subdivision":
        sub = (intent.get("sub") or "").lower()
        if sub: state.metronome.set_subdivision(sub)
        else: speak("Say a subdivision: quarter, eighth, triplet, sixteenth.")
        return

    # pages
    if name == "next_page":
        if state.pager: state.pager.next_page()
        else: speak("No PDF loaded."); return
    if name == "prev_page":
        if state.pager: state.pager.prev_page()
        else: speak("No PDF loaded."); return
    if name == "goto_page":
        page = intent.get("page")
        if state.pager and page: state.pager.goto_page(page)
        else: speak("Say 'go to page N'.")
        return

    if name == "schedule_page_turn":
        bars = intent.get("bars")
        if not (state.pager and bars):
            speak("Say 'turn page in N bars'."); return
        seconds = int(bars) * 4 * (60.0 / state.metronome.bpm)  # assume 4/4
        if state.scheduled_timer: state.scheduled_timer.cancel()
        state.scheduled_timer = threading.Timer(seconds, state.pager.next_page)
        state.scheduled_timer.start()
        speak(f"Okay, turning the page in {bars} bars.")
        return

    if name == "help":
        speak("Try: start/stop metronome, set tempo to 120, next page, go to page 5, turn page in 4 bars, quit.")
        return

    if name == "quit":
        speak("Goodbye."); os._exit(0)