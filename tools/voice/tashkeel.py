#!/usr/bin/env python3
"""Adds full Arabic diacritics (tashkeel) to every statement so the voice reads it correctly.
Writes tools/voice/tashkeel.json  {statement: vocalised statement}. Already done statements are kept.
The key comes from GEMINI_KEY (never stored). usage: GEMINI_KEY=… python3 tools/voice/tashkeel.py"""
import json, os, subprocess, sys, time, urllib.request, urllib.error
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'tools', 'voice', 'tashkeel.json')
MODEL = os.environ.get('TEXT_MODEL', 'gemini-3.5-flash')
items = json.loads(subprocess.run(['node', os.path.join(ROOT, 'tools', 'voice', 'items.js'), '--raw'], capture_output=True, text=True, check=True).stdout)
texts = [i['raw'] for i in items if i['kind'] == 'q']
done = json.load(open(OUT, encoding='utf-8')) if os.path.exists(OUT) else {}
todo = [t for t in texts if t not in done]
print(len(texts), 'statements,', len(todo), 'to vocalise', flush=True)
PROMPT = ("Add complete, correct Arabic diacritics (tashkeel: fatha, damma, kasra, sukun, shadda, tanwin) to every Arabic word "
          "of each statement below, as a careful Arabic teacher would, so a text-to-speech voice pronounces it perfectly in "
          "Modern Standard Arabic. Do NOT change, add or remove any word, number, symbol, quote mark «» or Latin word. "
          "Answer ONLY with a JSON array of strings, same order, same count.\n\n")
def ask(batch):
    body = {"contents": [{"parts": [{"text": PROMPT + json.dumps(batch, ensure_ascii=False)}]}],
            "generationConfig": {"responseMimeType": "application/json", "temperature": 0.1}}
    for attempt in range(6):
        try:
            req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent",
                data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "x-goog-api-key": os.environ["GEMINI_KEY"]})
            d = json.load(urllib.request.urlopen(req, timeout=240))
            arr = json.loads(d["candidates"][0]["content"]["parts"][-1]["text"])
            if len(arr) == len(batch): return arr
            print('count mismatch, retry', flush=True)
        except urllib.error.HTTPError as e:
            print('HTTP', e.code, e.read()[:120], flush=True); time.sleep(15 * (attempt + 1))
        except Exception as e:
            print('err', str(e)[:120], flush=True); time.sleep(5)
    return None
import re
strip = lambda s: re.sub(r'[ً-ْٰ]', '', s)
for i in range(0, len(todo), 40):
    batch = todo[i:i + 40]
    arr = ask(batch)
    if not arr: print('batch failed', i); continue
    for a, b in zip(batch, arr):
        if strip(b).replace(' ', '') == strip(a).replace(' ', ''): done[a] = b   # words unchanged (only diacritics added)
        else: print('changed words, skipped:', a, '→', b)
    json.dump(done, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print(f'{min(i + 40, len(todo))}/{len(todo)}', flush=True)
print('vocalised:', len(done), 'of', len(texts))
