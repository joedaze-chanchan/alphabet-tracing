"""글자별 발음 mp3 생성. 사용: python tools/make_audio.py  (edge-tts 필요: pip install edge-tts)
letters.js의 word와 같은 단어를 쓴다. 새 글자를 추가하면 여기 items에도 넣고 다시 실행한다."""
import asyncio, os, edge_tts

VOICE = "en-US-JennyNeural"
ITEMS = {"A": "apple", "B": "ball", "C": "cat", "D": "dog", "E": "egg", "F": "fish"}
OUT = os.path.join(os.path.dirname(__file__), "..", "audio")

async def main():
    os.makedirs(OUT, exist_ok=True)
    for letter, word in ITEMS.items():
        path = os.path.join(OUT, f"{letter}.mp3")
        await edge_tts.Communicate(f"{letter}. {letter}. {word}.", VOICE, rate="-15%").save(path)
        print(letter, os.path.getsize(path), "bytes")

asyncio.run(main())
