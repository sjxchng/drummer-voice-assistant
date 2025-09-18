# app.py
import argparse, glob, os
from input_pipeline import input_stream
from nlu import nlu, ml_train
from actions import State, Metronome, PageTurner, do_action, speak

def main():
    ap = argparse.ArgumentParser(description="Drummer Voice Assistant")
    ap.add_argument("--pdf", type=str, help="Path to sheet-music PDF")
    ap.add_argument("--bpm", type=int, default=100)
    ap.add_argument("--input", type=str, default="text", choices=["text","vosk","sr"])
    ap.add_argument("--vosk-model", type=str, default=None, help="Path to Vosk model folder")
    args = ap.parse_args()

    # 🔹 if no --pdf, auto-pick first PDF in ./music/
    if not args.pdf:
        music_folder = os.path.join(os.getcwd(), "music")
        pdfs = sorted(glob.glob(os.path.join(music_folder, "*.pdf")))
        if pdfs:
            args.pdf = pdfs[0]
            speak(f"Using PDF: {os.path.basename(args.pdf)}")
        else:
            speak("No PDF found in ./music/. Continue without page turning.")
            args.pdf = None

    # Train ML NLU if available (falls back to rules if not)
    ml_ok = ml_train()
    speak(f"NLU: {'ML intent model ready' if ml_ok else 'using rule-based intents'}.")

    # Build state
    metro = Metronome(bpm=args.bpm); metro.start()
    pager = PageTurner(args.pdf) if args.pdf else None
    if pager:
        speak("Opening page 1.")
        pager._open_page()
    state = State(metronome=metro, pager=pager)

    # Choose input stream
    stream = input_stream(prefer=args.input, wake_word="maestro", vosk_model_path=args.vosk_model)

    # Loop
    for utter in stream:
        print("[Captured]:", utter)
        intent = nlu(utter)
        print("[Intent]:", intent)
        do_action(intent, state)

if __name__ == "__main__":
    # 🔹 auto-run defaults if no args are passed
    import sys
    if len(sys.argv) == 1:
        sys.argv += [
            "--bpm", "100",
            "--input", "vosk",
            "--vosk-model", "/path/to/vosk-model-small-en-us-0.15"
        ]
    main()