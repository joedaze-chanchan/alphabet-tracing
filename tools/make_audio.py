"""글자별 발음 mp3 생성. 사용: python tools/make_audio.py  (edge-tts 필요: pip install edge-tts)
letters.js의 INFO 단어와 같은 단어를 쓴다. 새 글자를 추가하면 여기 ITEMS에도 넣고 다시 실행한다.
이미 있는 파일은 건너뛴다. 전부 다시 만들려면 audio/ 폴더를 비운다."""
import asyncio, os, edge_tts

VOICE = "en-US-JennyNeural"
ITEMS = {
    "A": "apple",
    "B": "ball",
    "C": "cat",
    "D": "dog",
    "E": "egg",
    "F": "fish",
    "G": "goat",
    "H": "hat",
    "I": "ink",
    "J": "jam",
    "K": "king",
    "L": "lion",
    "M": "milk",
    "N": "nose",
    "O": "octopus",
    "P": "pig",
    "Q": "queen",
    "R": "rabbit",
    "S": "sun",
    "T": "tiger",
    "U": "umbrella",
    "V": "violin",
    "W": "water",
    "X": "fox",
    "Y": "yellow",
    "Z": "zebra",
}
OUT = os.path.join(os.path.dirname(__file__), "..", "audio")

async def main():
    os.makedirs(OUT, exist_ok=True)
    for letter, word in ITEMS.items():
        path = os.path.join(OUT, f"{letter}.mp3")
        if os.path.exists(path):
            continue
        await edge_tts.Communicate(f"{letter}... {letter}... {word}.", VOICE, rate="-35%").save(path)
        print(letter, os.path.getsize(path), "bytes")

asyncio.run(main())
