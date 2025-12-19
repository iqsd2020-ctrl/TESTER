// ==========================================
// ملف البيانات الأساسي ومصنع الأوسمة (نظام الصور)
// ==========================================

export const topicsData = {
    "المعصومون (عليهم السلام)": ["سيرة النبي محمد (ص)", "سيرة الإمام علي (ع)", "السيدة فاطمة الزهراء (ع)", "سيرة الإمام الحسن المجتبى (ع)", "سيرة الإمام الحسين (ع)", "سيرة الإمام السجاد (ع)", "سيرة الإمام الباقر (ع)", "سيرة الإمام الصادق (ع)", "سيرة الإمام الكاظم (ع)", "سيرة الإمام الرضا (ع)", "سيرة الإمام الجواد (ع)", "سيرة الإمام الهادي (ع)", "سيرة الإمام العسكري (ع)", "الإمام المهدي (عج)"],
    "الأنبياء والرسل": ["قصص آدم وحواء وأولادهما", "في قصص إدريس (عليه السلام)", "قصص النبي نوح (ع)", "النبي هود (عليه السلام) وقومه عاد", "النبي صالح (عليه السلام) وقومه ثمود", "النبي إبراهيم (عليه السلام)", "النبي لوط (عليه السلام) وقومه", "سيرة ذي القرنين (ع)", "سيرة النبي يعقوب ويوسف (عليهما السلام)", "سيرة النبي شعيب (عليه السلام)", "سيرة النبي أيوب (ع)", "موسى وهارون (عليهما السلام)", "النبي داود (عليه السلام)", "لقمان الحكيم", "النبي سليمان (عليه السلام)", "النبي زكريا ويحيى (عليهما السلام)", "النبي عيسى وأمه (عليهما السلام)", "النبي يونس (عليه السلام)", "قصة أصحاب الكهف والرقيم", "في أخبار بني إسرائيل وأحوال بعض الملوك", "قصة قوم سبأ (سيل العرم)", "قصص أرميا ودانيال وعزير وبختنصر", "أصحاب الأخدود وجرجيس وخالد بن سنان", "أصحاب الرس وحنظلة النبي", "قصة شعيا وحبقوق", "متفرقات"],
    "شخصيات (أصحاب وعلماء ونساء)": ["السيدة خديجة الكبرى (ع)", "السيدة زينب (ع)", "السيدة أم البنين (ع)", "أبو الفضل العباس (ع)", "علي الأكبر (ع)", "القاسم بن الحسن (ع)", "سلمان المحمدي", "أبو ذر الغفاري", "السيد محمد الصدر", "السيد محمد باقر الصدر", "السيد مقتدى الصدر", "المقداد بن الأسود", "عمار بن ياسر", "مالك الأشتر", "مسلم بن عقيل (ع)", "المختار الثقفي", "حبيب بن مظاهر الأسدي", "ميثم التمار", "كميل بن زياد", "الخواجة نصير الدين الطوسي", "الشيخ المفيد", "الشيخ الطوسي"],
    "القرآن ونهج البلاغة": ["معاني مفردات القرآن", "أسباب النزول", "الناسخ والمنسوخ", "الأمثال في القرآن", "الخطبة الشقشقية", "خطبة المتقين", "عهد الإمام لمالك الأشتر", "حكم ومواعظ نهج البلاغة", "الصحيفة السجادية"],
    "عقائد وفقه": ["أصول الدين", "التوحيد وصفات الله", "العدل الإلهي", "النبوة", "الإمامة والولاية", "عالم البرزخ", "المعاد ويوم القيامة", "الشفاعة", "الرجعة", "البداء", "فروع الدين", "أحكام الصلاة", "أحكام الصوم", "أحكام الخمس", "أحكام الحج والعمرة", "الأمر بالمعروف والنهي عن المنكر", "الطهارة والنجاسات"],
    "الثقافة المهدوية": ["علامات الظهور", "السفراء الأربعة", "الغيبة الصغرى", "الغيبة الكبرى", "وظائف المنتظرين", "أصحاب الإمام المهدي", "دولة العدل الإلهي"],
    "تاريخ ومعارك": ["الهجرة النبوية", "معركة بدر الكبرى", "معركة أحد", "معركة الخندق (الأحزاب)", "معركة خيبر", "فتح مكة", "معركة حنين", "حروب الردة", "حرب الجمل", "معركة صفين", "معركة النهروان", "صلح الإمام الحسن (ع)", "واقعة كربلاء", "يوم المباهلة", "عيد الغدير الأغر", "حديث الكساء (الحدث)", "فاجعة هدم البقيع"],
    "أدعية وزيارات": ["دعاء كميل", "دعاء الصباح", "دعاء التوسل", "دعاء العهد", "دعاء الندبة", "دعاء الافتتاح", "دعاء أبي حمزة الثمالي", "دعاء عرفة", "المناجاة الشعبانية", "زيارة عاشوراء", "زيارة الأربعين", "الزيارة الجامعة الكبيرة", "دعاء اهل الثغور", "زيارة آل يس", "زيارة أمين الله"]
};

