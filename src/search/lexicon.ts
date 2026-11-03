// Query-expansion lexicon: lets agents search with French terms or common Moroccan field
// vocabulary. It only rewrites the *query*; it never adds content to the legal data.
export const LEXICON: Record<string, string[]> = {
  // French → Arabic terms found in the guide
  stationnement: ['الوقوف'], stationner: ['الوقوف'], arret: ['التوقف', 'الوقوف'], arreter: ['التوقف'],
  vitesse: ['السرعة'], exces: ['تجاوز'], radar: ['رادار'], ceinture: ['حزام السلامة'], securite: ['السلامة'],
  telephone: ['الهاتف'], portable: ['الهاتف'], alcool: ['الكحول'], alcoolemie: ['الكحول'], ivresse: ['الكحول'],
  stupefiants: ['مخدرة'], drogue: ['مخدرة'], medicament: ['الأدوية'], medicaments: ['الأدوية'],
  permis: ['رخصة السياقة'], conduire: ['السياقة'], conduite: ['السياقة'], assurance: ['التأمين'],
  carte: ['شهادة'], grise: ['شهادة التسجيل'], immatriculation: ['التسجيل'], plaque: ['صفائح'], plaques: ['صفائح'],
  feu: ['ضوء'], feux: ['الأضواء'], rouge: ['الأحمر'], stop: ['قف'], depassement: ['التجاوز'], doubler: ['التجاوز'],
  casque: ['خوذة'], autoroute: ['الطريق السيار'], visite: ['المراقبة التقنية'], technique: ['التقنية'],
  controle: ['المراقبة'], pneu: ['الإطار المطاطي'], pneus: ['الإطار المطاطي'], poids: ['الوزن'], surcharge: ['الوزن', 'الحمولة'],
  charge: ['الحمولة'], chargement: ['الحمولة'], chronotachygraphe: ['جهاز قياس السرعة وزمن السياقة'], tachygraphe: ['جهاز قياس السرعة وزمن السياقة'],
  limiteur: ['جهاز تحديد السرعة'], delit: ['الجنح'], delits: ['الجنح'], fourriere: ['المحجز'], amende: ['الغرامة'],
  pv: ['محضر'], proces: ['محضر'], verbal: ['محضر'], sens: ['اتجاه'], interdit: ['ممنوع'], priorite: ['الأسبقية'],
  pieton: ['الراجلين', 'راجل'], pietons: ['الراجلين'], ligne: ['خط'], continue: ['متصل'], eclairage: ['الإنارة'],
  phares: ['الأضواء'], retroviseur: ['المرآة العاكسة'], essuie: ['ماسحة الزجاج'], klaxon: ['المنبه الصوتي'], avertisseur: ['المنبه الصوتي'],
  transport: ['النقل'], marchandises: ['البضائع'], voyageurs: ['الركاب'], passagers: ['الركاب'], tunnel: ['نفق'], pont: ['القناطر'],
  rail: ['السكة الحديدية'], ferroviaire: ['السكة الحديدية'], trottoir: ['الأرصفة'], enfant: ['أطفال'], enfants: ['أطفال'],
  fumee: ['الدخان'], pollution: ['الدخان'], course: ['سباقات'], courses: ['سباقات'], animaux: ['الحيوانات'], velo: ['الدراجات'],
  bicyclette: ['الدراجات'], moto: ['الدراجات النارية'], cyclomoteur: ['دراجة بمحرك'], remorque: ['المقطورة'], extincteur: ['إطفاء الحريق'],
  frein: ['أجهزة حصر'], freins: ['أجهزة حصر'], freinage: ['أجهزة حصر'], direction: ['أجهزة توجيه'], suspension: ['نظام التعليق'],
  medical: ['الفحص الطبي'], repos: ['الراحة'], professionnel: ['المهني'], refus: ['رفض'], obtempérer: ['الامتثال'], obtemperer: ['الامتثال'],
  autobus: ['النقل الجماعي'], bus: ['النقل الجماعي'], camion: ['نقل البضائع'], depannage: ['قطر'], remorquage: ['قطر'],
  // Arabic related terms (parking ↔ stopping are handled together in the field)
  الوقوف: ['التوقف'], وقوف: ['توقف'], التوقف: ['الوقوف'], توقف: ['وقوف'],
  // Moroccan field vocabulary (darija / borrowed words)
  البيرمي: ['رخصة السياقة'], بيرمي: ['رخصة السياقة'], لاكارط: ['شهادة التسجيل'], كريز: ['شهادة التسجيل'], لاكارتكريز: ['شهادة التسجيل'],
  الفوريان: ['المحجز'], فوريان: ['المحجز'], لاسورانس: ['التأمين'], اسورانس: ['التأمين'], الاسورانس: ['التأمين'],
  الكاسك: ['خوذة'], كاسك: ['خوذة'], التيليفون: ['الهاتف'], تيليفون: ['الهاتف'], البورطابل: ['الهاتف'], بورطابل: ['الهاتف'],
  الطوموبيل: ['مركبة'], لاتوروت: ['الطريق السيار'], اوطوروت: ['الطريق السيار'], الفيزيت: ['المراقبة التقنية'], فيزيت: ['المراقبة التقنية'],
  الرادار: ['رادار'], البلاكا: ['صفائح'], بلاكا: ['صفائح'], الكاميو: ['نقل البضائع'], كاميو: ['نقل البضائع'], الطوبيس: ['النقل الجماعي'],
  الحزام: ['حزام السلامة'], السمطة: ['حزام السلامة'], سمطة: ['حزام السلامة'], الضو: ['ضوء'], الستوب: ['قف'], ستوب: ['قف'],
  التوقيف: ['توقيف'], ركن: ['الوقوف'], الركن: ['الوقوف'], باركينغ: ['الوقوف'], الباركينغ: ['الوقوف'], السكر: ['الكحول'], الشراب: ['الكحول'],
};
