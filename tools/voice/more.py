#!/usr/bin/env python3
"""Writes new true/false statements (Gemini text model) → web/js/tf-extra.js. Key from GEMINI_KEY.
Then fact-checks every statement of the game and prints the doubtful ones for a human review."""
import json, os, re, subprocess, sys, time, urllib.request, urllib.error
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MODEL = os.environ.get('TEXT_MODEL', 'gemini-3.5-flash')
def ask(prompt, schema_hint=''):
    body = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"responseMimeType": "application/json", "temperature": 0.7}}
    for attempt in range(6):
        try:
            req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent",
                data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "x-goog-api-key": os.environ["GEMINI_KEY"]})
            d = json.load(urllib.request.urlopen(req, timeout=300))
            return json.loads(d["candidates"][0]["content"]["parts"][-1]["text"])
        except urllib.error.HTTPError as e:
            print('HTTP', e.code, e.read()[:150], flush=True); time.sleep(20 * (attempt + 1))
        except Exception as e:
            print('err', str(e)[:150], flush=True); time.sleep(5)
    raise SystemExit('failed')

def existing():
    out = subprocess.run(['node', '-e', """
global.window={};global.document={getElementById(){return null}};
const W='%s/web/';require(W+'data/world.js');require(W+'js/quiz-bank.js');require(W+'js/tf-bank.js');require(W+'js/tf-pool.js');
try{require(W+'js/tf-extra.js')}catch(e){}
process.stdout.write(JSON.stringify([...window.TF_BANK,...window.TF_HARD,...window.TF_POOL]));""" % ROOT], capture_output=True, text=True, check=True).stdout
    return json.loads(out)

if sys.argv[1:] == ['write']:
    have = existing(); texts = {x[2] for x in have}
    plan = [(1, 30), (2, 35), (3, 40), (4, 40), (5, 35)]
    topics = 'علوم، جسم الإنسان، حيوانات، جغرافيا العالم، المغرب (تاريخ، مدن، ثقافة، رياضة)، الدول العربية، الإسلام والقرآن، التاريخ، الرياضة وكرة القدم، اللغة العربية، الفضاء، الاختراعات، الطعام، الرياضيات'
    new = []
    for level, n in plan:
        desc = {1: 'سهلة جداً يعرفها الجميع', 2: 'متوسطة', 3: 'صعبة نوعاً ما', 4: 'صعبة وفيها فخ (معلومة شائعة لكنها خاطئة، أو مدينة مشهورة ليست العاصمة…)', 5: 'صعبة جداً وذكية، فخاخ دقيقة'}[level]
        prompt = (f"اكتب {n} جملة جديدة لمسابقة «صح أم خطأ» على TikTok، مستواها: {desc}. المواضيع متنوعة: {topics}.\n"
                  "قواعد: كل جملة خبرية قصيرة وواضحة بالعربية الفصحى، بدون «هل» وبدون علامة استفهام. نصف الجمل صحيحة ونصفها خاطئة تقريباً. "
                  "يجب أن تكون المعلومة دقيقة ومؤكدة تماماً (لا معلومات خلافية أو متغيرة). للجملة الخاطئة اكتب تصحيحاً قصيراً. "
                  "لا تكرر هذه الجمل الموجودة: " + json.dumps(sorted(texts)[:400], ensure_ascii=False)[:9000] +
                  '\nأجب فقط بمصفوفة JSON من كائنات: {"text": "...", "true": true|false, "fix": "التصحيح أو نص فارغ"}')
        arr = ask(prompt)
        for x in arr:
            t = x['text'].strip().rstrip('.؟?'); 
            if t in texts or len(t) > 90: continue
            texts.add(t); new.append([level, bool(x['true']), t, (x.get('fix') or '').strip() if not x['true'] else ''])
        print('level', level, 'total new', len(new), flush=True)
    with open(os.path.join(ROOT, 'web/js/tf-extra.js'), 'w', encoding='utf-8') as f:
        f.write('/* more true/false statements (written with a text model, then fact-checked). [level 1..5, true|false, statement, correction]\n'
                ' * levels 1–3 join TF_BANK, 4–5 join TF_HARD */\nwindow.TF_EXTRA = ' + json.dumps(new, ensure_ascii=False).replace('],[', '],\n[') + ';\n'
                '(window.TF_EXTRA || []).forEach(x => (x[0] >= 4 ? window.TF_HARD : window.TF_BANK).push(x));\n')
    print('written', len(new))

if sys.argv[1:] == ['check']:
    have = existing(); doubt = []
    for i in range(0, len(have), 60):
        batch = [{"i": i + k, "text": x[2], "answer": "true" if x[1] else "false", "fix": x[3]} for k, x in enumerate(have[i:i + 60])]
        prompt = ("أنت مدقق معلومات صارم. لكل عنصر: هل الجواب (answer) صحيح لهذه الجملة؟ وإن كانت الجملة خاطئة، هل التصحيح (fix) صحيح؟ "
                  "أرجع فقط العناصر التي فيها خطأ مؤكد أو شك قوي، كمصفوفة JSON: [{\"i\": رقم, \"problem\": \"شرح قصير\"}]. إذا لا شيء أرجع [].\n"
                  + json.dumps(batch, ensure_ascii=False))
        for d in ask(prompt):
            j = d.get('i')
            if isinstance(j, int) and 0 <= j < len(have): doubt.append((have[j], d.get('problem', '')))
        print(f'checked {min(i + 60, len(have))}/{len(have)}  doubtful={len(doubt)}', flush=True)
    json.dump([[x, p] for x, p in doubt], open(os.path.join(ROOT, 'tools/voice/doubtful.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('doubtful', len(doubt))