// رابط قاعدة الصور (للسهولة)
const BASE_IMG_URL = "https://raw.githubusercontent.com/iqsd2020-ctrl/New/refs/heads/main/Pic/";

// قائمة المعصومين (تم استبدال الأيقونات بأرقام الصور)
// ملاحظة: تأكد من أن لديك صور باسم 1.png, 2.png وهكذا في الرابط
export const infallibles = [
    { name: "النبي محمد", topic: "سيرة النبي محمد (ص)", id: "prophet_muhammad", img: "1.png" },
    { name: "الإمام علي", topic: "سيرة الإمام علي (ع)", id: "imam_ali", img: "2.png" },
    { name: "السيدة فاطمة", topic: "السيدة فاطمة الزهراء (ع)", id: "fatima_zahra", img: "3.png" },
    { name: "الإمام الحسن", topic: "سيرة الإمام الحسن المجتبى (ع)", id: "imam_hasan", img: "4.png" },
    { name: "الإمام الحسين", topic: "سيرة الإمام الحسين (ع)", id: "imam_hussein", img: "5.png" },
    { name: "الإمام السجاد", topic: "سيرة الإمام السجاد (ع)", id: "imam_sajjad", img: "6.png" },
    { name: "الإمام الباقر", topic: "سيرة الإمام الباقر (ع)", id: "imam_baqir", img: "7.png" },
    { name: "الإمام الصادق", topic: "سيرة الإمام الصادق (ع)", id: "imam_sadiq", img: "8.png" },
    { name: "الإمام الكاظم", topic: "سيرة الإمام الكاظم (ع)", id: "imam_kadhim", img: "9.png" },
    { name: "الإمام الرضا", topic: "سيرة الإمام الرضا (ع)", id: "imam_ridha", img: "10.png" },
    { name: "الإمام الجواد", topic: "سيرة الإمام الجواد (ع)", id: "imam_jawad", img: "11.png" },
    { name: "الإمام الهادي", topic: "سيرة الإمام الهادي (ع)", id: "imam_hadi", img: "12.png" },
    { name: "الإمام العسكري", topic: "سيرة الإمام العسكري (ع)", id: "imam_askari", img: "13.png" },
    { name: "الإمام المهدي", topic: "الإمام المهدي (عج)", id: "imam_mahdi", img: "14.png" }
];

// --- إعدادات المستويات الخمسة (نظام الرتب) ---
const TIER_CONFIG = [
    { id: 1, label: 'برونزي', color: 'bronze', multiplier: 1, rewards: { score: 200 } },
    { id: 2, label: 'فضي', color: 'silver', multiplier: 3, rewards: { score: 500, hint: 2 } },
    { id: 3, label: 'ذهبي', color: 'gold', multiplier: 8, rewards: { score: 1500, fifty: 2 } },
    { id: 4, label: 'ماسي', color: 'diamond', multiplier: 20, rewards: { score: 5000, lives: 2 } },
    { id: 5, label: 'أسطوري', color: 'legendary', multiplier: 50, rewards: { score: 10000, lives: 5, skip: 5 } }
];

export let badgesData = [];

