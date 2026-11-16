#!/usr/bin/env python3
"""A new set of true/false statements for «صح أم خطأ»: general culture everybody in the Arab world can answer,
6 levels (the level rises every ~4 questions). Draft → tools/voice/arsenal.json (not used by the game until applied).
usage: GEMINI_KEY=… python3 tools/voice/arsenal.py write|check"""
import json, os, random, re, sys, time, urllib.request, urllib.error
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'tools', 'voice', 'arsenal.json')
MODEL = os.environ.get('TEXT_MODEL', 'gemini-3.5-flash')
def ask(prompt, temp=0.8):
    body = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"responseMimeType": "application/json", "temperature": temp}}
    for attempt in range(6):
        try:
            req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent",
                data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "x-goog-api-key": os.environ["GEMINI_KEY"]})
            d = json.load(urllib.request.urlopen(req, timeout=300))
            return json.loads(d["candidates"][0]["content"]["parts"][-1]["text"])
        except Exception as e:
            print('retry', str(e)[:120], flush=True); time.sleep(15 * (attempt + 1))
    return []
LEVELS = {
  1: 'سهلة جداً، يعرفها حتى طفل عمره 10 سنوات (مثال: الشمس تشرق من الشرق، الرباط عاصمة المغرب)',
  2: 'سهلة، معلومات يومية معروفة عند الجميع',
  3: 'سهلة إلى متوسطة، يعرفها أغلب الناس الذين تابعوا الدراسة',
  4: 'متوسطة، تحتاج تفكيراً قليلاً لكنها في متناول الجميع',
  5: 'متوسطة إلى صعبة قليلاً، فيها فخ بسيط أحياناً (مدينة مشهورة ليست العاصمة…)',
  6: 'أصعب قليلاً لكن ليست تعجيزية، يعرفها المثقف العادي',
}
TOPICS = ['عواصم الدول العربية والعالم المشهورة', 'جغرافيا الدول العربية (المغرب، الجزائر، تونس، ليبيا، مصر، السعودية، الخليج، الشام)',
          'الإسلام والقرآن والسيرة (معلومات أساسية متفق عليها)', 'كرة القدم العربية والعالمية والمنتخبات وكأس العالم', 'الحيوانات', 'جسم الإنسان والصحة',
          'العلوم البسيطة والطبيعة', 'الفضاء والكواكب', 'التاريخ العربي والإسلامي المشهور', 'اللغة العربية (أضداد، جمع، مفرد، معاني كلمات)',
          'الأكلات والأطباق المغاربية والعربية والعالمية', 'العملات والأعلام', 'المعالم والمدن المشهورة', 'الاختراعات والمخترعون المشهورون', 'الرياضيات البسيطة والحساب',
          'معلومات عامة يومية (الوقت، الألوان، الفصول، المهن)']
def write():
    have = json.load(open(OUT, encoding='utf-8')) if os.path.exists(OUT) else []
    texts = {x[2] for x in have}
    per_level = int(os.environ.get('PER_LEVEL', 110))
    for level in range(1, 7):
        while sum(1 for x in have if x[0] == level) < per_level:
            topics = random.sample(TOPICS, 4)
            prompt = (f"اكتب 30 جملة جديدة لمسابقة «صح أم خطأ» مباشرة على TikTok لجمهور عربي (المغرب، الجزائر، تونس، ليبيا، مصر، السعودية والخليج). "
                      f"المستوى: {LEVELS[level]}. المواضيع: {'، '.join(topics)}.\n"
                      "قواعد صارمة: ثقافة عامة في متناول الجميع، لا أسئلة تعجيزية ولا تفاصيل دقيقة. جملة خبرية قصيرة وواضحة بالفصحى البسيطة (أقل من 12 كلمة)، بدون «هل» وبدون علامة استفهام. "
                      "نصفها صحيح ونصفها خاطئ تقريباً. المعلومة مؤكدة ومتفق عليها تماماً (لا خلافيات ولا أرقام قد تتغير، لا سياسة ولا مواضيع حساسة). "
                      "للجملة الخاطئة تصحيح قصير. لا تكرر: " + json.dumps(random.sample(sorted(texts), min(len(texts), 120)), ensure_ascii=False) +
                      '\nأجب فقط بمصفوفة JSON: [{"text": "...", "true": true|false, "fix": "..."}]')
            for x in ask(prompt):
                t = re.sub(r'[.؟?!]+$', '', str(x.get('text', '')).strip())
                if not t or t in texts or len(t) > 80 or 'هل' in t.split(): continue
                texts.add(t); have.append([level, bool(x.get('true')), t, '' if x.get('true') else str(x.get('fix', '')).strip()])
            json.dump(have, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
            print('level', level, sum(1 for x in have if x[0] == level), flush=True)
def check():
    have = json.load(open(OUT, encoding='utf-8')); bad = set()
    for i in range(0, len(have), 50):
        batch = [{"i": i + k, "text": x[2], "answer": x[1], "fix": x[3]} for k, x in enumerate(have[i:i + 50])]
        res = ask("أنت مدقق معلومات صارم. لكل عنصر تحقق: هل الجواب (answer: true = الجملة صحيحة) صحيح فعلاً؟ هل التصحيح صحيح؟ هل المعلومة خلافية أو غامضة أو حساسة؟ "
                  "أرجع فقط العناصر المشكوك فيها: [{\"i\": رقم, \"problem\": \"...\"}] أو [].\n" + json.dumps(batch, ensure_ascii=False), temp=0.1)
        for d in res:
            if isinstance(d.get('i'), int): bad.add(d['i']); print('  ✗', have[d['i']][2], '—', d.get('problem', '')[:90], flush=True)
        print(f'checked {min(i + 50, len(have))}/{len(have)} doubtful={len(bad)}', flush=True)
    keep = [x for i, x in enumerate(have) if i not in bad]
    json.dump(keep, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print('kept', len(keep), 'removed', len(bad))
{'write': write, 'check': check}[sys.argv[1]]()
