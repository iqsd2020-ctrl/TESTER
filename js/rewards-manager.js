// ==========================================
// 🎮 لوحة التحكم المركزية: المكافآت، الأسعار، والنقاط
// ==========================================

/**
 * هذا الملف هو المرجع الوحيد لكافة القيم الرقمية في التطبيق.
 * تعديل أي قيمة هنا سينعكس تلقائياً في كافة واجهات وبرمجيات التطبيق.
 */

// 1. نظام المكافآت (النقاط التي يكتسبها المستخدم)
export const REWARDS = {
    AUDIO_LISTEN: { 
        points: 20, 
        statKey: 'stats.audioListened',
        msg: '🎵 أحسنت! كسبت 20 نقطة لاستماعك'
    },
    QUIZ_CORRECT: { 
        points: 10, 
        statKey: 'stats.questionsAnswered',
        msg: '✨ إجابة صحيحة! +10 نقاط'
    },
    BOOK_READ: { 
        points: 50, 
        statKey: 'stats.booksRead',
        msg: '📖 مثقف رائع! +50 نقطة لقراءة الكتاب'
    },
    DAILY_LOGIN: {
        points: 100,
        statKey: 'stats.loginStreak',
        msg: '📅 مكافأة الدخول اليومي +100 نقطة'
    }
};

// 2. نظام المسابقات (النقاط أثناء اللعب)
export const QUIZ_CONFIG = {
    CORRECT_ANSWER_POINTS: 1,      // النقاط الأساسية لكل إجابة صحيحة
    WRONG_ANSWER_DEDUCTION: 2,     // النقاط المخصومة عند الإجابة الخاطئة
    STREAK_MULTIPLIERS: [
        { threshold: 15, multiplier: 4, text: "x4 🪙" },
        { threshold: 9, multiplier: 3, text: "x3 ✨" },
        { threshold: 5, multiplier: 2, text: "x2🔸" }
    ],
    FAST_ANSWER_THRESHOLD: 5000,   // الوقت المعتبر كإجابة سريعة (بالملي ثانية)
    LIVES_REWARD_STREAK: 15        // عدد الإجابات الصحيحة المتتالية للحصول على قلب
};

// 3. أسعار المتجر (Shop Prices)
export const SHOP_PRICES = {
    LIFE: 100,          // سعر القلب الواحد في المتجر
    HELPER_FIFTY: 50,   // سعر مساعدة حذف إجابتين
    HELPER_HINT: 50,    // سعر مساعدة حذف إجابة
    HELPER_SKIP: 50,    // سعر مساعدة التخطي
    UNLOCK_TOPIC: 10000 // سعر فتح موضوع مقفل
};

// 4. أسعار المساعدات أثناء اللعب (In-Game Helper Costs)
export const HELPER_COSTS = {
    FIFTY: 2,           // تكلفة حذف إجابتين بالنقاط أثناء الجولة
    HINT: 1,            // تكلفة حذف إجابة بالنقاط أثناء الجولة
    SKIP: 5             // تكلفة التخطي بالنقاط أثناء الجولة
};

// 5. أسعار الإنعاش (Revive Prices)
export const REVIVE_PRICES = [
    { amount: 1, cost: 49 },
    { amount: 2, cost: 89 },
    { amount: 3, cost: 299 }
];

