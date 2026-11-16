#!/usr/bin/env python3
"""Second pass: a careful review of the diacritics of every statement; only real corrections are kept
(the words must stay the same). Key from GEMINI_KEY."""
import json, os, re, time, urllib.request, urllib.error
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
P = os.path.join(ROOT, 'tools', 'voice', 'tashkeel.json')
MODEL = os.environ.get('TEXT_MODEL', 'gemini-3.5-flash')
tk = json.load(open(P, encoding='utf-8'))
strip = lambda s: re.sub(r'[ً-ْٰ\s]', '', s)
keys = list(tk); fixed = 0
for i in range(0, len(keys), 40):
    batch = [{"i": i + k, "t": tk[keys[i + k]]} for k in range(min(40, len(keys) - i))]
    prompt = ("أنت أستاذ لغة عربية دقيق جداً. راجع التشكيل الكامل لكل جملة (الحركات، الشدة، التنوين، الإعراب الصحيح، وأسماء الأعلام والأماكن الأجنبية بنطقها المعروف). "
              "أرجع فقط الجمل التي فيها خطأ في التشكيل، مصححة بالكامل، دون تغيير أي كلمة أو رقم أو رمز. JSON فقط: [{\"i\": رقم, \"t\": \"الجملة مصححة التشكيل\"}] أو [].\n"
              + json.dumps(batch, ensure_ascii=False))
    body = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"responseMimeType": "application/json", "temperature": 0.1}}
    for attempt in range(5):
        try:
            req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent", data=json.dumps(body).encode(),
                                         headers={"Content-Type": "application/json", "x-goog-api-key": os.environ["GEMINI_KEY"]})
            d = json.load(urllib.request.urlopen(req, timeout=300)); arr = json.loads(d["candidates"][0]["content"]["parts"][-1]["text"]); break
        except Exception as e:
            print('retry', str(e)[:100], flush=True); time.sleep(15 * (attempt + 1)); arr = []
    for x in arr:
        j = x.get('i'); t = x.get('t', '')
        if isinstance(j, int) and 0 <= j < len(keys) and strip(t) == strip(keys[j]) and t != tk[keys[j]]:
            tk[keys[j]] = t; fixed += 1
    json.dump(tk, open(P, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print(f'{min(i + 40, len(keys))}/{len(keys)} corrected={fixed}', flush=True)