// دالة المصنع المعدلة (تقبل رابط الصورة)
function generateBadge(baseId, name, imageName, type, targetBase, descTemplate, extraData = {}) {
    const levels = TIER_CONFIG.map(tier => {
        const calculatedTarget = Math.floor(targetBase * tier.multiplier);
        return {
            id: tier.id,
            label: tier.label,
            target: calculatedTarget,
            color: tier.color,
            rewards: tier.rewards
        };
    });

    return {
        id: baseId,
        name: name,
        image: BASE_IMG_URL + imageName, // تكوين الرابط الكامل
        type: type,
        levels: levels,
        desc: descTemplate,
        ...extraData
    };
}

// 1. أوسمة الولاية (الصور من 1 إلى 14)
infallibles.forEach(p => {
    badgesData.push(generateBadge(
        `lover_${p.id}`,
        `عاشق ${p.name.split(' ').pop()}`,
        p.img, // تمرير اسم الصورة
        'topic',
        10,
        `أثبت ولاءك لـ ${p.name} بالإجابة الصحيحة على الأسئلة.`,
        { topicKey: p.topic }
    ));
});

// 2. أوسمة التبحر (صور من 15 إلى 21)
const topicBadges = [
    { id: 'prophets', name: 'قصص الأنبياء', key: 'الأنبياء والرسل', img: '15.png' },
    { id: 'quran', name: 'علوم القرآن', key: 'القرآن ونهج البلاغة', img: '16.png' },
    { id: 'history', name: 'التاريخ الإسلامي', key: 'تاريخ ومعارك', img: '17.png' },
    { id: 'fiqh', name: 'الفقه والعقائد', key: 'عقائد وفقه', img: '18.png' },
    { id: 'mahdi', name: 'الثقافة المهدوية', key: 'الثقافة المهدوية', img: '19.png' },
    { id: 'dua', name: 'الدعاء والزيارة', key: 'أدعية وزيارات', img: '20.png' },
    { id: 'companions', name: 'سير الصحابة', key: 'شخصيات (أصحاب وعلماء ونساء)', img: '21.png' }
];

topicBadges.forEach(t => {
    badgesData.push(generateBadge(
        `master_${t.id}`,
        `خبير ${t.name}`,
        t.img,
        'topic',
        15,
        `تخصص في قسم ${t.name} وأجب ببراعة.`,
        { topicKey: t.key }
    ));
});

// 3. أوسمة المهارة واللعب (صور من 22 فما فوق)
// يمكنك تغيير أسماء الصور هنا حسب ما ترفعه على Github
badgesData.push(generateBadge(
    'streak_master', 'الثبات العظيم', '22.png', 'streak',
    5, 'حقق سلسلة إجابات صحيحة متتالية دون أي خطأ.', {}
));

badgesData.push(generateBadge(
    'speed_demon', 'البرق الخاطف', '23.png', 'counter',
    5, 'أجب بسرعة فائقة (أقل من 5 ثوانٍ).', { statKey: 'fastAnswerCount' }
));

badgesData.push(generateBadge(
    'perfectionist', 'العلامة الكاملة', '24.png', 'counter',
    2, 'أكمل جولات كاملة (10/10) دون خطأ.', { statKey: 'perfectRounds' }
));

badgesData.push(generateBadge(
    'purist', 'الواثق بنفسه', '25.png', 'counter',
    3, 'أكمل جولات كاملة دون مساعدات.', { statKey: 'noHelperQuizzesCount' }
));

badgesData.push(generateBadge(
    'score_tycoon', 'جامع النقاط', '26.png', 'score',
    1000, 'اجمع النقاط لتصل إلى أعلى المراتب.', {}
));

badgesData.push(generateBadge(
    'knowledge_seeker', 'الموسوعة', '27.png', 'counter',
    50, 'راكم عدد الإجابات الصحيحة الكلية.', { statKey: 'totalCorrect' }
));

badgesData.push(generateBadge(
    'veteran', 'المحارب القديم', '28.png', 'counter',
    10, 'شارك في عدد كبير من المسابقات.', { statKey: 'quizzesPlayed' }
));

badgesData.push(generateBadge(
    'night_owl', 'أنيس الليل', '29.png', 'counter',
    3, 'اللعب في أوقات السحر والهدوء.', { statKey: 'nightPlayCount' }
));

