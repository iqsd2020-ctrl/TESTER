import { topicsData } from './data.js';

// ==========================================
// 🎨 نظام معرض الإنجازات (ملف مستقل لسهولة التعديل)
// ==========================================

/**
 * يمكنك إضافة أو تعديل الإنجازات هنا بسهولة.
 * id: معرف فريد
 * img: رابط الصورة العادية (تظهر متدرجة حسب التقدم)
 * hdUrl: رابط الصورة عالية الدقة للتحميل
 * title: عنوان الإنجاز
 * target: الرقم المطلوب لتحقيق الإنجاز
 * conditionType: نوع الشرط ('section_score' للقسم، 'topic_score' لموضوع محدد، 'total_correct' للمجموع الكلي)
 * sectionKey / topicKey: المفتاح البرمجي للقسم أو الموضوع كما هو في ملف data.js
 * desc: وصف الإنجاز
 */
export const achievementsGallery = [
    { 
        id: 1, 
        img: 'https://raw.githubusercontent.com/iqsd2020-ctrl/New/refs/heads/main/img/1.png',
        hdUrl: 'https://raw.githubusercontent.com/iqsd2020-ctrl/New/refs/heads/main/img/1.png',
        title: 'نور المعصومين',
        target: 100,
        conditionType: 'section_score', 
        sectionKey: "المعصومون (عليهم السلام)",
        desc: 'أجب بشكل صحيح في قسم المعصومين'
    },
    { 
        id: 2, 
        img: 'https://raw.githubusercontent.com/iqsd2020-ctrl/New/refs/heads/main/img/2.png', 
        hdUrl: 'https://raw.githubusercontent.com/iqsd2020-ctrl/New/refs/heads/main/img/2.png',
        title: 'نور المعصومين',
        target: 200, 
        conditionType: 'section_score', 
        sectionKey: "المعصومون (عليهم السلام)",
        desc: 'أجب بشكل صحيح في قسم المعصومين'
    },
    { 
        id: 3, 
        img: 'https://raw.githubusercontent.com/iqsd2020-ctrl/New/refs/heads/main/img/3.png', 
        hdUrl: 'https://raw.githubusercontent.com/iqsd2020-ctrl/New/refs/heads/main/img/3.png',
        title: 'نور المعصومين',
        target: 300, 
        conditionType: 'section_score', 
        sectionKey: "المعصومون (عليهم السلام)",
        desc: 'أجب بشكل صحيح في قسم المعصومين'
    },
    { 
        id: 4, 
        img: 'https://raw.githubusercontent.com/iqsd2020-ctrl/New/refs/heads/main/img/4.png', 
        hdUrl: 'https://raw.githubusercontent.com/iqsd2020-ctrl/New/refs/heads/main/img/4.png',
        title: 'نور المعصومين',
        target: 300, 
        conditionType: 'section_score', 
        sectionKey: "المعصومون (عليهم السلام)",
        desc: 'أجب بشكل صحيح في قسم المعصومين'
    },
    { 
        id: 5, 
        img: 'https://raw.githubusercontent.com/iqsd2020-ctrl/New/refs/heads/main/img/5.png', 
        hdUrl: 'https://raw.githubusercontent.com/iqsd2020-ctrl/New/refs/heads/main/img/5.png',
        title: 'نور المعصومين',
        target: 300, 
        conditionType: 'section_score', 
        sectionKey: "المعصومون (عليهم السلام)",
        desc: 'أجب بشكل صحيح في قسم المعصومين'
    },
    { 
        id: 6, 
        img: 'https://raw.githubusercontent.com/iqsd2020-ctrl/New/refs/heads/main/img/6.png', 
        hdUrl: 'https://raw.githubusercontent.com/iqsd2020-ctrl/New/refs/heads/main/img/6.png',
        title: 'نور المعصومين',
        target: 300, 
        conditionType: 'section_score', 
        sectionKey: "المعصومون (عليهم السلام)",
        desc: 'أجب بشكل صحيح في قسم المعصومين'
    },
    { 
        id: 7, 
        img: 'https://raw.githubusercontent.com/iqsd2020-ctrl/New/refs/heads/main/img/7.png', 
        hdUrl: 'https://raw.githubusercontent.com/iqsd2020-ctrl/New/refs/heads/main/img/7.png',
        title: 'نور المعصومين',
        target: 300, 
        conditionType: 'section_score', 
        sectionKey: "المعصومون (عليهم السلام)",
        desc: 'أجب بشكل صحيح في قسم المعصومين'
    },
    { 
        id: 8, 
        img: 'https://raw.githubusercontent.com/iqsd2020-ctrl/New/refs/heads/main/img/8.png', 
        hdUrl: 'https://raw.githubusercontent.com/iqsd2020-ctrl/New/refs/heads/main/img/8.png',
        title: 'نور المعصومين',
        target: 1000, 
        conditionType: 'section_score', 
        sectionKey: "المعصومون (عليهم السلام)",
        desc: 'أجب بشكل صحيح في قسم المعصومين'
    },
    { 
        id: 9, 
        img: 'https://raw.githubusercontent.com/iqsd2020-ctrl/New/refs/heads/main/img/9.png', 
        hdUrl: 'https://raw.githubusercontent.com/iqsd2020-ctrl/New/refs/heads/main/img/9.png',
        title: 'الامام المهدي',
        target: 10, 
        conditionType: 'topic_score',
        topicKey: "الإمام المهدي (عج)",
        desc: 'أجب بشكل صحيح في قسم الامام المهدي'
    }
];

