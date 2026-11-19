#!/usr/bin/env python3
"""Reviews the diacritics of the announcer's lines so the voice reads them in natural Moroccan Darija
(sukun where Darija drops the vowel, no tanween on Darija words). Words stay the same. Writes the
corrected lines into web/js/tf-lines.js and deletes their old recordings. Key from GEMINI_KEY."""
import json, os, re, subprocess, time, urllib.request
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MODEL = os.environ.get('TEXT_MODEL', 'gemini-3.5-flash')
items = [x for x in json.loads(subprocess.run(['node', os.path.join(ROOT, 'tools/voice/items.js')], capture_output=True, text=True, check=True).stdout) if x['kind'] == 'line']
strip = lambda s: re.sub(r'[ً-ْٰ\s]', '', s)
prompt = ("أنت مذيع مغربي من الدار البيضاء وخبير في كتابة الدارجة المغربية بالتشكيل. هذه جمل يقرؤها مذيع بصوت اصطناعي. "
          "صحّح التشكيل لكل جملة بحيث يُنطق بالدارجة المغربية الطبيعية تماماً كما يتكلم المغاربة: سكون حيث تُسكَّن الحروف في الدارجة، "
          "بدون تنوين في الكلمات الدارجة (التنوين فقط في عبارات فصيحة ثابتة مثل «شكراً»)، والشدة حيث يلزم. لا تغيّر أي كلمة ولا ترتيبها ولا الرموز مثل [laughs] و«» والأرقام والكلمات اللاتينية. "
          "أرجع JSON فقط: [{\"key\": \"...\", \"t\": \"الجملة بالتشكيل الصحيح\"}] لكل الجمل.\n" + json.dumps([{"key": i['key'], "t": i['text']} for i in items], ensure_ascii=False))
body = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2}}
for attempt in range(5):
    try:
        req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent", data=json.dumps(body).encode(),
                                     headers={"Content-Type": "application/json", "x-goog-api-key": os.environ["GEMINI_KEY"]})
        d = json.load(urllib.request.urlopen(req, timeout=400)); arr = json.loads(d["candidates"][0]["content"]["parts"][-1]["text"]); print('answer', len(arr)); break
    except Exception as e:
        print('retry', str(e)[:120]); time.sleep(20 * (attempt + 1))
by = {i['key']: i['text'] for i in items}
p = os.path.join(ROOT, 'web/js/tf-lines.js'); s = open(p, encoding='utf-8').read()
changed = 0
for x in arr:
    k, t = x.get('key'), x.get('t', '')
    old = by.get(k)
    if not old or t == old: continue
    if strip(t) != strip(old): print('words changed, skipped:', k, '|', t); continue
    if old not in s: print('not found:', k); continue
    s = s.replace(old, t, 1); changed += 1
    f = os.path.join(ROOT, 'web/voice/mohamed', k + '.ogg')
    if os.path.exists(f): os.remove(f)
    print(k, '\n   ', old, '\n → ', t)
open(p, 'w', encoding='utf-8').write(s)
print('changed', changed, 'of', len(items))