badgesData.push(generateBadge(
    'early_bird', 'بركة البكور', '30.png', 'counter',
    3, 'اللعب في الصباح الباكر.', { statKey: 'morningPlayCount' }
));

badgesData.push(generateBadge(
    'friday_loyal', 'جمعة الانتظار', '31.png', 'counter',
    2, 'المواظبة على اللعب في يوم الجمعة.', { statKey: 'fridayPlayCount' }
));

badgesData.push(generateBadge(
    'reader', 'المُطّلع', '32.png', 'counter',
    10, 'قراءة المعلومات الإثرائية.', { statKey: 'enrichmentCount' }
));

badgesData.push(generateBadge(
    'supporter', 'الداعم السخي', '33.png', 'counter',
    2, 'شراء عناصر ومساعدات من المتجر.', { statKey: 'itemsBought' }
));
// ==========================================
// إضافة الأوسمة الجديدة (تم التصحيح)
// ==========================================

// 1. وسام حامل النور
badgesData.push(generateBadge(
    'light_bearer', 'حامل النور', '34.png', 'counter',
    100, 'أجب على 100 سؤال في وضع "أكمل النور".', { statKey: 'marathonCorrectTotal' }
));

// 2. وسام المُثابر
badgesData.push(generateBadge(
    'perseverant', 'المُثابر', '35.png', 'counter',
    20, 'قم بمراجعة وتصحيح 20 سؤالاً من أخطائك.', { statKey: 'reviewedMistakesCount' }
));

// 3. وسام الناجي
badgesData.push(generateBadge(
    'survivor', 'الناجي', '36.png', 'counter',
    5, 'فز في 5 جولات مع تبقي قلب واحد فقط.', { statKey: 'survivorWins' }
));

// 4. وسام سفير المعرفة
badgesData.push(generateBadge(
    'ambassador', 'سفير المعرفة', '37.png', 'counter',
    10, 'شارك نتائجك ومعلومات التطبيق مع الآخرين.', { statKey: 'shareCount' }
));

// 5. وسام جليس العصر
badgesData.push(generateBadge(
    'afternoon_friend', 'جليس العصر', '38.png', 'counter',
    5, 'العب في وقت العصر (بين 3 و 6 مساءً).', { statKey: 'afternoonPlayCount' }
));

// 6. وسام العلاّمة الكاملة (النسخة الخارقة - تم تغيير الـ ID لمنع التكرار)
badgesData.push(generateBadge(
    'perfectionist_pro', 'العلاّمة الكاملة', '39.png', 'counter',
    5, 'أحرز نتيجة كاملة 10/10 في 5 جولات.', { statKey: 'perfectRounds' }
));

// 7. وسام الباحث عن الحقيقة
badgesData.push(generateBadge(
    'truth_seeker', 'الباحث عن الحقيقة', '40.png', 'counter',
    30, 'اطلع على "الشرح والمعنى" للاستفادة.', { statKey: 'explanationsViewed' }
));

// 8. وسام عاشق الانتظار (تم تصحيح topicName إلى topicKey)
badgesData.push(generateBadge(
    'mahdi_lover', 'عاشق الانتظار', '41.png', 'topic',
    50, 'تميز في الأسئلة الخاصة بالإمام المهدي (عج).', { topicKey: 'الإمام المهدي (عج)' }
));

// 9. وسام الخبير الاستراتيجي
badgesData.push(generateBadge(
    'strategic_master', 'الخبير الاستراتيجي', '42.png', 'counter',
    10, 'فز بجولات استخدمت فيها وسائل المساعدة بذكاء.', { statKey: 'strategicWins' }
));

// 10. وسام نفس لا ينقطع
badgesData.push(generateBadge(
    'endless_breath', 'نفس لا ينقطع', '43.png', 'counter',
    500, 'وصل رصيدك في جلسة ماراثون واحدة إلى 500 نقطة.', { statKey: 'maxMarathonScore' }
));

export const badgesMap = badgesData.reduce((acc, badge) => {
    acc[badge.id] = badge;
    return acc;
}, {});