// 6. بيانات الإطارات (Frames Data)
export const FRAMES_DATA = [
    { id: 'default', name: 'بدون إطار', price: 0, cssClass: '' },
    { id: 'gold', name: 'الإطار الذهبي', price: 1500, cssClass: 'frame-gold' },
    { id: 'fire', name: 'الإطار المشتعل', price: 3000, cssClass: 'frame-fire' },
    { id: 'floral', name: 'إطار الربيع', price: 1000, cssClass: 'frame-floral' },
    { id: 'diamond', name: 'الإطار الماسي', price: 5000, cssClass: 'frame-diamond' },
    { id: 'neon', name: 'إطار النيون', price: 2500, cssClass: 'frame-neon' },
    { id: 'sun', name: 'شمس الولاية', price: 4000, cssClass: 'frame-sun' },
    { id: 'eagle', name: 'جناح النسر', price: 3500, cssClass: 'frame-eagle' },
    { id: 'star', name: 'نجمة الصباح', price: 2000, cssClass: 'frame-star' },
    { id: 'tech', name: 'السايبر الرقمي', price: 30000, cssClass: 'frame-tech' },
    { id: 'energy', name: 'طاقة البرق', price: 2800, cssClass: 'frame-energy' },
    { id: 'ruby', name: 'ياقوت أحمر', price: 2200, cssClass: 'frame-ruby' },
    { id: 'nature', name: 'غصن الزيتون', price: 1200, cssClass: 'frame-nature' },
    { id: 'hex', name: 'درع سداسي', price: 1800, cssClass: 'frame-hex' },
    { id: 'ghost', name: 'الطيف الأبيض', price: 4500, cssClass: 'frame-ghost' },
    { id: 'galaxy', name: 'مجرة الفلك', price: 60000, cssClass: 'frame-galaxy-fixed' },
    { id: 'dark_matter', name: 'المادة المظلمة', price: 7000, cssClass: 'frame-dark-matter-fixed' },
    { id: 'rgb', name: 'ألوان الطيف', price: 6500, cssClass: 'frame-rgb-fixed' },
    { id: 'nur_ala_nur', name: 'نور على نور', price: 5500, cssClass: 'frame-nur' },
    { id: 'angelic_wing', name: 'الجناح الملائكي', price: 4800, cssClass: 'frame-angelic' },
    { id: 'crescent_moon', name: 'هلال العيد', price: 3200, cssClass: 'frame-crescent' },
    { id: 'kufic_gold', name: 'زخرفة كوفية', price: 4200, cssClass: 'frame-kufic' },
    { id: 'heaven_gate', name: 'أبواب الجنان', price: 8000, cssClass: 'frame-heaven' },
    { id: 'blizzard', name: 'عاصفة الجليد', price: 3800, cssClass: 'frame-blizzard' },
    { id: 'thunder_storm', name: 'الصاعقة', price: 4500, cssClass: 'frame-thunder' },
    { id: 'ocean_depth', name: 'عمق المحيط', price: 3600, cssClass: 'frame-ocean' },
    { id: 'sand_storm', name: 'عاصفة الصحراء', price: 2900, cssClass: 'frame-sand' },
    { id: 'emerald_flow', name: 'الزمرد السائل', price: 5200, cssClass: 'frame-emerald' },
    { id: 'glitch_art', name: 'الخلل الرقمي', price: 4000, cssClass: 'frame-glitch' },
    { id: 'scanner', name: 'الماسح الضوئي', price: 3300, cssClass: 'frame-scanner' },
    { id: 'hud_circle', name: 'النظام الذكي', price: 3700, cssClass: 'frame-hud' },
    { id: 'cyber_pulse', name: 'نبض السايبر', price: 3200, cssClass: 'frame-cyber-pulse' },
    { id: 'matrix', name: 'المصفوفة', price: 3500, cssClass: 'frame-matrix' },
    { id: 'amethyst', name: 'الجمشت البنفسجي', price: 4600, cssClass: 'frame-amethyst' },
    { id: 'sapphire_ring', name: 'خاتم الياقوت', price: 4900, cssClass: 'frame-sapphire' },
    { id: 'pearl_shell', name: 'اللؤلؤة المكنونة', price: 5500, cssClass: 'frame-pearl' },
    { id: 'phoenix', name: 'ريشة العنقاء', price: 9000, cssClass: 'frame-phoenix' },
    { id: 'dragon_breath', name: 'أنفاس التنين', price: 8500, cssClass: 'frame-dragon-breath' },
    { id: 'mystic_aura', name: 'الهالة الصوفية', price: 6200, cssClass: 'frame-mystic' },
    { id: 'time_portal', name: 'بوابة الزمن', price: 7500, cssClass: 'frame-time' },
    { id: 'infinity', name: 'إطار اللانهاية', price: 10000, cssClass: 'frame-infinity' }
];

export default class RewardsManager {
    constructor(onRewardGrant) {
        this.onRewardGrant = onRewardGrant;
    }

    async trigger(type) {
        const rewardData = REWARDS[type];
        if (!rewardData) {
            console.error(`❌ نوع مكافأة غير معروف: ${type}`);
            return;
        }
        if (this.onRewardGrant) {
            await this.onRewardGrant(rewardData);
        }
    }
    
    getPoints(type) {
        return REWARDS[type] ? REWARDS[type].points : 0;
    }
}