/**
 * دالة مساعدة لتنظيف النصوص (يجب أن تكون متوفرة أو مستوردة)
 * ملاحظة: هذه الدالة موجودة في main.js، سنفترض أنها متاحة عالمياً أو سنقوم بتعريفها إذا لزم الأمر.
 * لضمان الاستقلالية، سنستخدم الدالة من النطاق العالمي window.normalizeTextForMatch
 */
function getNormalized(text) {
    if (typeof window.normalizeTextForMatch === 'function') {
        return window.normalizeTextForMatch(text);
    }
    // نسخة احتياطية في حال لم تكن متوفرة عالمياً
    return text ? text.replace(/[^\u0621-\u064A]/g, "") : "";
}

// دالة حساب التقدم
export function calculateAchievementProgress(ach, userProfile) {
    const stats = (userProfile && userProfile.stats) ? userProfile.stats : {};
    const topicStats = stats.topicCorrect || {}; 
    let current = 0;

    if (ach.conditionType === 'section_score') {
        const subTopics = (typeof topicsData !== 'undefined' ? topicsData[ach.sectionKey] : []) || [];
        subTopics.forEach(subTopic => {
            const cleanSubTopic = getNormalized(subTopic);
            Object.keys(topicStats).forEach(userTopic => {
                if (getNormalized(userTopic) === cleanSubTopic) {
                    current += topicStats[userTopic];
                }
            });
        });
    } 
    else if (ach.conditionType === 'topic_score') {
        const targetKey = getNormalized(ach.topicKey);
        Object.keys(topicStats).forEach(playedTopic => {
            if (getNormalized(playedTopic) === targetKey) {
                current += topicStats[playedTopic];
            }
        });
    }
    else if (ach.conditionType === 'total_correct') {
        current = stats.totalCorrect || 0;
    }

    return Math.min(current, ach.target);
}

// دالة الرسم
export function renderAchievementsView(userProfile) {
    const container = document.getElementById('achievements-grid');
    if (!container) return;
    
    container.innerHTML = '';

    achievementsGallery.forEach(ach => {
        const current = calculateAchievementProgress(ach, userProfile);
        const percent = Math.floor((current / ach.target) * 100);
        const isUnlocked = percent >= 100;

        const card = document.createElement('div');
        card.className = `achievement-card ${isUnlocked ? 'unlocked' : ''}`;
        
        card.innerHTML = `
            <div class="image-reveal-wrapper">
                <img src="${ach.img}" class="img-backdrop">
                <div class="reveal-mask" style="height: ${percent}%; border-top: 1px solid #fbbf24;">
                    <img src="${ach.img}" class="img-color">
                </div>
                ${!isUnlocked ? `
                <div class="absolute top-3 left-3 z-20 bg-black/60 px-3 py-1 rounded-full border border-white/10 backdrop-blur-md flex items-center gap-1">
                    <span class="material-symbols-rounded text-slate-400 text-sm">lock</span>
                    <span class="text-[10px] text-slate-300">مغلق</span>
                </div>
                ` : `
                <div class="absolute top-3 left-3 z-20 bg-green-500/20 px-3 py-1 rounded-full border border-green-500/50 backdrop-blur-md flex items-center gap-1 animate-pulse">
                    <span class="material-symbols-rounded text-green-400 text-sm">check_circle</span>
                    <span class="text-[10px] text-green-100 font-bold">مكتمل</span>
                </div>
                `}
            </div>
            <div class="p-5 w-full bg-slate-800 border-t border-slate-700 relative z-20">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <h4 class="text-lg font-bold text-white mb-1 font-heading">${ach.title}</h4>
                        <p class="text-xs text-slate-400 leading-relaxed">${ach.desc}</p>
                    </div>
                    <div class="relative flex items-center justify-center w-12 h-12">
                        <svg class="w-full h-full transform -rotate-90">
                            <circle cx="24" cy="24" r="20" stroke="#334155" stroke-width="4" fill="transparent" />
                            <circle cx="24" cy="24" r="20" stroke="${isUnlocked ? '#22c55e' : '#f59e0b'}" stroke-width="4" fill="transparent" 
                                    stroke-dasharray="125.6" stroke-dashoffset="${125.6 - (125.6 * percent) / 100}" 
                                    class="transition-all duration-1000" stroke-linecap="round" />
                        </svg>
                        <span class="absolute text-[10px] font-bold ${isUnlocked ? 'text-green-400' : 'text-amber-500'}">${percent}%</span>
                    </div>
                </div>
                <div class="bg-slate-900/50 rounded-lg p-2 flex justify-between items-center mb-2 border border-slate-700/50">
                    <span class="text-[10px] text-slate-500">التقدم الحالي</span>
                    <span class="text-xs font-bold text-white font-mono dir-ltr">${current} / ${ach.target}</span>
                </div>
                ${isUnlocked ? `
                <div class="action-footer fade-in">
                     <a href="${ach.hdUrl}" download="Achievement_${ach.id}_HD.png" target="_blank" class="btn-download-achievement">
                        <span class="material-symbols-rounded">download</span>
                        <span>تحميل الصورة عالية الدقة</span>
                     </a>
                </div>
                ` : ''}
            </div>
        `;
        container.appendChild(card);
    });
}
