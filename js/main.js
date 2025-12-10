import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, query, where, getDocs, serverTimestamp, orderBy, limit, arrayUnion, increment } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-messaging.js";
// ==========================================
// 3. استقبال الإشعارات والتطبيق مفتوح (Foreground)
// ==========================================
onMessage(messaging, (payload) => {
    console.log('Message received. ', payload);
    const { title, body, icon } = payload.notification || {};
    
    // أ. عرض إشعار داخلي (يظهر في قائمة الجرس)
    addLocalNotification(title || 'إشعار جديد', body || '', 'campaign');

    // ب. عرض تنبيه منبثق فوري (Toast)
    toast(`🔔 ${title}`, "info");
    
    // ج. تشغيل صوت تنبيه خفيف (إذا كان الصوت مفعلاً)
    if(typeof playSound === 'function') playSound('hint');
});

import { topicsData, infallibles, badgesData, badgesMap } from './data.js';

const firebaseConfig = {
  apiKey: "AIzaSyC6FoHbL8CDTPX1MNaNWyDIA-6xheX0t4s",
  authDomain: "ahl-albayet.firebaseapp.com",
  projectId: "ahl-albayet",
  storageBucket: "ahl-albayet.firebasestorage.app",
  messagingSenderId: "160722124006",
  appId: "1:160722124006:web:1c52066fe8dbbbb8f80f27",
  measurementId: "G-9XJ425S41C"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const messaging = getMessaging(app);
const VAPID_KEY = "BFoHaonHhxeVR8ZHtvoVm_j4Khh3Gfdspkr0ftD61T_vdgzWm4cyd7wGmO_wLw-hcdIRcHpnUd5uPLNtZpfxLWM";

let currentUser = null;
let effectiveUserId = null;
let userProfile = null;
let dbTopicCounts = {};

let quizState = { 
    questions: [], idx: 0, score: 0, correctCount: 0, active: false, 
    lives: 3,
    mode: 'standard',
    history: [], streak: 0, usedHelpers: false, fastAnswers: 0, enrichmentEnabled: true,
    startTime: 0, difficulty: 'موحد', contextTopic: '', typeWriterInterval: null
};

let helpers = { fifty: false, hint: false, skip: false };
window.rewardQueue = [];
const ENRICHMENT_FREQUENCY = 0;
let transitionDelay = 2000;
let isMuted = false;
let timerInterval = null;
let audioContext = null; 
let marathonInterval = null;
let currentSelectionMode = null; 
let isVibration = localStorage.getItem('vibration_enabled_v1') === 'false' ? false : true;

// --- إصلاح تسجيل الدخول مع الحفاظ على قواعد الأمان ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // 1. الاتصال آمن وموجود (سواء كان مجهولاً أو حقيقياً)
        currentUser = user;
        
        // 2. نفحص: هل هذا المستخدم قام بتسجيل الدخول فعلياً بحسابه في التطبيق؟
        const savedId = localStorage.getItem('ahlulbaytQuiz_UserId_v2.7');

        if (savedId) {
            // نعم، لديه حساب محفوظ -> نرسله للصفحة الرئيسية فوراً
            effectiveUserId = savedId;
            await loadProfile(effectiveUserId);
            hide('auth-loading');
            hide('login-area');
            navToHome();
        } else {
            // لا، هو متصل بالسيرفر لكنه لم يسجل دخول ببياناته -> نعرض له شاشة الدخول
            // (هنا الاتصال مفتوح، لذا لن يظهر خطأ عند محاولة الدخول)
            hide('auth-loading');
            show('login-area');
            show('login-view');
        }
    } else {
        // 3. لا يوجد اتصال إطلاقاً -> نقوم بإنشاء اتصال "خفي" (Anonymous) فوراً
        // هذا ضروري لكي تسمح قواعد Firebase بقراءة البيانات عند محاولة الدخول
        signInAnonymously(auth).catch((error) => {
            console.error("Anonymous auth failed", error);
            getEl('auth-loading').innerHTML = `<p class="text-red-500">فشل الاتصال بالسيرفر. تأكد من الإنترنت.</p>`;
        });
    }
});


// --- Theme Logic ---
const themes = {
    default: 'الافتراضي',
    ruby: 'الياقوتي',
    midnight: 'الزجاجي الليلي',
    royal: 'ملكي',
    blackfrost: 'الزجاج الأسود',
    persian: 'المنمنمات',
    ashura: 'العاشورائي',
};

// بيانات الإطارات المتاحة (تمت إضافة 15 إطار جديد)
const framesData = [
    { id: 'default', name: 'بدون إطار', price: 0, cssClass: '' },
    // الكلاسيكية
    { id: 'gold', name: 'الإطار الذهبي', price: 1500, cssClass: 'frame-gold' },
    { id: 'fire', name: 'الإطار المشتعل', price: 3000, cssClass: 'frame-fire' },
    { id: 'floral', name: 'إطار الربيع', price: 1000, cssClass: 'frame-floral' },
    { id: 'diamond', name: 'الإطار الماسي', price: 5000, cssClass: 'frame-diamond' },
    { id: 'neon', name: 'إطار النيون', price: 2500, cssClass: 'frame-neon' },
    { id: 'sun', name: 'شمس الولاية', price: 4000, cssClass: 'frame-sun' },
    { id: 'eagle', name: 'جناح النسر', price: 3500, cssClass: 'frame-eagle' },
    { id: 'star', name: 'نجمة الصباح', price: 2000, cssClass: 'frame-star' },
    { id: 'galaxy', name: 'مجرة الفلك', price: 6000, cssClass: 'frame-galaxy' },
    { id: 'tech', name: 'السايبر الرقمي', price: 3000, cssClass: 'frame-tech' },
    { id: 'energy', name: 'طاقة البرق', price: 2800, cssClass: 'frame-energy' },
    { id: 'ruby', name: 'ياقوت أحمر', price: 2200, cssClass: 'frame-ruby' },
    { id: 'nature', name: 'غصن الزيتون', price: 1200, cssClass: 'frame-nature' },
    { id: 'hex', name: 'درع سداسي', price: 1800, cssClass: 'frame-hex' },
    { id: 'ghost', name: 'الطيف الأبيض', price: 4500, cssClass: 'frame-ghost' },
    
    // --- الإطارات الجديدة (المتحركة والسايبر) ---
    { id: 'cyber_pulse', name: 'نبض السايبر', price: 3200, cssClass: 'frame-cyber-pulse' },
    { id: 'matrix', name: 'المصفوفة', price: 3500, cssClass: 'frame-matrix' },
    { id: 'holo', name: 'هولوغرام', price: 3800, cssClass: 'frame-holo' },
    { id: 'radar', name: 'الرادار', price: 2500, cssClass: 'frame-radar' },
    { id: 'magma', name: 'الحمم', price: 4200, cssClass: 'frame-magma' },
    { id: 'quantum', name: 'الكمومي', price: 5500, cssClass: 'frame-quantum' },
    { id: 'royal_flow', name: 'الملكي المتحرك', price: 5000, cssClass: 'frame-royal-flow' },
    { id: 'neon_pink', name: 'نيون وردي', price: 2600, cssClass: 'frame-neon-pink' },
    { id: 'electric', name: 'كهرباء', price: 2900, cssClass: 'frame-electric' },
    { id: 'frost', name: 'الصقيع', price: 3100, cssClass: 'frame-frost' },
    { id: 'forcefield', name: 'حقل الطاقة', price: 3300, cssClass: 'frame-forcefield' },
    { id: 'pixel', name: 'ريترو بكسل', price: 2000, cssClass: 'frame-pixel' },
    { id: 'dragon', name: 'عين التنين', price: 4500, cssClass: 'frame-dragon' },
    { id: 'rgb', name: 'ألوان الطيف', price: 6500, cssClass: 'frame-rgb' },
    { id: 'dark_matter', name: 'المادة المظلمة', price: 7000, cssClass: 'frame-dark-matter' }
];



function applyTheme(themeName) {
    if (themeName === 'default') {
        document.documentElement.removeAttribute('data-theme');
    } else {
        document.documentElement.setAttribute('data-theme', themeName);
    }
}

const getEl = (id) => document.getElementById(id);
const show = (id) => getEl(id)?.classList.remove('hidden');
const hide = (id) => getEl(id)?.classList.add('hidden');
const toast = (msg, type='success') => { const t=getEl('toast-notification'); t.textContent=msg; t.className = type==='error'?'bg-red-900 border-red-500':'bg-green-900 border-green-500'; t.classList.add('show'); t.classList.remove('hidden'); setTimeout(()=>{t.classList.remove('show');t.classList.add('hidden')},5000); };

function createOscillator(freq, type, duration = 0.1, volume = 0.5) {
    if (isMuted) return;
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, audioContext.currentTime);
    gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
    oscillator.stop(audioContext.currentTime + duration);
}

function updateEnrichmentUI() {
    const btn = getEl('toggle-enrichment-btn');
    if(quizState.enrichmentEnabled) {
        btn.classList.add('text-amber-400');
        btn.classList.remove('text-slate-500');
        btn.querySelector('span').textContent = 'lightbulb';
    } else {
        btn.classList.remove('text-amber-400');
        btn.classList.add('text-slate-500');
        btn.querySelector('span').textContent = 'lightbulb_outline';
    }
}
bind('toggle-enrichment-btn', 'click', () => {
    quizState.enrichmentEnabled = !quizState.enrichmentEnabled;
    updateEnrichmentUI();
});

function playSound(type) { 
    if(isMuted) return; 
    try{ 
        if(type==='win') createOscillator(523, 'sine', 0.1, 0.4); 
        else if(type==='lose') createOscillator(130, 'triangle', 0.2, 0.3); 
        else if(type==='applause') { createOscillator(600, 'square', 0.05, 0.2); createOscillator(800, 'sawtooth', 0.08, 0.2); }
        else if(type==='streak') createOscillator(261, 'sine', 0.15, 0.5); 
    }catch(e){ isMuted = true; getEl('mute-toggle').checked = false; }
}


async function handleLogin() {
    const u = getEl('login-username-input').value.trim();
    const p = getEl('login-password-input').value.trim();
    const err = getEl('login-error-message');
    if(!u || !p) return err.textContent = "أدخل البيانات";
    getEl('login-btn').disabled = true;
    try {
        const q = query(collection(db, "users"), where("username", "==", u));
        const snap = await getDocs(q);
        if(snap.empty) { err.textContent = "مستخدم غير موجود"; getEl('login-btn').disabled = false; return; }
        const d = snap.docs[0];
        if(d.data().password === p) {
            effectiveUserId = d.id;
            localStorage.setItem('ahlulbaytQuiz_UserId_v2.7', effectiveUserId);
            await loadProfile(effectiveUserId);
            navToHome();
            toast(`أهلاً بك ${u}`);
        } else {
            err.textContent = "كلمة المرور خطأ";
            getEl('login-btn').disabled = false;
        }
    } catch(e) { err.textContent = "خطأ اتصال"; getEl('login-btn').disabled = false; }
}

async function handleReg() {
    const u = getEl('reg-username-input').value.trim();
    const p = getEl('reg-password-input').value.trim();
    const pc = getEl('reg-confirm-password-input').value.trim();
    const err = getEl('register-error-message');
    if(!u || !p) return err.textContent = "املأ الحقول";
    if(u.length < 3) return err.textContent = "الاسم قصير جداً";
    if(p !== pc) return err.textContent = "كلمة المرور غير متطابقة";
    getEl('register-btn').disabled = true;
    try {
        const q = query(collection(db, "users"), where("username", "==", u));
        const snap = await getDocs(q);
        if(!snap.empty) { err.textContent = "الاسم محجوز"; getEl('register-btn').disabled = false; return; }
        effectiveUserId = currentUser.uid;
        const data = { 
            username: u, password: p, highScore: 0, createdAt: serverTimestamp(), 
            avatar: 'account_circle', customAvatar: null, badges: ['beginner'], favorites: [],
            seenQuestions: [], 
            stats: { quizzesPlayed: 0, totalCorrect: 0, totalQuestions: 0, bestRoundScore: 0, topicCorrect: {}, lastPlayedDates: [], totalHardQuizzes: 0, noHelperQuizzesCount: 0, maxStreak: 0, fastAnswerCount: 0 }, 
            wrongQuestionsBank: []
        };
        await setDoc(doc(db, "users", effectiveUserId), data);
        localStorage.setItem('ahlulbaytQuiz_UserId_v2.7', effectiveUserId);
        await loadProfile(effectiveUserId);
        navToHome();
        toast("تم إنشاء الحساب");
    } catch(e) { console.error(e); err.textContent = "خطأ"; getEl('register-btn').disabled = false; }
}
async function fetchSystemCounts() {
    try {
        const docRef = doc(db, "system", "counts");
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            dbTopicCounts = snap.data();
        }
    } catch (e) {
        console.log("Counts not found, using defaults");
    }
}

async function loadProfile(uid) {
    try {
        // تحميل أعداد الأسئلة الحقيقية بالتوازي مع تحميل البروفايل
        fetchSystemCounts(); 

        const snap = await getDoc(doc(db, "users", uid));
        if(snap.exists()) {
            const rawData = snap.data();
            const { cleanData, wasFixed } = sanitizeUserData(rawData);

            if (wasFixed) {
                console.log("Found corrupted data for user, auto-fixing...");
                await updateDoc(doc(db, "users", uid), cleanData);
                userProfile = cleanData; 
            } else {
                userProfile = rawData; 
            }

        } else {
            userProfile = { 
                username: "ضيف", highScore: 0, badges: ['beginner'], favorites: [], wrongQuestionsBank: [], customAvatar: null,
                seenQuestions: [], stats: { topicCorrect: {}, lastPlayedDates: [], totalHardQuizzes: 0, noHelperQuizzesCount: 0, maxStreak: 0, fastAnswerCount: 0 },
                inventory: { lives: 0, helpers: { fifty: 0, hint: 0, skip: 0 }, themes: ['default'] }
            };
        }
        updateProfileUI();
    } catch(e) { console.error("Error loading profile:", e); }
}

function getAvatarHTML(imgUrl, frameId, sizeClass = "w-10 h-10") {
    const frameObj = framesData.find(f => f.id === frameId) || framesData[0];
    const frameClass = frameObj.cssClass;
    
    let imgContent;
    if (imgUrl) {
        imgContent = `<img src="${imgUrl}" class="w-full h-full object-cover rounded-full">`;
    } else {
        // أيقونة افتراضية
        imgContent = `<div class="w-full h-full rounded-full bg-slate-900 flex items-center justify-center border border-slate-600"><span class="material-symbols-rounded text-slate-200" style="font-size: 1.2em;">account_circle</span></div>`;
    }

    return `
        <div class="avatar-wrapper ${sizeClass}">
            ${imgContent}
            <div class="avatar-frame-overlay ${frameClass}"></div>
        </div>
    `;
}

function updateProfileUI() {
    getEl('username-display').textContent = userProfile.username;
        // حركة العداد للشريط العلوي
    const scoreEl = getEl('header-score');
    // نحاول قراءة الرقم الحالي (بعد إزالة الفواصل والنصوص)
    const currentDisplayed = parseInt(scoreEl.textContent.replace(/[^\d]/g, '').replace(/[\u0660-\u0669]/g, d => "0123456789"[d.charCodeAt(0) - 1632])) || 0;
    const targetScore = userProfile.highScore || 0;
    
    // إذا كان هناك فرق، نشغل الأنيميشن (لمدة 2 ثانية)
    if(currentDisplayed !== targetScore) {
        animateValue(scoreEl, currentDisplayed, targetScore, 2000);
    } else {
        scoreEl.textContent = formatNumberAr(targetScore, true);
    }

    
    // --- تحديث الأفاتار مع الإطار (طريقة جديدة) ---
    const btn = getEl('user-profile-btn');
    // تنظيف المحتوى القديم للأيقونة
    const oldImgContainer = btn.querySelector('.w-8'); 
    if(oldImgContainer) oldImgContainer.remove(); 

    // التأكد من أن البيانات موجودة لتجنب الخطأ
    const currentFrame = userProfile.equippedFrame || 'default';

    // إنشاء HTML الجديد
    const avatarHtml = getAvatarHTML(userProfile.customAvatar, currentFrame, "w-8 h-8");
    
    // إضافته للزر (قبل الاسم)
    btn.insertAdjacentHTML('afterbegin', avatarHtml);
    
    // التأكد من إخفاء العناصر القديمة إن وجدت عبر الكلاسات
    const imgEl = getEl('user-avatar-img');
    const iconEl = getEl('user-avatar-icon');
    if(imgEl) imgEl.remove(); // نحذفها لأننا استبدلناها
    if(iconEl) iconEl.remove();

    if(userProfile.wrongQuestionsBank && userProfile.wrongQuestionsBank.length > 0) {
        show('review-mistakes-btn');
        getEl('review-mistakes-text').textContent = `مراجعة أخطائي (${userProfile.wrongQuestionsBank.length})`;
    } else {
        hide('review-mistakes-btn');
    }
}

function navToHome() {
    manageAudioSystem('stop_quiz');
    stopTimer(); 
    if (quizState.typeWriterInterval) {
        clearInterval(quizState.typeWriterInterval);
        quizState.typeWriterInterval = null;
    }

    const savedDelay = localStorage.getItem('transitionDelay');
    if (savedDelay) {
        const delayVal = parseInt(savedDelay);
        transitionDelay = delayVal * 1000;
        getEl('delay-slider').value = delayVal;
        getEl('delay-val').textContent = formatNumberAr(delayVal);
    }
    
    show('top-header');
    quizState.active = false;
    
    hide('login-area'); hide('auth-loading'); hide('quiz-proper'); hide('results-area');
    show('welcome-area'); show('user-profile-container');
    
    initDropdowns();
    
    quizState.timerEnabled = localStorage.getItem('timerEnabled') === 'false' ? false : true;
    const toggleBtn = getEl('toggle-timer-btn');
    if(quizState.timerEnabled) {
        toggleBtn.classList.add('text-amber-400');
        toggleBtn.classList.remove('text-slate-500');
    } else {
        toggleBtn.classList.remove('text-amber-400');
        toggleBtn.classList.add('text-slate-500');
    }

    setTimeout(checkWhatsNew, 1500); 
    checkMarathonStatus();
    initTheme(); 

    updateThemeSelector();
    checkAndShowDailyReward(); 
}

// دالة مساعدة لتحديث قائمة الثيمات
function initTheme() {
    const savedTheme = localStorage.getItem('app_theme_v2') || 'default';
    applyTheme(savedTheme);
    // لم نعد بحاجة لربط select.onchange هنا لأن handleSelection يقوم بالمهمة
}

// دالة تحديث واجهة الثيم (تحديث النص الظاهر على الزر)
function updateThemeSelector() {
    const displayEl = getEl('txt-theme-display');
    if(!displayEl) return;
    
    const current = localStorage.getItem('app_theme_v2') || 'default';
    // التأكد من أن المستخدم يملك الثيم الحالي، وإلا نعود للافتراضي
    const owned = userProfile.inventory.themes || ['default'];
    
    if (owned.includes(current)) {
        displayEl.textContent = themes[current] || 'الافتراضي';
    } else {
        // حالة نادرة: الثيم المحفوظ غير مملوك (ربما تم حذف بيانات)
        applyTheme('default');
        displayEl.textContent = 'الافتراضي';
        localStorage.setItem('app_theme_v2', 'default');
    }
}

function openSelectionModal(mode) {
    currentSelectionMode = mode;
    const modal = document.getElementById('selection-modal');
    const container = document.getElementById('selection-list-container');
    const title = document.getElementById('selection-title');
    
    container.innerHTML = '';
    modal.classList.add('active');

    if (mode === 'category') {
        title.textContent = 'اختر القسم الرئيسي';
        renderSelectionItem(' عشوائي شامل', 'random', container);
        Object.keys(topicsData).forEach(key => renderSelectionItem(key, key, container));

    } else if (mode === 'topic') {
        title.textContent = 'اختر الموضوع الفرعي';
        const selectedCat = document.getElementById('category-select').value;
        if (!selectedCat || selectedCat === 'random') {
            container.innerHTML = '<p class="text-center text-slate-400 p-4">لا توجد مواضيع فرعية لهذا الاختيار.</p>';
        } else {
            const subs = topicsData[selectedCat];
            if (subs) subs.forEach(sub => renderSelectionItem(sub, sub, container));
        }

    } else if (mode === 'count') {
        title.textContent = 'عدد الأسئلة';
        [5, 10, 15, 20].forEach(c => renderSelectionItem(`${c} أسئلة`, c, container));

    } else if (mode === 'theme') { // --- الكود الجديد للثيمات ---
        title.textContent = 'اختر المظهر';
        const owned = userProfile.inventory.themes || ['default'];
        // نستخدم كائن themes المعرف في بداية الملف
        Object.keys(themes).forEach(key => {
            if (owned.includes(key)) {
                renderSelectionItem(themes[key], key, container);
            }
        });
    }
}


function initDropdowns() {
    const btnCat = document.getElementById('btn-category-trigger');
    const btnTop = document.getElementById('btn-topic-trigger');
    const btnCount = document.getElementById('btn-count-trigger');
    const btnTheme = document.getElementById('btn-theme-trigger'); // <-- جديد
    
    if(btnCat) btnCat.onclick = () => openSelectionModal('category');
    if(btnTop) btnTop.onclick = () => {
        if (!btnTop.disabled) openSelectionModal('topic');
        else toast("يرجى اختيار القسم الرئيسي أولاً", "error");
    };
    if(btnCount) btnCount.onclick = () => openSelectionModal('count');
    if(btnTheme) btnTheme.onclick = () => openSelectionModal('theme'); // <-- جديد
}

function renderSelectionItem(text, value, container) {
    const div = document.createElement('div');
    div.className = 'selection-item !flex-col !items-stretch !gap-1 !py-2'; 
    
    let progressHTML = '';
    
    if (currentSelectionMode === 'category' || currentSelectionMode === 'topic') {
        let current = 0;
        let max = 0;
        
        if (currentSelectionMode === 'topic') {
            current = (userProfile.stats && userProfile.stats.topicCorrect && userProfile.stats.topicCorrect[text]) || 0;
            // استخدام العدد الحقيقي من قاعدة البيانات
            max = (dbTopicCounts && dbTopicCounts[text]) || 0;
        } else if (currentSelectionMode === 'category' && value !== 'random') {
            const subTopics = topicsData[text] || [];
            let realCategoryTotal = 0;

            subTopics.forEach(sub => {
                // تجميع الأعداد الحقيقية للمواضيع الفرعية
                const subCount = (dbTopicCounts && dbTopicCounts[sub]) || 0;
                realCategoryTotal += subCount;

                current += (userProfile.stats && userProfile.stats.topicCorrect && userProfile.stats.topicCorrect[sub]) || 0;
            });
            max = realCategoryTotal;
        }

        const percent = max > 0 ? Math.min(100, Math.floor((current / max) * 100)) : 0;
        
        let barColor = 'bg-amber-500';
        if (percent >= 100) barColor = 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]'; 
        else if (percent < 30) barColor = 'bg-slate-600';

        const currentAr = formatNumberAr(current);
        const maxAr = formatNumberAr(max);

        if (value !== 'random' && max > 0) {
            progressHTML = `
                <div class="w-full mt-0.5 px-0.5">
                    <div class="flex justify-between text-[9px] text-slate-400 mb-0.5 font-mono leading-none">
                        <span class="opacity-70">المعرفة</span>
                        <span class="${percent >= 100 ? 'text-green-400 font-bold' : 'text-amber-500'}" dir="ltr">${maxAr} / ${currentAr}</span>
                    </div>
                    <div class="h-1 w-full bg-slate-900/60 rounded-full overflow-hidden border border-slate-700/30">
                        <div class="h-full ${barColor} transition-all duration-1000 relative" style="width: ${percent}%">
                            ${percent >= 100 ? '<div class="absolute inset-0 bg-white/30 animate-pulse"></div>' : ''}
                        </div>
                    </div>
                </div>
            `;
        }
    }

    div.innerHTML = `
        <div class="flex justify-between w-full items-center">
            <div class="flex items-center gap-2">
                <span class="text-base leading-tight">${text}</span>
                ${progressHTML && progressHTML.includes('text-green-400') ? '<span class="material-symbols-rounded text-green-400 text-[10px]" title="مختوم">verified</span>' : ''}
            </div>
            <span class="material-symbols-rounded text-slate-500 text-sm">chevron_left</span> 
        </div>
        ${progressHTML}
    `;
    
    div.onclick = () => handleSelection(text, value);
    container.appendChild(div);
}

function handleSelection(text, value) {
    const modal = document.getElementById('selection-modal');
    
    if (currentSelectionMode === 'category') {
        document.getElementById('category-select').value = value;
        document.getElementById('txt-category-display').textContent = text;
        const btnTop = document.getElementById('btn-topic-trigger');
        const txtTop = document.getElementById('txt-topic-display');
        const inputTop = document.getElementById('topic-select');
        inputTop.value = "";
        txtTop.textContent = "-- اختر الموضوع --";
        if (value === 'random') {
            btnTop.disabled = true;
            txtTop.textContent = "غير متاح (شامل)";
            btnTop.style.opacity = "0.5";
        } else {
            btnTop.disabled = false;
            btnTop.style.opacity = "1";
        }

    } else if (currentSelectionMode === 'topic') {
        document.getElementById('topic-select').value = value;
        document.getElementById('txt-topic-display').textContent = text;

    } else if (currentSelectionMode === 'count') {
        document.getElementById('ai-question-count').value = value;
        document.getElementById('txt-count-display').textContent = text;

    } else if (currentSelectionMode === 'theme') { // --- الكود الجديد للثيمات ---
        applyTheme(value);
        localStorage.setItem('app_theme_v2', value);
        document.getElementById('txt-theme-display').textContent = text;
        toast(`تم تطبيق: ${text}`);
    }

    modal.classList.remove('active');
}


// استبدل الدالة القديمة بهذه الدالة المحسنة
function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    // التحقق المبدئي (نقبل حتى 5 ميجا لأننا سنضغطها بشدة)
    if (file.size > 5 * 1024 * 1024) { 
        toast("حجم الصورة الأصلي كبير جداً", "error"); 
        return; 
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // 1. تقليل الأبعاد إلى 110 بكسل (كافية للأفاتار)
            const maxSize = 110; 
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxSize) { height *= maxSize / width; width = maxSize; }
            } else {
                if (height > maxSize) { width *= maxSize / height; height = maxSize; }
            }

            canvas.width = width;
            canvas.height = height;

            // رسم الصورة
            ctx.drawImage(img, 0, 0, width, height);

            // 2. التحويل إلى WebP مع جودة منخفضة (أفضل ضغط ممكن)
            // إذا لم يدعم المتصفح WebP سيعود تلقائياً لـ JPEG
            let dataUrl = canvas.toDataURL('image/webp', 0.3);
            
            // في حالة عدم دعم WebP، نعود لـ JPEG بضغط عالٍ
            if (dataUrl.indexOf('image/webp') === -1) {
                dataUrl = canvas.toDataURL('image/jpeg', 0.3);
            }

            // تحديث الواجهة
            getEl('profile-img-preview').src = dataUrl;
            show('profile-img-preview');
            hide('profile-icon-preview');
            show('delete-custom-avatar');
            
            // حفظ النتيجة المضغوطة جداً
            userProfile.tempCustomAvatar = dataUrl; 
            
            // (اختياري) طباعة الحجم الجديد في الكونسول للتأكد
            console.log(`New size: ${Math.round(dataUrl.length / 1024)} KB`);
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

// ==========================================
// 1. دالة بدء اللعبة (المنطق الأصلي تم فصله هنا)
// ==========================================
async function proceedToGame() {
    // أ. التحقق من بنك الأخطاء
    if (userProfile.wrongQuestionsBank && userProfile.wrongQuestionsBank.length > 0) {
        openModal('force-review-modal');
        return;
    }

    // ب. إعداد المتغيرات
    const cat = getEl('category-select').value;
    const count = parseInt(getEl('ai-question-count').value);
    const topicValue = getEl('topic-select').value;
    let topic = cat === 'random' || !cat ? "عام" : (topicValue || cat);

    quizState.difficulty = 'موحد';
    quizState.mode = 'standard';
    quizState.contextTopic = topic;

    const btn = getEl('ai-generate-btn');
    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-rounded animate-spin">autorenew</span> اللّهم صَلِّ على محمد وآل محمد`;

    try {
        const QUERY_LIMIT = 3000;
        let qQuery;

        if (cat === 'random' || !cat) {
            qQuery = query(collection(db, "questions"), where("isReviewed", "==", true), limit(QUERY_LIMIT));
        } else {
            qQuery = query(collection(db, "questions"), where("topic", "==", topic), where("isReviewed", "==", true), limit(QUERY_LIMIT));
        }

        const snap = await getDocs(qQuery);
        
        // التحقق من وجود أسئلة
        if (cat !== 'random' && cat !== '' && snap.empty) {
            toast("عذراً، لا توجد أسئلة متاحة لهذا الموضوع حالياً.", "error");
            btn.disabled = false;
            btn.innerHTML = `<span class="text-lg">ابدأ التحدي</span> <span class="material-symbols-rounded">play_circle</span>`;
            return;
        }

        let firebaseQs = [];
        snap.forEach(d => firebaseQs.push({ id: d.id, ...d.data() }));

        // الفلترة وتوزيع الأسئلة
        let allAvailableQuestions = firebaseQs;
        const seenIds = userProfile.seenQuestions || [];
        let freshQuestions = allAvailableQuestions.filter(q => !seenIds.includes(q.id));

        shuffleArray(freshQuestions);

        if (freshQuestions.length >= count) {
            quizState.questions = freshQuestions.slice(0, count);
        } else if (freshQuestions.length > 0) {
            quizState.questions = freshQuestions;
            toast(`تبقى لديك ${freshQuestions.length} أسئلة جديدة فقط في هذا القسم!`, "info");
        } else {
            let recycledQuestions = [...allAvailableQuestions];
            shuffleArray(recycledQuestions);
            quizState.questions = recycledQuestions.slice(0, count);
            toast("سيتم عرض اسئله سابقة في هذه الجوله.", "warning");
        }

        if (quizState.questions.length === 0) {
            toast("لا توجد أسئلة كافية لبدء الجولة.", "error");
            throw new Error("No questions");
        }

        startQuiz();
    } catch (e) {
        console.error(e);
        if (e.message !== "No questions") toast("حدث خطأ في تحميل الأسئلة", "error");
    }

    // إعادة تفعيل الزر في حال حدث خطأ ولم تبدأ اللعبة (لأن startQuiz تخفي الزر أصلاً)
    if (!quizState.active) {
        btn.disabled = false;
        btn.innerHTML = `<span class="text-lg">ابدأ التحدي</span> <span class="material-symbols-rounded">play_circle</span>`;
    }
}

// ==========================================
// 2. زر بدء التحدي (مع بوابة الإشعارات الذكية)
// ==========================================
bind('ai-generate-btn', 'click', async () => {
    // أ. التحقق أولاً: هل سبق وحفظنا التوكن لهذا المستخدم؟
    // إذا كان لديه توكن، نبدأ اللعبة فوراً لتجنب الإزعاج
    if (userProfile.fcmToken) {
        proceedToGame();
        return;
    }

    // ب. إذا لم يكن لديه، نحاول طلب الإذن
    try {
        const permission = await Notification.requestPermission();
        
        if (permission === 'granted') {
            // وافق المستخدم: نجلب التوكن ونحفظه
            const token = await getToken(messaging, { vapidKey: VAPID_KEY });
            if (token) {
                // حفظ التوكن في بروفايل المستخدم
                await updateDoc(doc(db, "users", effectiveUserId), { 
                    fcmToken: token,
                    notificationsEnabled: true,
                    lastTokenUpdate: serverTimestamp()
                });
                userProfile.fcmToken = token; // تحديث محلي
                toast("تم تفعيل الإشعارات بنجاح! 🔔");
            }
        } else {
            // رفض المستخدم أو حظر الإشعارات
            toast("نحترم خصوصيتك. يمكنك تفعيل الإشعارات لاحقاً لتصلك التحديات.", "info");
            // نسجل أنه رفض حتى لا نلح عليه كثيراً مستقبلاً (اختياري)
        }
    } catch (error) {
        console.error("Error requesting notification permission:", error);
        // لا نزعج المستخدم بالخطأ، فقط نكمل اللعبة
    }

    // ج. في جميع الأحوال (وافق أو رفض أو حدث خطأ)، ننتقل للعبة
    proceedToGame();
});



bind('review-mistakes-btn', 'click', () => {
    if(userProfile.wrongQuestionsBank.length === 0) return;
    quizState.contextTopic = "مراجعة الأخطاء";
    quizState.mode = 'standard';
    quizState.difficulty = "موحد"; 
    const qs = [...userProfile.wrongQuestionsBank];
    shuffleArray(qs);
    quizState.questions = qs.slice(0, 20);
    startQuiz();
});

bind('quit-quiz-btn', 'click', () => {
    window.showConfirm(
        "مغادرة المسابقة",
        "هل تريد الانسحاب؟ سيتم احتساب النقاط الحالية فقط.",
        "save_as",
        async () => {
            // حفظ النقاط إذا كانت أكبر من صفر قبل الخروج
            if (quizState.score > 0) {
                try {
                    const userRef = doc(db, "users", effectiveUserId);
                    await updateDoc(userRef, {
                        highScore: increment(quizState.score), // استخدام الزيادة الذرية
                        "stats.quizzesPlayed": increment(1)
                    });
                    // تحديث محلي سريع لضمان تناسق الواجهة
                    userProfile.highScore = (Number(userProfile.highScore) || 0) + quizState.score;
                    toast(`تم حفظ ${quizState.score} نقطة في رصيدك`, "success");
                } catch (e) {
                    console.error("Error saving partial score:", e);
                }
            }
            navToHome();
        }
    );
});



bind('toggle-timer-btn', 'click', () => {
    if(quizState.mode === 'marathon') { toast("⛔️ لا يمكن إيقاف المؤقت في وضع الماراثون!", "error"); return; }
    quizState.timerEnabled = !quizState.timerEnabled;
    localStorage.setItem('timerEnabled', quizState.timerEnabled); 
    updateTimerUI();
});

function updateTimerUI() {
    const btn = getEl('toggle-timer-btn');
    const barContainer = getEl('timer-bar-container');
    if(quizState.timerEnabled) {
        btn.classList.add('text-amber-400');
        btn.classList.remove('text-slate-500');
        barContainer.style.display = 'block';
        if(quizState.active) startTimer(); 
    } else {
        btn.classList.remove('text-amber-400');
        btn.classList.add('text-slate-500');
        barContainer.style.display = 'none';
        stopTimer();
    }
}

function renderLives() {
    const el = getEl('lives-display');
    
    // رسم القلوب
    el.innerHTML = `
        <div class="flex items-center gap-1 transition-all duration-300">
            <span class="material-symbols-rounded text-red-500 text-2xl drop-shadow-sm ${quizState.lives <= 1 ? 'animate-pulse' : ''}">favorite</span>
            <span class="text-red-400 font-bold text-xl font-heading pt-1" dir="ltr">x${formatNumberAr(quizState.lives)}</span>
        </div>
    `;

    // --- منطق نبض الخطر (Red Vignette) ---
    const vignette = getEl('low-health-vignette');
    if (vignette) {
        if (quizState.active && quizState.lives === 1) {
            // حالة الخطر: قلب واحد متبقي
            vignette.classList.add('animate-danger-pulse');
            vignette.style.opacity = "1"; // تأكيد الظهور
        } else {
            // حالة الأمان: إخفاء التأثير
            vignette.classList.remove('animate-danger-pulse');
            vignette.style.opacity = "0";
        }
    }
}


async function startMarathon() {
    const btn = getEl('btn-marathon-confirm');
    
    if (userProfile.lastMarathonDate) {
        const lastPlayed = userProfile.lastMarathonDate.toMillis ? userProfile.lastMarathonDate.toMillis() : new Date(userProfile.lastMarathonDate).getTime();
        const now = Date.now();
        const diff = now - lastPlayed;
        const twentyFourHours = 24 * 60 * 60 * 1000;
        
        if (diff < twentyFourHours) {
            toast("⛔️ لا يمكنك لعب الماراثون إلا مرة واحدة كل 24 ساعة.", "error");
            getEl('marathon-rules-modal').classList.remove('active');
            checkMarathonStatus();
            return;
        }
    }

    btn.disabled = true; btn.innerHTML = `<span class="material-symbols-rounded animate-spin">autorenew</span> جاري التحقق...`;

    try {
        await updateDoc(doc(db, "users", effectiveUserId), {
            lastMarathonDate: serverTimestamp()
        });
        
        userProfile.lastMarathonDate = { toMillis: () => Date.now() };

        let qQuery = query(collection(db, "questions"), where("isReviewed", "==", true));
        const snap = await getDocs(qQuery);
        let qs = [];
        snap.forEach(d => qs.push({ id: d.id, ...d.data() }));

        if (qs.length < 10) {
            toast("لا توجد أسئلة كافية لبدء الماراثون.", "error");
            throw new Error("Not enough questions");
        }

        shuffleArray(qs); 
        quizState.questions = qs.slice(0, Math.min(qs.length, 500)); 

        quizState.mode = 'marathon'; 
        quizState.contextTopic = "تحدي الماراثون";

        getEl('marathon-rules-modal').classList.remove('active'); 
        startQuiz();

    } catch(e) {
        console.error(e);
        toast("حدث خطأ أثناء الاتصال بالسيرفر", "error");
    } finally {
        btn.disabled = false; btn.innerHTML = `بدء التحدي الآن!`;
    }
}

function startQuiz() {
    // إضافة حالة للتاريخ لاعتراض زر الرجوع لاحقاً
    window.history.pushState({ view: 'playing' }, "", "");

    manageAudioSystem('start_quiz');
    hide('top-header');
    
    quizState.idx = 0; quizState.score = 0; quizState.correctCount = 0; quizState.active = true; 
    quizState.history = []; quizState.streak = 0; 
    
    const extraLives = (userProfile.inventory && userProfile.inventory.lives) ? userProfile.inventory.lives : 0;
    quizState.lives = 3 + extraLives;

    helpers = { fifty: false, hint: false, skip: false };
    quizState.usedHelpers = false; 
    quizState.fastAnswers = 0; 
    quizState.enrichmentEnabled = true;

    quizState.marathonCorrectStreak = 0; 

    if (quizState.mode === 'marathon') {
        quizState.timerEnabled = true; 
    } else {
         const initialTimerState = localStorage.getItem('timerEnabled') === 'false' ? false : true;
         quizState.timerEnabled = initialTimerState;
    }

    hide('welcome-area'); show('quiz-proper');
    getEl('quiz-topic-display').textContent = quizState.contextTopic || 'مسابقة متنوعة';
    
    getEl('ai-question-count').disabled = false;
    getEl('ai-generate-btn').disabled = false;
    getEl('btn-marathon-start').disabled = false;
    
    updateHelpersUI();
    updateStreakUI();
    updateEnrichmentUI(); 
    renderLives();
    updateTimerUI(); 
    renderQuestion();
}


function startTimer() {
    stopTimer(); 
    if(!quizState.timerEnabled) return; 
    const bar = getEl('timer-bar');
    bar.style.transition = 'none';
    bar.style.width = '100%';
    void bar.offsetWidth; 
    bar.style.transition = 'width 30s linear';
    bar.style.width = '0%';
    timerInterval = setTimeout(() => {
        if(quizState.active) {
            toast("انتهى الوقت!", "error");
            selectAnswer(-1, null); 
        }
    }, 30000);
}

function stopTimer() {
    clearTimeout(timerInterval);
    timerInterval = null;
    const bar = getEl('timer-bar');
    if(bar) {
        const computedStyle = window.getComputedStyle(bar);
        const w = computedStyle.getPropertyValue('width');
        bar.style.transition = 'none';
        bar.style.width = w;
    }
}

function renderQuestion() {
    quizState.usedHelpers = false; 
    updateHelpersUI(); 

    quizState.active = true; 
    const q = quizState.questions[quizState.idx];
    
    getEl('quiz-topic-display').textContent = q.topic || quizState.contextTopic;

    // كتابة نص السؤال
    typeWriter('question-text', q.question);
    
    // ==========================================
    // 📋 إضافة زر نسخ السؤال (جديد)
    // ==========================================
    const questionCard = document.querySelector('.question-card-3d');
    
    // التحقق لمنع تكرار الزر إذا كان موجوداً
    let qCopyBtn = document.getElementById('btn-copy-question');
    if (!qCopyBtn) {
        qCopyBtn = document.createElement('button');
        qCopyBtn.id = 'btn-copy-question';
        // تنسيق الزر: في الزاوية اليسرى العليا
        qCopyBtn.className = 'absolute top-2 left-2 text-slate-500 hover:text-amber-400 transition p-1.5 rounded-full hover:bg-white/5 z-20 opacity-50 hover:opacity-100';
        qCopyBtn.title = "نسخ نص السؤال";
        qCopyBtn.innerHTML = '<span class="material-symbols-rounded text-lg">content_copy</span>';
        
        // إضافته للبطاقة
        if(questionCard) {
            // تأكد أن البطاقة relative ليعمل الـ absolute
            questionCard.style.position = 'relative'; 
            questionCard.appendChild(qCopyBtn);
        }
    }
    
    // برمجة وظيفة النسخ (تتحدث مع كل سؤال جديد)
    if(qCopyBtn) {
        qCopyBtn.onclick = (e) => {
            e.stopPropagation(); // لمنع تفعيل أي حدث آخر
            const currentText = q.question; // نأخذ النص من المصدر مباشرة
            navigator.clipboard.writeText(currentText).then(() => {
                toast('تم نسخ نص السؤال 📋');
                if(window.triggerHaptic) window.triggerHaptic('light');
                
                // تأثير بصري بسيط
                qCopyBtn.innerHTML = '<span class="material-symbols-rounded text-lg text-green-400">check</span>';
                setTimeout(() => qCopyBtn.innerHTML = '<span class="material-symbols-rounded text-lg">content_copy</span>', 1500);
                
            }).catch(() => toast('فشل النسخ', 'error'));
        };
    }
    // ==========================================

    if (quizState.mode === 'marathon') {
        getEl('question-counter-text').textContent = `${quizState.idx+1}`;
        const dots = getEl('progress-dots'); 
        dots.innerHTML = '<span class="text-xs text-slate-500 font-mono tracking-widest">🪙 وضع الماراثون</span>';
    } else {
       getEl('question-counter-text').textContent = `${formatNumberAr(quizState.idx+1)}/${formatNumberAr(quizState.questions.length)}`;

        const dots = getEl('progress-dots'); dots.innerHTML = '';
        for(let i=0; i<quizState.questions.length; i++) {
            let cls = "w-2 h-2 rounded-full bg-slate-700";
            if(i < quizState.idx) cls = "w-2 h-2 rounded-full bg-amber-500";
            else if(i === quizState.idx) cls = "w-2 h-2 rounded-full bg-white scale-125";
            dots.innerHTML += `<div class="${cls}"></div>`;
        }
    }

    getEl('live-score-text').textContent = formatNumberAr(quizState.score);

    const box = getEl('options-container'); box.innerHTML = '';
    q.options.forEach((o, i) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerHTML = `<span class="option-number">${i+1}</span> ${o}`;
        btn.onclick = () => selectAnswer(i, btn);
        box.appendChild(btn);
    });
    getEl('feedback-text').textContent = '';
    quizState.startTime = Date.now(); 
    startTimer();
}

function nextQuestion() {
    quizState.idx++;
    if(quizState.idx < quizState.questions.length) {
        renderQuestion();
    } else {
        endQuiz();
    }
}

function updateStreakUI() {
    const icon = getEl('streak-icon');
    const txt = getEl('streak-count');

    // --- التعديل: إخفاء الستريك تماماً إذا لم يكن الوضع ماراثون ---
    if (quizState.mode !== 'marathon') {
        icon.classList.remove('active');
        icon.classList.add('opacity-0'); // إخفاء
        txt.classList.add('opacity-0');  // إخفاء
        return; 
    }
    // -----------------------------------------------------------

    const s = quizState.streak;
    txt.textContent = 'x' + formatNumberAr(s); 
    
    icon.classList.remove('text-orange-500', 'text-yellow-400', 'text-red-500', 'text-purple-500', 'animate-pulse');
    txt.classList.remove('text-orange-400', 'text-yellow-300', 'text-red-400', 'text-purple-400');
    
    if(s > 1) {
        icon.classList.remove('opacity-0'); // إظهار
        icon.classList.add('active');
        txt.classList.remove('opacity-0'); // إظهار
        if (s >= 15) { icon.classList.add('text-purple-500', 'animate-pulse'); txt.classList.add('text-purple-400'); } 
        else if (s >= 10) { icon.classList.add('text-red-500'); txt.classList.add('text-red-400'); } 
        else if (s >= 5) { icon.classList.add('text-yellow-400'); txt.classList.add('text-yellow-300'); } 
        else { icon.classList.add('text-orange-500'); txt.classList.add('text-orange-400'); }
    } else {
        icon.classList.remove('active');
        txt.classList.add('opacity-0');
        icon.classList.add('text-orange-500');
    }
}


function showEnrichment(text) {
    // 1. تحديث العداد محلياً فوراً
    if (!userProfile.stats.enrichmentCount) userProfile.stats.enrichmentCount = 0;
    userProfile.stats.enrichmentCount++;

    // 2. حفظ التحديث في قاعدة البيانات (في الخلفية)
    // نستخدم updateDoc مباشرة لضمان حفظ القراءة حتى لو خرج المستخدم من اللعبة
    if (effectiveUserId) {
        updateDoc(doc(db, "users", effectiveUserId), {
            "stats.enrichmentCount": userProfile.stats.enrichmentCount
        }).catch(e => console.error("فشل حفظ عداد القراءة", e));
    }

    // 3. عرض النافذة (الكود الأصلي للعرض)
    getEl('enrichment-content').textContent = text;
    const modal = getEl('enrichment-modal');
    modal.classList.add('active');
    
    // تشغيل صوت خفيف عند فتح المعلومة
    if(typeof playSound === 'function') playSound('hint');

    const closeHandler = (e) => {
        if(e.target === modal || modal.contains(e.target)) {
            modal.classList.remove('active');
            modal.removeEventListener('click', closeHandler);
            nextQuestion(); 
        }
    };
    modal.addEventListener('click', closeHandler);
}


function selectAnswer(idx, btn) {
    if(!quizState.active) return;
    quizState.active = false;
    stopTimer();
    const answerTime = Date.now() - quizState.startTime;
    const q = quizState.questions[quizState.idx];
    const isCorrect = idx === q.correctAnswer;
    const btns = document.querySelectorAll('.option-btn');
    btns.forEach(b => b.classList.add('pointer-events-none', 'opacity-60'));
    const qBankIdx = userProfile.wrongQuestionsBank.findIndex(x => x.question === q.question);

    if(isCorrect) {
        if (answerTime <= 5000) { quizState.fastAnswers++; }

        let basePoints = 1;
        let multiplier = 1;
        let multiplierText = "";

        if (quizState.mode === 'marathon') {
            quizState.streak++;

            if(quizState.streak > userProfile.stats.maxStreak) { userProfile.stats.maxStreak = quizState.streak; }

            quizState.marathonCorrectStreak = (quizState.marathonCorrectStreak || 0) + 1;
            if(quizState.marathonCorrectStreak === 15) {
                unlockRandomThemeReward();
                quizState.marathonCorrectStreak = 0;
            }

            if (quizState.streak >= 15) { multiplier = 4; multiplierText = "x4 🪙"; }
            else if (quizState.streak >= 9) { multiplier = 3; multiplierText = "x3 ✨"; }
            else if (quizState.streak >= 5) { multiplier = 2; multiplierText = "x2🔸"; }

            if(quizState.streak >= 5) playSound('streak'); else playSound('win');
        } else {
            quizState.streak = 0;
            playSound('win');
        }

        let pointsAdded = Math.floor(basePoints * multiplier);

        if(btn) {
            btn.classList.remove('opacity-60');
            btn.classList.add('btn-correct');
            showFloatingFeedback(btn, `+${pointsAdded}`, 'text-amber-400');
        }

        quizState.score += pointsAdded;
        quizState.correctCount++;
        const scoreEl = getEl('live-score-text');
        scoreEl.textContent = formatNumberAr(quizState.score);

        scoreEl.classList.remove('score-pop'); void scoreEl.offsetWidth; scoreEl.classList.add('score-pop');

        if(qBankIdx > -1) userProfile.wrongQuestionsBank.splice(qBankIdx, 1);
        const currentTopic = q.topic || quizState.contextTopic;
        if (currentTopic && currentTopic !== 'عام' && currentTopic !== 'مراجعة الأخطاء') {
            userProfile.stats.topicCorrect[currentTopic] = (userProfile.stats.topicCorrect[currentTopic] || 0) + 1;
        }

        getEl('feedback-text').innerHTML = `<span class="text-green-400">إجابة صحيحة! (+${formatNumberAr(pointsAdded)})</span> ${multiplierText ? `<span class="text-amber-400 text-xs bg-slate-800 px-2 py-1 rounded-full border border-amber-500/30">${multiplierText}</span>` : ''}`;
        getEl('feedback-text').className = "text-center mt-2 font-bold h-6 flex justify-center items-center gap-2";

        if(q.explanation && quizState.enrichmentEnabled) {
            setTimeout(() => showEnrichment(q.explanation), transitionDelay);
            return;
        }
        setTimeout(nextQuestion, transitionDelay);
    } else {
        quizState.marathonCorrectStreak = 0;
        quizState.fastAnswers = 0;

        if(btn) {
            btn.classList.remove('opacity-60');
            btn.classList.add('btn-incorrect');
            const deductDisplay = (quizState.score >= 2) ? 2 : quizState.score;
            showFloatingFeedback(btn, `-${deductDisplay}`, 'text-red-500');
        }

        if(q.correctAnswer >= 0 && q.correctAnswer < btns.length) {
            btns[q.correctAnswer].classList.remove('opacity-60');
            btns[q.correctAnswer].classList.add('btn-correct');
        }

        if (quizState.mode === 'marathon') {
            if (quizState.streak >= 10) { quizState.streak = 5; toast("تم تفعيل حماية الستريك! انخفض إلى 5 بدلاً من 0", "info"); }
            else if (quizState.streak >= 5) { quizState.streak = 2; }
            else { quizState.streak = 0; }
        } else {
            quizState.streak = 0;
        }

        if(quizState.lives > 3) {
            userProfile.inventory.lives = Math.max(0, userProfile.inventory.lives - 1);
            updateDoc(doc(db, "users", effectiveUserId), { "inventory.lives": userProfile.inventory.lives });
        }
        quizState.lives--;

        const deductionTarget = 2;
        let deductedFromRound = 0;
        let deductedFromBalance = 0;

        if (quizState.score >= deductionTarget) {
            quizState.score -= deductionTarget;
            deductedFromRound = deductionTarget;
        } else {
            deductedFromRound = quizState.score;
            quizState.score = 0;
            const remainingToDeduct = deductionTarget - deductedFromRound;

            if (userProfile.highScore >= remainingToDeduct) {
                userProfile.highScore -= remainingToDeduct;
                deductedFromBalance = remainingToDeduct;
            } else {
                deductedFromBalance = userProfile.highScore;
                userProfile.highScore = 0;
            }

            if (deductedFromBalance > 0) {
                updateDoc(doc(db, "users", effectiveUserId), { highScore: userProfile.highScore });
                updateProfileUI();
            }
        }

        getEl('live-score-text').textContent = formatNumberAr(quizState.score);

        renderLives();
        playSound('lose');
        getEl('quiz-proper').classList.add('shake'); setTimeout(()=>getEl('quiz-proper').classList.remove('shake'),500);
        if(qBankIdx === -1) userProfile.wrongQuestionsBank.push(q);

        if (quizState.lives <= 0) {
            getEl('feedback-text').innerHTML = 'نفدت المحاولات! <span class="material-symbols-rounded align-middle text-sm">heart_broken</span>';
            getEl('feedback-text').className = "text-center mt-2 font-bold h-6 text-red-500";
            setTimeout(showReviveModal, transitionDelay);
            return;
        }

        const totalDeducted = deductedFromRound + deductedFromBalance;
        const deductionText = totalDeducted > 0 ? `(-${formatNumberAr(totalDeducted)})` : `(+${formatNumberAr(0)})`;

        getEl('feedback-text').textContent = `إجابة خاطئة ${deductionText}`;
        getEl('feedback-text').className = "text-center mt-2 font-bold h-6 text-red-400";

        updateStreakUI();
        quizState.history.push({ q: q.question, options: q.options, correct: q.correctAnswer, user: idx, isCorrect, topic: q.topic || quizState.contextTopic, fast: (isCorrect && answerTime <= 5000) });
        setTimeout(nextQuestion, transitionDelay);
    }
}


// دالة مكافأة الماراثون
async function unlockRandomThemeReward() {
    const allThemes = ['ruby', 'midnight', 'royal', 'blackfrost', 'persian', 'ashura'];
    const owned = userProfile.inventory.themes || [];
    const available = allThemes.filter(t => !owned.includes(t));
    
    if(available.length > 0) {
        const newTheme = available[Math.floor(Math.random() * available.length)];
        userProfile.inventory.themes.push(newTheme);
        await updateDoc(doc(db, "users", effectiveUserId), { "inventory.themes": userProfile.inventory.themes });
        
        toast(`🎉 إنجاز رائع! فتحت ثيم جديد: ${newTheme} (ماراثون)`, "success");
        playSound('applause');
        updateThemeSelector();
    } else {
        // إذا كان يملك كل الثيمات، امنحه قلباً هدية
        userProfile.inventory.lives++;
        await updateDoc(doc(db, "users", effectiveUserId), { "inventory.lives": userProfile.inventory.lives });
        toast("🎉 إنجاز رائع! حصلت على قلب إضافي (ماراثون)", "success");
        quizState.lives++; // زيادة فورية في اللعبة الحالية
        renderLives();
    }
}


bind('helper-report', 'click', async () => {
    const q = quizState.questions[quizState.idx];
    const reportData = {
        questionId: q.id || 'N/A', 
        questionText: q.question,
        topic: q.topic || quizState.contextTopic,
        reportedByUserId: effectiveUserId,
        reportedByUsername: userProfile.username,
        timestamp: serverTimestamp() 
    };
    try {
        await setDoc(doc(collection(db, "reports")), reportData);
        toast("✅ تم إرسال السؤال للمطورين للمراجعة التلقائية. شكراً لمساعدتك!", "success");
    } catch (e) {
        console.error("Error sending report:", e);
        toast("❌ فشل إرسال الإبلاغ. الرجاء المحاولة لاحقاً.", "error");
    }
});

bind('share-text-button', 'click', () => {
    const score = formatNumberAr(quizState.score);
    const correct = formatNumberAr(quizState.correctCount);
    const total = formatNumberAr(quizState.questions.length);
    const accuracy = formatNumberAr(Math.round((quizState.correctCount / quizState.questions.length) * 100));
    
    const message = `🕌 من وحي أهل البيت (ع) 🌟\n` + `لقد حصلت على ${score} نقطة في: ${quizState.contextTopic}!\n` + `✅ الإجابات الصحيحة: ${correct}/${total} (${accuracy}%)\n` + `هل يمكنك تحدي رقمي؟\n` + `#مسابقة_أهل_البيت #ثقافة_شيعية`;
    if (navigator.share) {
        navigator.share({ title: 'تحدي المعرفة - من وحي أهل البيت (ع)', text: message }).then(() => toast('تمت مشاركة النتيجة بنجاح!'));
    } else {
        navigator.clipboard.writeText(message).then(() => { toast('تم نسخ النتيجة إلى الحافظة! شاركها مع أصدقائك.'); });
    }
});

function getCurrentWeekKey() {
    const d = new Date();
    const day = d.getDay(); // 0 (الأحد) - 6 (السبت)
    // حساب العودة لآخر يوم جمعة
    const diff = (day + 2) % 7; 
    
    const lastFriday = new Date(d);
    lastFriday.setDate(d.getDate() - diff);
    
    // التعديل: استخدام التاريخ المحلي يدوياً لمنع مشاكل التوقيت العالمي UTC
    const year = lastFriday.getFullYear();
    const month = String(lastFriday.getMonth() + 1).padStart(2, '0');
    const dayOfMonth = String(lastFriday.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${dayOfMonth}`;
}

async function endQuiz() {
    hide('quiz-proper'); 
    show('results-area');
    
    const safeCorrectCount = Number(quizState.correctCount) || 0;
    const safeTotalQuestions = Number(quizState.questions.length) || 0;
    const accuracy = safeTotalQuestions > 0 ? Math.round((safeCorrectCount / safeTotalQuestions) * 100) : 0;

        // بدء العداد من الصفر إلى النتيجة النهائية خلال 3 ثواني
    animateValue(getEl('card-score'), 0, quizState.score, 500);
 
    getEl('card-username').textContent = userProfile.username;
    getEl('card-difficulty').textContent = quizState.difficulty;
    
    getEl('card-correct-count').innerHTML = `<span class="material-symbols-rounded text-green-400 text-sm align-middle">check_circle</span> ${formatNumberAr(safeCorrectCount)}`;
    getEl('card-wrong-count').innerHTML = `<span class="material-symbols-rounded text-red-400 text-sm align-middle">cancel</span> ${formatNumberAr(safeTotalQuestions - safeCorrectCount)}`;

    let msg = "حاول مرة أخرى";
    if(accuracy === 100) { 
        msg = "أداء أسطوري! درجة كاملة"; 
        playSound('applause'); 
    } else if(accuracy >= 80) msg = "أداء ممتاز!";
    else if(accuracy >= 50) msg = "جيد جداً";
    
    getEl('final-message').textContent = msg;

    const stats = userProfile.stats || {};
    
    // ... (نفس الكود القديم للإحصائيات العامة) ...
    const oldTotalCorrect = Number(stats.totalCorrect) || 0;
    const oldTotalQs = Number(stats.totalQuestions) || 0;
    const oldBestScore = Number(stats.bestRoundScore) || 0;
    const oldQuizzesPlayed = Number(stats.quizzesPlayed) || 0;
    
    const currentTodayStr = new Date().toISOString().split('T')[0];
    let lastPlayedDates = Array.isArray(stats.lastPlayedDates) ? stats.lastPlayedDates.filter(d => d !== currentTodayStr).slice(-6) : [];
    if(!lastPlayedDates.includes(currentTodayStr)) lastPlayedDates.push(currentTodayStr);

    const now = new Date();
    const currentHour = now.getHours();
    const isFriday = now.getDay() === 5;
    const isNight = (currentHour >= 0 && currentHour < 5);
    const isMorning = (currentHour >= 5 && currentHour < 9);
    const isPerfect = safeCorrectCount === safeTotalQuestions && safeTotalQuestions > 0;

    const newStats = {
        quizzesPlayed: oldQuizzesPlayed + 1,
        totalCorrect: oldTotalCorrect + safeCorrectCount,
        totalQuestions: oldTotalQs + safeTotalQuestions,
        bestRoundScore: Math.max(oldBestScore, quizState.score),
        topicCorrect: stats.topicCorrect || {},
        lastPlayedDates: lastPlayedDates,
        totalHardQuizzes: Number(stats.totalHardQuizzes) || 0,
        noHelperQuizzesCount: (Number(stats.noHelperQuizzesCount) || 0) + (!quizState.usedHelpers ? 1 : 0),
        maxStreak: Math.max((Number(stats.maxStreak) || 0), quizState.streak), 
        fastAnswerCount: (Number(stats.fastAnswerCount) || 0) + (quizState.fastAnswers >= 5 ? 1 : 0),
        enrichmentCount: stats.enrichmentCount || 0,
        nightPlayCount: (stats.nightPlayCount || 0) + (isNight ? 1 : 0),
        morningPlayCount: (stats.morningPlayCount || 0) + (isMorning ? 1 : 0),
        fridayPlayCount: (stats.fridayPlayCount || 0) + (isFriday ? 1 : 0),
        perfectRounds: (stats.perfectRounds || 0) + (isPerfect ? 1 : 0),
        itemsBought: stats.itemsBought || 0
    };

    const currentTopic = quizState.contextTopic;
    if (currentTopic && currentTopic !== 'عام' && currentTopic !== 'مراجعة الأخطاء') {
        const oldTopicScore = Number(newStats.topicCorrect[currentTopic]) || 0;
        newStats.topicCorrect[currentTopic] = oldTopicScore + safeCorrectCount;
    }

    // 1. منطق الأسبوعي
    const currentWeekKey = getCurrentWeekKey();
    let weeklyStats = userProfile.weeklyStats || { key: '', correct: 0 };
    if (weeklyStats.key !== currentWeekKey) { weeklyStats = { key: currentWeekKey, correct: 0 }; }
    weeklyStats.correct += safeCorrectCount;

    // 2. منطق الشهري (الجديد)
    const currentMonthKey = getCurrentMonthKey();
    let monthlyStats = userProfile.monthlyStats || { key: '', correct: 0 };
    if (monthlyStats.key !== currentMonthKey) { monthlyStats = { key: currentMonthKey, correct: 0 }; }
    monthlyStats.correct += safeCorrectCount;

    // ... (باقي الكود: إدارة الأسئلة وبنك الأخطاء) ...
    const playedIds = quizState.questions.filter(q => q.id).map(q => q.id);
    const oldSeen = Array.isArray(userProfile.seenQuestions) ? userProfile.seenQuestions : [];
    let updatedSeenQuestions = [...new Set([...oldSeen, ...playedIds])]; 
    if (updatedSeenQuestions.length > 2000) { updatedSeenQuestions = updatedSeenQuestions.slice(-1000); }

    let updatedWrongQuestionsBank = Array.isArray(userProfile.wrongQuestionsBank) ? userProfile.wrongQuestionsBank : [];
    if (updatedWrongQuestionsBank.length > 15) updatedWrongQuestionsBank = updatedWrongQuestionsBank.slice(-15);

    const firestoreUpdates = {
        highScore: increment(quizState.score), 
        stats: newStats, 
        weeklyStats: weeklyStats,
        monthlyStats: monthlyStats, // <--- تم الإضافة
        wrongQuestionsBank: updatedWrongQuestionsBank, 
        seenQuestions: updatedSeenQuestions,
    };

    try {
        await updateDoc(doc(db, "users", effectiveUserId), firestoreUpdates);
        
        userProfile.highScore = (Number(userProfile.highScore) || 0) + quizState.score;
        userProfile.stats = newStats;
        userProfile.weeklyStats = weeklyStats;
        userProfile.monthlyStats = monthlyStats; // تحديث محلي
        userProfile.wrongQuestionsBank = updatedWrongQuestionsBank;
        userProfile.seenQuestions = updatedSeenQuestions;
        
        updateProfileUI(); 

        setTimeout(async () => {
            const gotBadge = await checkAndUnlockBadges();
            if (!gotBadge) { showMotivator(); }
        }, 1000);

    } catch(e) {
        console.error("Error saving quiz results:", e);
        toast("تم حفظ النقاط محلياً مؤقتاً لضعف الاتصال", "info");
        // تحديث محلي للطوارئ
        userProfile.highScore = (Number(userProfile.highScore) || 0) + quizState.score;
        userProfile.weeklyStats = weeklyStats;
        userProfile.monthlyStats = monthlyStats;
        updateProfileUI();
    }

    addLocalNotification('نهاية جولة', `أتممت جولة في "${quizState.contextTopic}". النتيجة: ${quizState.score} نقطة.`, 'sports_score');
    renderReviewArea();
}

function renderReviewArea() {
    const box = getEl('review-items-container'); 
    box.innerHTML = '';
    show('review-area'); 
    getEl('review-area').querySelector('h3').textContent = "مراجعة بعض أسئلة الجولة";
    quizState.history.forEach((h, i) => {
        const div = document.createElement('div');
        const cardClass = h.isCorrect ? "bg-green-900/20 border-green-800" : "bg-red-900/20 border-red-800";
        div.className = `text-sm p-3 rounded-lg border mb-3 ${cardClass}`;
        const statusIcon = h.isCorrect 
            ? '<span class="material-symbols-rounded text-green-400 align-middle">check_circle</span>' 
            : '<span class="material-symbols-rounded text-red-500 align-middle">cancel</span>';
        // التعديل: تعريب رقم السؤال (i+1)
        div.innerHTML = `<p class="text-white font-bold mb-1">${statusIcon} ${formatNumberAr(i+1)}. ${h.q}</p>`;
        h.options.forEach((o, idx) => {
            let clr = "text-slate-400"; 
            if (idx === h.correct) clr = "text-green-400 font-bold";
            if (idx === h.user) {
                if (h.isCorrect) clr = "text-green-300 font-bold underline"; 
                else clr = "text-red-400 line-through"; 
            }
            div.innerHTML += `<span class="block ${clr} mr-2">- ${o}</span>`;
        });
        if (!h.isCorrect) div.innerHTML += `<p class="text-sm text-green-400 mt-2 pt-1 border-t border-red-800/50">الصحيح كان: ${h.options[h.correct]}</p>`;
        box.appendChild(div);
    });
}


function updateHelpersUI() {
    const helperIds = ['helper-fifty-fifty', 'helper-hint', 'helper-skip'];
    const isUsed = quizState.usedHelpers; // هل تم استخدام مساعدة في هذا السؤال؟

    helperIds.forEach(id => {
        const btn = getEl(id);
        
        // إذا تم استخدام مساعدة، نعطل كل الأزرار
        // إذا لم يتم، نفعلها
        btn.disabled = isUsed; 
        
        if (isUsed) {
            btn.classList.add('opacity-30', 'cursor-not-allowed', 'grayscale');
            btn.classList.remove('hover:text-amber-400');
        } else {
            btn.classList.remove('opacity-30', 'cursor-not-allowed', 'grayscale');
            btn.classList.add('hover:text-amber-400');
        }

        // إزالة أي شارة قديمة وإعادة رسمها
        const typeKey = id.replace('helper-', '').replace('-fifty', ''); // fifty, hint, skip
        const oldBadge = btn.querySelector('.count-badge');
        if(oldBadge) oldBadge.remove();

        const count = userProfile.inventory.helpers[typeKey === 'fifty-fifty' ? 'fifty' : typeKey] || 0;
        if(count > 0) {
            const badge = document.createElement('span');
            badge.className = 'count-badge';
            badge.textContent = `x${count}`;
            btn.style.position = 'relative';
            btn.appendChild(badge);
        }
    });
    
    // زر الإبلاغ يبقى مفعلاً دائماً
    getEl('helper-report').disabled = false;
}

async function useHelper(type, cost, actionCallback) {
    if(!quizState.active) return;

    // 1. القيد: منع الاستخدام إذا تم استخدام مساعدة مسبقاً في هذا السؤال
    if (quizState.usedHelpers) {
        toast("عذراً، يسمح بمساعدة واحدة فقط لكل سؤال! 🚫", "error");
        playSound('lose');
        return;
    }

    // التحقق من الرصيد قبل التنفيذ
    const hasInventory = userProfile.inventory.helpers[type] > 0;
    if (!hasInventory && quizState.score < cost) {
        toast(`رصيدك غير كافٍ! تحتاج ${cost} نقطة.`, "error");
        return;
    }

    // 2. التنفيذ الفوري (لحل مشكلة التأخير)
    // نقوم بتنفيذ التأثير البصري وإخفاء الأجوبة فوراً قبل الاتصال بالسيرفر
    quizState.usedHelpers = true;
    actionCallback(); 
    updateHelpersUI(); // سيقوم بتعطيل باقي الأزرار فوراً
    
    // 3. الخصم وتحديث السيرفر (في الخلفية)
    if(hasInventory) {
        userProfile.inventory.helpers[type]--;
        toast(`تم استخدام ${type} من الحقيبة`);
        // تحديث السيرفر بدون await لعدم تعطيل الواجهة
        updateDoc(doc(db, "users", effectiveUserId), { [`inventory.helpers.${type}`]: userProfile.inventory.helpers[type] }).catch(console.error);
    } else {
        quizState.score -= cost;
        getEl('live-score-text').textContent = formatNumberAr(quizState.score);
        toast(`تم خصم ${cost} نقطة`);
        // تحديث النقاط فقط إذا لم يكن مخزون
        // لا نقوم بتحديث السيرفر للنقاط هنا لتخفيف الضغط، سيتم حفظها مع نهاية السؤال أو الجولة
    }
}


bind('helper-fifty-fifty', 'click', () => {
    useHelper('fifty', 4, () => {
        const q = quizState.questions[quizState.idx];
        const opts = document.querySelectorAll('.option-btn');
        let removed = 0;
        [0,1,2,3].sort(()=>Math.random()-0.5).forEach(i => { 
            if(i !== q.correctAnswer && removed < 2) { opts[i].classList.add('option-hidden'); removed++; } 
        });
    });
});

bind('helper-hint', 'click', () => {
    useHelper('hint', 3, () => {
        const q = quizState.questions[quizState.idx];
        const opts = document.querySelectorAll('.option-btn');
        let removed = 0;
        [0,1,2,3].forEach(i => { 
            if(i !== q.correctAnswer && removed < 1) { opts[i].classList.add('option-hidden'); removed++; } 
        });
    });
});

bind('helper-skip', 'click', () => {
    useHelper('skip', 1, () => {
        nextQuestion();
    });
});

bind('action-fav', 'click', async () => {
    const q = quizState.questions[quizState.idx];
    const isAlreadyFavorite = userProfile.favorites.some(fav => fav.question === q.question);
    if (!isAlreadyFavorite) {
        await updateDoc(doc(db,"users",effectiveUserId),{favorites:arrayUnion(q)});
        userProfile.favorites.push(q); 
        toast("تم الحفظ في المفضلة");
    } else { toast("السؤال موجود بالفعل في المفضلة", "error"); }
});

/* =========================================
   Step 2: Smart Navigation Logic
   ========================================= */

function toggleMenu(open) { 
    const m = getEl('side-menu'); 
    const o = getEl('side-menu-overlay'); 
    
    if(open) { 
        m.classList.add('open'); 
        o.classList.add('open');
        // تسجيل فتح القائمة في السجل
        window.history.pushState({menuOpen: true}, ""); 
    } else { 
        m.classList.remove('open'); 
        o.classList.remove('open');
        // ملاحظة: لا نقوم بـ back() هنا يدوياً لتجنب التعارض مع زر الرجوع
    } 
}

bind('menu-btn', 'click', () => toggleMenu(true));



const openModal = (id) => { 
    toggleMenu(false); 
    
    // منطق التراكم (Stacking):
    // نغلق النوافذ الأخرى فقط إذا لم تكن النافذة الجديدة هي "بروفايل اللاعب"
    // هذا يسمح لبروفايل اللاعب أن يفتح فوق المتصدرين
    if (id !== 'player-profile-modal') {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active')); 
    }

    const modal = getEl(id);
    if(modal) {
        modal.classList.add('active');
        // تسجيل النافذة في السجل
        window.history.pushState({modalOpen: id}, ""); 
    }
};

// تحديث أزرار الإغلاق لتستخدم زر الرجوع
document.querySelectorAll('.close-modal').forEach(b => {
    // استنساخ الزر لإزالة الأحداث القديمة
    const newBtn = b.cloneNode(true);
    b.parentNode.replaceChild(newBtn, b);
    
    newBtn.onclick = (e) => {
        e.preventDefault();
        // إذا كان هناك سجل (نافذة مفتوحة)، نعود للخلف
        if(window.history.state && (window.history.state.modalOpen || window.history.state.menuOpen)) {
            window.history.back();
        } else {
            // حالة طوارئ: إغلاق يدوي
            document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
        }
    };
});


bind('nav-home', 'click', () => { toggleMenu(false); navToHome(); });


bind('nav-badges', 'click', () => {
    openModal('badges-modal');
    const container = getEl('badges-list');
    
    container.className = 'badges-list-container'; 
    container.innerHTML = '';

    const sortedBadges = sortBadgesSmartly();

    sortedBadges.forEach(b => {
        const progressData = getBadgeProgress(b);
        const targetLvl = progressData.activeLevel;
        
        let iconColorClass = 'text-slate-600 opacity-50';
        let glowClass = ''; 
        let tierText = '';
        let barColor = '#ef4444'; 

        if (progressData.tier === 'bronze' || (progressData.percent > 0 && progressData.tier === 'locked')) {
            iconColorClass = 'text-red-500 drop-shadow-sm';
            tierText = 'مستوى برونزي';
            barColor = '#ef4444';
        } else if (progressData.tier === 'silver') {
            iconColorClass = 'text-slate-100 drop-shadow-md'; 
            glowClass = 'shadow-[0_0_10px_rgba(255,255,255,0.3)]';
            tierText = 'مستوى فضي';
            barColor = '#f8fafc';
        } else if (progressData.tier === 'gold') {
            iconColorClass = 'text-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.8)]';
            tierText = 'مستوى ذهبي 👑';
            barColor = '#fbbf24';
        } else if (progressData.tier === 'diamond') {
            iconColorClass = 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.6)] animate-pulse';
            tierText = 'مستوى ماسي 💎';
            barColor = '#22d3ee';
        } else if (progressData.tier === 'legendary') {
            iconColorClass = 'text-red-600 drop-shadow-[0_0_15px_rgba(239,68,68,0.8)] animate-pulse-slow';
            tierText = 'مستوى أسطوري 🔥';
            barColor = '#ef4444';
        }

        let miniRewardHtml = '';
        if (targetLvl.rewards && !progressData.isMaxed) {
             let rewardsList = [];
             if(targetLvl.rewards.score) rewardsList.push(`<span class="text-amber-400">${formatNumberAr(targetLvl.rewards.score)} <span class="material-symbols-rounded text-[9px]">monetization_on</span></span>`);
             if(targetLvl.rewards.lives) rewardsList.push(`<span class="text-red-500">+${targetLvl.rewards.lives} <span class="material-symbols-rounded text-[9px]">favorite</span></span>`);
             if(targetLvl.rewards.hint) rewardsList.push(`<span class="text-yellow-400">+${targetLvl.rewards.hint} <span class="material-symbols-rounded text-[9px]">lightbulb</span></span>`);
             
             miniRewardHtml = `<div class="flex gap-2 text-[9px] font-bold bg-black/20 px-2 py-0.5 rounded-full">${rewardsList.join('<span class="text-slate-600">|</span>')}</div>`;
        } else if (progressData.isMaxed) {
            miniRewardHtml = '<span class="text-[9px] text-green-400 font-bold">تم الختم</span>';
        }

        let cardClass = progressData.percent > 0 ? 'active-target' : 'locked';
        if (progressData.isMaxed) cardClass = 'unlocked';
        if (progressData.tier === 'diamond') cardClass += ' diamond';
        if (progressData.tier === 'legendary') cardClass += ' legendary';

        const div = document.createElement('div');
        div.className = `badge-card ${cardClass} ${progressData.tier === 'gold' ? 'border-amber-500/50' : ''}`;
        
        div.innerHTML = `
            <div class="flex flex-col items-center justify-center gap-1 ml-3 shrink-0" style="min-width: 60px;">
                <div class="badge-icon-box ${iconColorClass} ${glowClass}">
                    <img src="${b.image}" alt="${b.name}">
                </div>
            </div>

            <div class="badge-info flex flex-col justify-center h-full w-full">
                <div class="flex justify-between items-center mb-1">
                    <div class="flex flex-col">
                        <h4 class="font-bold text-white text-sm leading-tight">${b.name}</h4>
                        <span class="text-[10px] ${iconColorClass} font-bold opacity-90">${tierText || 'غير مكتسب'}</span>
                    </div>
                    
                    <div class="flex flex-col items-end gap-1">
                        <div class="bg-slate-900/50 px-2 py-0.5 rounded text-[10px] border border-white/5 shrink-0">
                            <span class="text-amber-400 font-bold" dir="ltr">${formatNumberAr(progressData.current)} / ${formatNumberAr(progressData.max)}</span>
                        </div>
                    </div>
                </div>
                
                <p class="text-[10px] text-slate-400 mb-2 leading-tight opacity-80 pl-1">${b.desc}</p>
                <div class="flex justify-between items-center mb-1">${miniRewardHtml || '<span></span>'}</div>
                
                <div class="badge-progress-track" style="height: 6px; background: rgba(255,255,255,0.05); border-radius: 4px; overflow: hidden;">
                    <div class="badge-progress-fill" style="width: ${progressData.percent}%; background: ${barColor}; transition: width 1s;"></div>
                </div>
            </div>
        `;

        container.appendChild(div);
    });
});

// إلغاء المتغير القديم وتثبيت الوضع على الشهري
let currentLeaderboardMode = 'monthly';

bind('nav-leaderboard', 'click', () => {
    openModal('leaderboard-modal');
    
    // إزالة حاوية التبويبات القديمة إذا كانت موجودة (لتنظيف الواجهة)
    const oldTabs = document.getElementById('lb-tabs-container');
    if (oldTabs) oldTabs.remove();

    // تحميل اللوحة الشهرية مباشرة
    loadLeaderboard();
});

async function loadLeaderboard() {
    hide('leaderboard-loading');
    show('leaderboard-list');
    renderSkeleton('leaderboard', 6);
    
    const modalTitle = document.querySelector('#leaderboard-modal h3');
    if(modalTitle) modalTitle.textContent = "لوحة الشرف (الشهرية)";

    let subTitle = document.getElementById('lb-subtitle-text');
    if(!subTitle) {
        subTitle = document.createElement('p');
        subTitle.id = 'lb-subtitle-text';
        subTitle.className = "text-[11px] text-slate-400 text-center mb-2 opacity-80";
        subTitle.style.fontFamily = "'Amiri', serif"; 
        // إضافة العنوان الفرعي بعد عنوان النافذة مباشرة
        if(modalTitle) modalTitle.parentNode.after(subTitle);
    }
    subTitle.textContent = "التنافس على لقب بطل هذا الشهر";

    try {
        const currentMonthKey = getCurrentMonthKey();
        // استعلام ثابت للإحصائيات الشهرية فقط
        const q = query(collection(db, "users"), where("monthlyStats.key", "==", currentMonthKey), orderBy("monthlyStats.correct", "desc"), limit(20));
        
        const s = await getDocs(q);
        const l = getEl('leaderboard-list');
        l.innerHTML = '';
        
        if (s.empty) {
            l.innerHTML = `<div class="text-center text-slate-400 py-6">بداية شهر جديد! كن أول المنافسين في القائمة.</div>`;
            return;
        }

        let r = 1;
        s.forEach(d => {
            const data = d.data();
            // جلب النقاط الشهرية فقط
            const correctCount = (data.monthlyStats && data.monthlyStats.correct) ? data.monthlyStats.correct : 0;

            let borderClass = 'border-slate-700'; 
            let medalIcon = `<span class="text-slate-500 font-mono font-bold text-sm w-6 text-center">#${formatNumberAr(r)}</span>`;
            let bgClass = 'bg-slate-800';
            
            if (r <= 3) {
                borderClass = 'border-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.3)]';
                bgClass = 'bg-gradient-to-r from-slate-800 to-amber-900/20';
            }
            if (r === 1) medalIcon = '<span class="material-symbols-rounded text-amber-400 text-2xl drop-shadow-md">emoji_events</span>'; 
            else if (r === 2) medalIcon = '<span class="material-symbols-rounded text-slate-300 text-2xl drop-shadow-md">military_tech</span>';
            else if (r === 3) medalIcon = '<span class="material-symbols-rounded text-orange-700 text-2xl drop-shadow-md">military_tech</span>';

            const pFrame = data.equippedFrame || 'default';
            const avatarHtml = getAvatarHTML(data.customAvatar, pFrame, "w-10 h-10");
            
            let fontSizeClass = 'text-lg';
            const nameLen = (data.username || "").length;
            if (nameLen > 25) fontSizeClass = 'text-[10px] leading-tight'; 
            else if (nameLen > 18) fontSizeClass = 'text-xs'; 
            else if (nameLen > 12) fontSizeClass = 'text-sm'; 

            const row = document.createElement('div');
            row.className = `flex justify-between items-center p-3 ${bgClass} rounded-xl border-2 ${borderClass} mb-3 transition transform hover:scale-[1.01] cursor-pointer group hover:bg-slate-700`;
            
            row.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="flex items-center justify-center min-w-[40px] shrink-0">${medalIcon}</div>
                    <div class="flex items-center justify-center shrink-0 relative z-10">${avatarHtml}</div>
                    <div class="flex flex-col overflow-hidden w-full">
                        <span class="text-white ${fontSizeClass} font-bold group-hover:text-amber-400 transition whitespace-nowrap overflow-hidden text-ellipsis" style="font-family: 'Amiri', serif;">${data.username}</span>
                        <span class="text-[10px] text-slate-400">نقاط الشهر</span>
                    </div>
                </div>
                <div class="text-center pl-2 shrink-0 min-w-[60px]">
                    <span class="text-green-400 font-mono font-bold text-lg block leading-none text-shadow">${formatNumberAr(correctCount)}</span>
                    <span class="material-symbols-rounded text-[10px] text-slate-500">check_circle</span>
                </div>`;
            row.onclick = () => showPlayerProfile(data);
            l.appendChild(row);
            r++;
        });
    } catch(e) { 
        console.error(e); 
        if(e.message.includes("index")) {
            getEl('leaderboard-list').innerHTML = `<a href="#" onclick="alert('افحص الكونسول لإنشاء الفهرس')" class="text-red-400 underline block text-center mt-4">مطلوب إنشاء Index جديد</a>`;
        } else {
            getEl('leaderboard-list').innerHTML = `<div class="text-center text-red-400 mt-4">خطأ في التحميل</div>`; 
        }
    }
}


function showPlayerProfile(data) {
    // 1. تعبئة البيانات الأساسية (الاسم والنقاط)
    getEl('popup-player-name').textContent = data.username;
    getEl('popup-player-score').textContent = `${formatNumberAr(data.highScore)} نقطة`;
    
    // 2. عرض الصورة الشخصية (الأفاتار)
    if (data.customAvatar) {
        getEl('popup-player-img').src = data.customAvatar;
        show('popup-player-img');
        hide('popup-player-icon');
    } else {
        hide('popup-player-img');
        show('popup-player-icon');
    }

    // 3. تجهيز حاوية الأوسمة
    const bContainer = getEl('popup-player-badges');
    bContainer.innerHTML = '';
    bContainer.className = 'grid grid-cols-3 gap-4 justify-items-center max-h-60 overflow-y-auto p-4 scrollbar-thin';

    // 4. صندوق الوصف (لإظهار قصة الوسام عند الضغط عليه)
    let descBox = document.getElementById('profile-badge-desc-box');
    if (!descBox) {
        descBox = document.createElement('div');
        descBox.id = 'profile-badge-desc-box';
        descBox.className = 'mt-4 p-3 bg-slate-900/50 rounded-lg border border-slate-700 text-center min-h-[4rem] flex items-center justify-center w-full';
        bContainer.parentNode.appendChild(descBox);
    }
    descBox.innerHTML = '<p class="text-xs text-slate-500 animate-pulse">اضغط على أي وسام لمعرفة قصته</p>';

    // 5. منطق فلترة وعرض الأوسمة
    if (data.badges && data.badges.length > 0) {
        const bestBadges = {};

        // أ. تجميع الأوسمة واختيار الأعلى رتبة فقط
        data.badges.forEach(bid => {
            if (bid === 'beginner') return; // تجاهل وسام البداية
            
            const [baseId, lvlPart] = bid.split('_lvl');
            const level = parseInt(lvlPart) || 1; 
            
            if (!bestBadges[baseId] || level > bestBadges[baseId].level) {
                bestBadges[baseId] = { id: bid, baseId: baseId, level: level };
            }
        });

        const finalBadges = Object.values(bestBadges);

        if (finalBadges.length === 0) {
            bContainer.innerHTML = '<span class="col-span-3 text-xs text-slate-500 py-6">لم يحصل هذا اللاعب على أوسمة خاصة بعد.</span>';
        } else {
            finalBadges.forEach(item => {
                const bObj = badgesMap[item.baseId];
                if(bObj) {
                    // تحديد الستايل (اللون والتوهج) حسب المستوى
                    let tierName = 'برونزي';
                    let glowStyle = 'box-shadow: 0 0 10px rgba(180, 83, 9, 0.4); border-color: #b45309;';
                    let tierColorHex = '#b45309';

                    if(item.level === 2) {
                        tierName = 'فضي';
                        glowStyle = 'box-shadow: 0 0 12px rgba(203, 213, 225, 0.6); border-color: #cbd5e1;';
                        tierColorHex = '#cbd5e1';
                    } else if(item.level === 3) {
                        tierName = 'ذهبي';
                        glowStyle = 'box-shadow: 0 0 15px rgba(251, 191, 36, 0.8); border-color: #fbbf24;';
                        tierColorHex = '#fbbf24';
                    } else if(item.level === 4) {
                        tierName = 'ماسي';
                        glowStyle = 'box-shadow: 0 0 15px rgba(34, 211, 238, 0.8); border-color: #22d3ee;';
                        tierColorHex = '#22d3ee';
                    } else if(item.level === 5) {
                        tierName = 'أسطوري';
                        glowStyle = 'box-shadow: 0 0 20px rgba(239, 68, 68, 0.9); border-color: #ef4444; animation: pulse-slow 2s infinite;';
                        tierColorHex = '#ef4444';
                    }

                    // إنشاء عنصر الوسام
                    const badgeDiv = document.createElement('div');
                    badgeDiv.className = 'flex flex-col items-center gap-2 group cursor-pointer w-full';
                    
                    badgeDiv.innerHTML = `
                        <div class="relative w-14 h-14 rounded-full border-2 bg-black transition transform group-hover:scale-110 duration-300" style="${glowStyle}">
                            <img src="${bObj.image}" class="w-full h-full object-cover rounded-full p-0.5">
                        </div>
                        <div class="text-center">
                            <span class="block text-[10px] text-white font-bold leading-tight">${bObj.name}</span>
                            <span class="block text-[9px] font-mono mt-0.5" style="color: ${tierColorHex}; opacity: 0.9">(${tierName})</span>
                        </div>
                    `;

                    // إضافة حدث النقر لعرض الوصف
                    badgeDiv.onclick = () => {
                         // إعادة تكبير الأيقونات الأخرى لحجمها الطبيعي
                         const allRings = bContainer.querySelectorAll('.relative.w-14');
                         allRings.forEach(r => r.style.transform = 'scale(1)');
                         
                         // تكبير الأيقونة المختارة
                         badgeDiv.querySelector('.relative.w-14').style.transform = 'scale(1.15)';

                         // عرض الوصف
                         descBox.innerHTML = `
                            <div class="fade-in">
                                <strong class="text-amber-400 text-xs block mb-1 border-b border-amber-500/20 pb-1 mx-auto w-fit">${bObj.name}</strong>
                                <p class="text-xs text-slate-200 leading-relaxed">
                                    <span class="text-green-400 font-bold">"${bObj.desc}"</span>
                                </p>
                            </div>
                         `;
                         playSound('click');
                    };

                    bContainer.appendChild(badgeDiv);
                }
            });
        }
    } else { 
        bContainer.innerHTML = '<span class="col-span-3 text-xs text-slate-500 py-6">لا توجد أوسمة مكتسبة.</span>'; 
    }

    openModal('player-profile-modal');
}

bind('nav-favs', 'click', () => { 
    openModal('fav-modal'); 
    const l = getEl('fav-list'); 
    l.innerHTML = ''; 
    if(!userProfile.favorites || userProfile.favorites.length === 0) { l.innerHTML = '<p class="text-center text-slate-500">لا توجد مفضلة</p>'; return; } 
    userProfile.favorites.forEach((f, i) => { 
        const d = document.createElement('div'); 
        d.className = "p-3 bg-slate-800 rounded border border-slate-600 mb-2 flex justify-between items-center gap-2"; 
        d.innerHTML = `<div><p class="text-amber-400 text-sm font-bold mb-1">${f.question}</p><p class="text-xs text-slate-400">الإجابة: ${f.options[f.correctAnswer]}</p></div>`; 
        const b = document.createElement('button'); 
        b.className = "text-red-400 hover:text-red-300 p-2 transition"; 
        b.innerHTML = '<span class="material-symbols-rounded">delete</span>'; 
        b.onclick = async () => { 
            userProfile.favorites.splice(i, 1); 
            getEl('nav-favs').click(); 
            try { await updateDoc(doc(db,"users",effectiveUserId),{favorites:userProfile.favorites}); toast("تم الحذف"); } catch(e) { toast("خطأ في المزامنة", "error"); } 
        }; 
        d.appendChild(b); 
        l.appendChild(d); 
    }); 
});

bind('nav-mistakes', 'click', () => { toggleMenu(false); getEl('review-mistakes-btn').click(); });
bind('nav-settings', 'click', () => openModal('settings-modal'));
// التغيير يحدث عند ترك الزر لتقليل الوميض
bind('font-size-slider', 'change', (e) => document.documentElement.style.setProperty('--base-size', e.target.value+'px'));

bind('delay-slider', 'input', (e) => { 
    const v = parseInt(e.target.value);
    transitionDelay = v * 1000; 
    getEl('delay-val').textContent = formatNumberAr(v);
    localStorage.setItem('transitionDelay', v);
});

const handleLogout = () => { 
    window.showConfirm(
        "تسجيل الخروج",
        "هل أنت متأكد من رغبتك في تسجيل الخروج؟",
        "logout",
        () => {
            localStorage.removeItem('ahlulbaytQuiz_UserId_v2.7'); 
            location.reload(); 
        }
    );
};


bind('logout-btn', 'click', handleLogout);
bind('logout-btn-menu', 'click', handleLogout);

bind('clear-cache-btn', 'click', () => { 
    window.showConfirm(
        "مسح البيانات",
        "هل أنت متأكد؟ سيتم حذف البيانات المحفوظة محلياً وتسجيل الخروج. لن يتم حذف حسابك من السيرفر.",
        "delete_forever",
        () => {
            localStorage.clear(); 
            location.reload(); 
        }
    );
});

bind('nav-about', 'click', () => openModal('about-modal'));

bind('user-profile-btn', 'click', () => {
    openModal('user-modal'); 
    
    // 1. تعبئة البيانات الأساسية
    getEl('edit-username').value = userProfile.username;
    
    // 2. عرض تاريخ الانضمام
    let joinDateStr = "غير معروف";
    if (userProfile.createdAt) {
        const dateObj = userProfile.createdAt.toDate ? userProfile.createdAt.toDate() : new Date(userProfile.createdAt);
        joinDateStr = dateObj.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
    }
    getEl('profile-join-date').textContent = `انضم في: ${joinDateStr}`;

    // 3. عرض الصورة الشخصية
    if(userProfile.customAvatar) {
         getEl('profile-img-preview').src = userProfile.customAvatar;
         show('profile-img-preview');
         hide('profile-icon-preview');
         show('delete-custom-avatar');
    } else {
         hide('profile-img-preview');
         show('profile-icon-preview');
         hide('delete-custom-avatar');
    }
    
    // 4. عرض الإحصائيات
    const stats = userProfile.stats || {};
    const totalQ = stats.totalQuestions || 0;
    const totalC = stats.totalCorrect || 0;
    const accuracy = totalQ > 0 ? Math.round((totalC / totalQ) * 100) : 0;

    getEl('profile-stat-score').textContent = formatNumberAr(userProfile.highScore);
    getEl('profile-stat-played').textContent = formatNumberAr(stats.quizzesPlayed || 0);
    getEl('profile-stat-correct').textContent = formatNumberAr(totalC);
    getEl('profile-stat-accuracy').textContent = `%${formatNumberAr(accuracy)}`;

    // 5. عرض الأوسمة (النظام الجديد)
    const badgesContainer = getEl('profile-badges-display');
    badgesContainer.innerHTML = '';
    
    // ضبط الحاوية لتكون شبكة مرتبة
    badgesContainer.className = 'grid grid-cols-3 gap-4 justify-items-center bg-slate-900/50 p-4 rounded-xl border border-slate-800 min-h-[100px] max-h-[300px] overflow-y-auto';

    if (userProfile.badges && userProfile.badges.length > 0) {
        const bestBadges = {};

        // أ. تجميع الأوسمة واختيار الأعلى رتبة فقط
        userProfile.badges.forEach(bid => {
            if (bid === 'beginner') return; // تجاهل وسام البداية
            
            const [baseId, lvlPart] = bid.split('_lvl');
            const level = parseInt(lvlPart) || 1; // رقم المستوى
            
            // إذا لم يكن الوسام موجوداً أو وجدنا مستوى أعلى منه، نقوم بتحديثه
            if (!bestBadges[baseId] || level > bestBadges[baseId].level) {
                bestBadges[baseId] = { id: bid, baseId: baseId, level: level };
            }
        });

        // ب. رسم الأوسمة المصفاة
        const finalBadges = Object.values(bestBadges);

        if (finalBadges.length === 0) {
            badgesContainer.className = 'flex justify-center items-center bg-slate-900/50 p-4 rounded-xl border border-slate-800 min-h-[80px]';
            badgesContainer.innerHTML = '<span class="text-xs text-slate-500">لم تحصل على أوسمة خاصة بعد</span>';
        } else {
            finalBadges.forEach(item => {
                const bObj = badgesMap[item.baseId];
                if(bObj) {
                    // تحديد خصائص المستوى (اللون والاسم)
                    // نفترض المستويات: 1=برونزي, 2=فضي, 3=ذهبي, 4=ماسي, 5=أسطوري
                    // يمكنك تعديل الألوان والنصوص حسب نظامك في TIER_CONFIG
                    let tierColor = 'border-amber-700 shadow-amber-900/50'; // افتراضي (برونزي)
                    let tierName = 'برونزي';
                    let glowStyle = 'box-shadow: 0 0 10px rgba(180, 83, 9, 0.4); border-color: #b45309;'; // برونزي

                    if(item.level === 2) { 
                        tierName = 'فضي'; 
                        glowStyle = 'box-shadow: 0 0 12px rgba(203, 213, 225, 0.6); border-color: #cbd5e1;';
                    } else if(item.level === 3) { 
                        tierName = 'ذهبي'; 
                        glowStyle = 'box-shadow: 0 0 15px rgba(251, 191, 36, 0.8); border-color: #fbbf24;';
                    } else if(item.level === 4) { 
                        tierName = 'ماسي'; 
                        glowStyle = 'box-shadow: 0 0 15px rgba(34, 211, 238, 0.8); border-color: #22d3ee;';
                    } else if(item.level === 5) { 
                        tierName = 'أسطوري'; 
                        glowStyle = 'box-shadow: 0 0 20px rgba(239, 68, 68, 0.9); border-color: #ef4444; animation: pulse-slow 2s infinite;';
                    }

                    // عنصر الوسام
                    const badgeDiv = document.createElement('div');
                    badgeDiv.className = 'flex flex-col items-center gap-2 group cursor-pointer';
                    
                    badgeDiv.innerHTML = `
                        <div class="relative w-14 h-14 rounded-full border-2 bg-black transition transform group-hover:scale-110 duration-300" style="${glowStyle}">
                            <img src="${bObj.image}" class="w-full h-full object-cover rounded-full p-0.5">
                        </div>
                        <div class="text-center">
                            <span class="block text-[10px] text-white font-bold leading-tight">${bObj.name}</span>
                            <span class="block text-[9px] text-slate-400 font-mono mt-0.5" style="color: inherit; opacity: 0.8">(${tierName})</span>
                        </div>
                    `;
                    
                    // إضافة تلوين للنص حسب الرتبة
                    const textSpan = badgeDiv.querySelector('span:last-child');
                    if(item.level === 3) textSpan.style.color = '#fbbf24'; // ذهبي
                    if(item.level === 4) textSpan.style.color = '#22d3ee'; // سماوي
                    if(item.level === 5) textSpan.style.color = '#ef4444'; // أحمر

                    badgesContainer.appendChild(badgeDiv);
                }
            });
        }
    } else {
        badgesContainer.className = 'flex justify-center items-center bg-slate-900/50 p-4 rounded-xl border border-slate-800 min-h-[80px]';
        badgesContainer.innerHTML = '<span class="text-xs text-slate-500">لا توجد أوسمة</span>';
    }
});


bind('close-user-modal', 'click', () => { document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active')); });

bind('save-user-btn', 'click', async () => { 
    const n = getEl('edit-username').value.trim();
    
    const updates = {};
    let change = false;

    // 1. معالجة تغيير الاسم
    if(n && n !== userProfile.username) { 
        updates.username = n; 
        userProfile.username = n; 
        change = true; 
    }

    // 2. معالجة الصورة الرمزية
    if (userProfile.tempCustomAvatar) {
        updates.customAvatar = userProfile.tempCustomAvatar;
        userProfile.customAvatar = userProfile.tempCustomAvatar;
        change = true;
        userProfile.tempCustomAvatar = null; 
    } else if (userProfile.deleteCustom) {
        updates.customAvatar = null;
        userProfile.customAvatar = null;
        change = true;
        userProfile.deleteCustom = false;
    }

    // تنفيذ الحفظ
    if(change) {
        const btn = getEl('save-user-btn');
        btn.disabled = true;
        btn.textContent = "جاري الحفظ...";

        try {
            await updateDoc(doc(db,"users",effectiveUserId), updates);
            updateProfileUI(); 
            
            if (updates.customAvatar) addLocalNotification('تحديث الملف', 'تم تغيير الصورة الشخصية', 'account_circle');
            if (updates.username) addLocalNotification('تحديث الملف', `تم تغيير الاسم إلى ${updates.username}`, 'badge');

            toast("✅ تم حفظ التغييرات بنجاح");
        } catch(e) {
            console.error(e);
            toast("حدث خطأ أثناء الحفظ", "error");
        } finally {
            btn.disabled = false;
            btn.textContent = "حفظ التعديلات";
        }
    } else {
        toast("لم تقم بأي تغييرات");
    }
});


bind('avatar-upload', 'change', handleImageUpload);
bind('delete-custom-avatar', 'click', () => {
    userProfile.tempCustomAvatar = null;
    userProfile.deleteCustom = true;
    hide('profile-img-preview');
    show('profile-icon-preview');
    hide('delete-custom-avatar');
});

bind('restart-button', 'click', navToHome);
// --- دوال الحقيبة والمتجر ---

function openBag() {
    toggleMenu(false); 
    openModal('bag-modal');
    renderBag();
}

function getCurrentMonthKey() {
    const d = new Date();
    // التعديل: استخدام التاريخ المحلي أيضاً
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    
    return `${year}-${month}`;
}


function renderBag() {
    // تحديث الرصيد
    getEl('bag-user-score').textContent = formatNumberAr(userProfile.highScore);
    
    const inv = userProfile.inventory;
    getEl('inv-lives-count').textContent = formatNumberAr(inv.lives || 0);       
    getEl('inv-fifty-count').textContent = formatNumberAr(inv.helpers.fifty || 0); 
    getEl('inv-hint-count').textContent = formatNumberAr(inv.helpers.hint || 0);   
    getEl('inv-skip-count').textContent = formatNumberAr(inv.helpers.skip || 0);   

    // --- (1) مقتنياتي: عرض الإطارات كصور (Visual Grid) ---
    // هذا الجزء يحقق طلبك: عرض الصور في المقتنيات
    let framesSection = getEl('inv-frames-list');
    if(!framesSection) {
        // إذا لم يكن القسم موجوداً، نقوم بإنشائه في مكانه الصحيح
        const container = document.createElement('div');
        container.className = "mt-4 border-t border-slate-700 pt-4";
        container.innerHTML = `<h4 class="text-sm text-slate-400 mb-3 font-bold">إطاراتي (اضغط للتجهيز)</h4><div id="inv-frames-list" class="grid grid-cols-4 gap-3"></div>`;
        // نضيفه بعد قسم الثيمات المملوكة (أو بعد العدادات)
        getEl('inventory-view').appendChild(container); 
        framesSection = getEl('inv-frames-list');
    }
    
    framesSection.innerHTML = '';
    const ownedFrames = userProfile.inventory.frames || ['default'];
    
    // ترتيب الإطارات: المجهز أولاً، ثم الباقي
    const sortedOwned = [...ownedFrames].sort((a,b) => {
        if (a === userProfile.equippedFrame) return -1;
        if (b === userProfile.equippedFrame) return 1;
        return 0;
    });

    sortedOwned.forEach(fid => {
        const fData = framesData.find(f => f.id === fid);
        if(!fData) return;
        
        const isEquipped = userProfile.equippedFrame === fid;
        
        // زر الإطار في الحقيبة (شكل أيقونة)
        const btn = document.createElement('button');
        btn.className = `relative flex flex-col items-center gap-1 p-2 rounded-xl border transition ${isEquipped ? 'bg-amber-500/10 border-amber-400 scale-105' : 'bg-slate-800 border-slate-600 hover:border-slate-400'}`;
        
        // استخدام دالة الأفاتار لعرض الإطار مع الصورة الشخصية الحالية
        // نصغر الحجم ليتناسب مع الشبكة
        const previewHTML = getAvatarHTML(userProfile.customAvatar, fid, "w-10 h-10");
        
        btn.innerHTML = `
            ${previewHTML}
            <span class="text-[9px] font-bold truncate w-full text-center ${isEquipped ? 'text-amber-400' : 'text-slate-400'}">${fData.name}</span>
            ${isEquipped ? '<span class="absolute top-0 right-0 bg-amber-500 text-black rounded-full p-0.5 material-symbols-rounded text-[10px]">check</span>' : ''}
        `;
        
        // عند الضغط: يتم التجهيز فوراً
        btn.onclick = () => {
            if(!isEquipped) equipFrame(fid);
        };
        
        framesSection.appendChild(btn);
    });

    // --- (2) مقتنياتي: عرض الثيمات (كنص أو معاينة صغيرة) ---
    // سنبقيها نصاً لعدم ازدحام الحقيبة، أو يمكن تحويلها لصور لاحقاً
    const themesList = getEl('inv-themes-list');
    themesList.innerHTML = '';
    const themesNames = {
        default: 'الافتراضي', ruby: 'الياقوتي', midnight: 'الليلي',
        royal: 'الملكي', blackfrost: 'الأسود', persian: 'الفارسي', ashura: 'عاشوراء',
    };
    
    // عرض بسيط للثيمات المملوكة
    (inv.themes || ['default']).forEach(t => {
        const span = document.createElement('span');
        span.className = "text-[10px] bg-slate-700 px-2 py-1 rounded text-slate-300 border border-slate-600 cursor-default";
        span.textContent = themesNames[t] || t;
        themesList.appendChild(span);
    });


    // --- (3) المتجر: عرض الثيمات كصور/ألوان (Visual Preview) ---
    const shopList = getEl('shop-themes-list');
    shopList.innerHTML = '';
    
    // تعريف ألوان المعاينة لكل ثيم
    const themePreviews = {
        default: 'linear-gradient(to bottom, #1e293b, #020617)',
        ruby: 'linear-gradient(135deg, #2C0606, #100000)',
        midnight: 'linear-gradient(135deg, #1a1a2e, #0f3460)',
        royal: 'linear-gradient(to bottom, #1E3A24, #0a191e)',
        blackfrost: 'linear-gradient(135deg, #333, #000)',
        persian: 'linear-gradient(135deg, #006064, #082f49)',
        ashura: 'linear-gradient(to bottom, #1a0505, #000)'
    };

    Object.keys(themesNames).forEach(key => {
        if(key === 'default') return; 
        const isOwned = inv.themes.includes(key);
        
        const btn = document.createElement('button');
        // جعلنا الزر يبدو كبطاقة
        btn.className = `p-3 rounded-xl border border-slate-600 text-center relative transition hover:border-amber-400 flex flex-col items-center justify-between gap-2 h-full ${isOwned ? 'shop-item-owned' : ''}`;
        
        // صندوق المعاينة اللوني
        const previewStyle = themePreviews[key] || '#333';
        
        btn.innerHTML = `
            <div class="theme-preview-box" style="background: ${previewStyle};"></div>
            <p class="text-white text-xs font-bold">${themesNames[key]}</p>
            ${!isOwned ? `<span class="text-amber-400 text-xs bg-slate-900 px-2 py-1 rounded inline-block">500 نقطة</span>` : ''}
        `;
        
        if(!isOwned) btn.onclick = () => window.buyShopItem('theme', 500, key);
        shopList.appendChild(btn);
    });

    // --- (4) المتجر: عرض الإطارات (كما هي) ---
    const existingFramesHeader = document.getElementById('shop-frames-header');
    if(!existingFramesHeader) {
         const header = document.createElement('h4');
         header.id = 'shop-frames-header';
         header.className = "text-amber-400 text-sm font-bold mt-6 mb-3 flex items-center gap-1 col-span-2";
         header.innerHTML = `<span class="material-symbols-rounded">image</span> إطارات الأفاتار`;
         shopList.parentNode.appendChild(header);
         
         const grid = document.createElement('div');
         grid.id = 'shop-frames-grid';
         grid.className = "grid grid-cols-2 gap-3";
         shopList.parentNode.appendChild(grid);
    }
    
    const framesGrid = getEl('shop-frames-grid');
    framesGrid.innerHTML = '';

    // ترتيب المتجر: الأرخص للأغلى
    const sortedFrames = [...framesData].sort((a,b) => a.price - b.price);

    sortedFrames.forEach(f => {
        if(f.id === 'default') return;
        const isOwned = (userProfile.inventory.frames || []).includes(f.id);
        
        const btn = document.createElement('button');
        btn.className = `p-3 rounded-xl border border-slate-600 text-center relative transition hover:border-amber-400 flex flex-col items-center justify-center gap-2 ${isOwned ? 'shop-item-owned' : ''}`;
        
        btn.innerHTML = `
            <div class="relative w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">
                <span class="material-symbols-rounded text-slate-500">face</span>
                <div class="avatar-frame-overlay ${f.cssClass}"></div>
            </div>
            <p class="text-white text-xs font-bold">${f.name}</p>
            ${!isOwned ? `<span class="text-amber-400 text-xs bg-slate-900 px-2 py-1 rounded inline-block">${formatNumberAr(f.price)}</span>` : ''}
        `;
        
        if(!isOwned) {
            btn.onclick = () => window.buyShopItem('frame', f.price, f.id);
        }
        framesGrid.appendChild(btn);
    });
}

// دالة التبديل بين التبويبات
function switchBagTab(tab) {
    const tInv = getEl('tab-inventory');
    const tShop = getEl('tab-shop');
    const vInv = getEl('inventory-view');
    const vShop = getEl('shop-view');

    if(tab === 'inventory') {
        tInv.classList.add('bg-amber-500', 'text-black'); tInv.classList.remove('bg-slate-700', 'text-slate-300');
        tShop.classList.remove('bg-amber-500', 'text-black'); tShop.classList.add('bg-slate-700', 'text-slate-300');
        show('inventory-view'); hide('shop-view');
    } else {
        tShop.classList.add('bg-amber-500', 'text-black'); tShop.classList.remove('bg-slate-700', 'text-slate-300');
        tInv.classList.remove('bg-amber-500', 'text-black'); tInv.classList.add('bg-slate-700', 'text-slate-300');
        hide('inventory-view'); show('shop-view');
    }
}

// دالة تجهيز الإطار
async function equipFrame(frameId) {
    userProfile.equippedFrame = frameId;
    updateProfileUI();
    renderBag(); 
    
    try {
        await updateDoc(doc(db, "users", effectiveUserId), {
            equippedFrame: frameId
        });
        toast(`تم تجهيز: ${framesData.find(f=>f.id===frameId).name}`);
        playSound('click');
    } catch(e) {
        console.error(e);
        toast("فشل حفظ التغيير", "error");
    }
}

window.buyShopItem = async function(type, cost, id=null) {
    if(userProfile.highScore < cost) {
        toast("رصيدك غير كافٍ!", "error");
        playSound('lose');
        return;
    }

    window.showConfirm(
        "تأكيد الشراء", 
        `هل تريد دفع ${cost} نقطة؟`, 
        "shopping_cart", 
        async () => {
            userProfile.highScore -= cost;
            
            if(type === 'theme') {
                userProfile.inventory.themes.push(id);
                toast(`تم شراء ثيم: ${id}`);
            } else if (type === 'frame') { 
                if(!userProfile.inventory.frames) userProfile.inventory.frames = [];
                userProfile.inventory.frames.push(id);
                toast("تم شراء الإطار بنجاح! 🖼️");
            } else if(type === 'life') {
                userProfile.inventory.lives++;
                toast("تم شراء قلب إضافي ❤️");
            } else if(type === 'fifty') {
                userProfile.inventory.helpers.fifty++;
                toast("تم شراء مساعدة حذف اجابتين");
            } else if(type === 'hint') {
                userProfile.inventory.helpers.hint++;
                toast("تم شراء حذف اجابه");
            } else if(type === 'skip') {
                userProfile.inventory.helpers.skip++;
                toast("تم شراء تخطي");
            }

            if(!userProfile.stats) userProfile.stats = {};
            userProfile.stats.itemsBought = (userProfile.stats.itemsBought || 0) + 1;

            try {
                await updateDoc(doc(db, "users", effectiveUserId), {
                    highScore: userProfile.highScore,
                    inventory: userProfile.inventory,
                    "stats.itemsBought": userProfile.stats.itemsBought
                });
                playSound('win');
                renderBag(); 
                updateProfileUI(); 
                updateThemeSelector(); 
                
                let itemName = type === 'frame' ? 'إطار أفاتار' : (type === 'theme' ? 'ثيم' : 'عنصر');
                addLocalNotification('عملية شراء 🛒', `تم شراء ${itemName} مقابل ${cost} نقطة`, 'shopping_bag');

                setTimeout(async () => {
                    await checkAndUnlockBadges();
                }, 500);

            } catch(e) {
                console.error(e);
                toast("خطأ في الاتصال", "error");
            }
        }
    );
};


// ربط أزرار الحقيبة
bind('nav-bag', 'click', openBag);
bind('tab-inventory', 'click', () => switchBagTab('inventory'));
bind('tab-shop', 'click', () => switchBagTab('shop'));

// دالة التأكيد الموحدة
window.showConfirm = function(title, msg, icon, yesCallback) {
    const modal = document.getElementById('confirm-modal');
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-msg').textContent = msg;
    document.getElementById('confirm-icon').textContent = icon || 'help';

    // استنساخ الأزرار لإزالة الأحداث السابقة (لتجنب التكرار)
    const yesBtn = document.getElementById('btn-confirm-yes');
    const newYesBtn = yesBtn.cloneNode(true);
    yesBtn.parentNode.replaceChild(newYesBtn, yesBtn);

    const noBtn = document.getElementById('btn-confirm-no');
    const newNoBtn = noBtn.cloneNode(true);
    noBtn.parentNode.replaceChild(newNoBtn, noBtn);

    newYesBtn.onclick = () => {
        modal.classList.remove('active');
        if(yesCallback) yesCallback();
    };
    newNoBtn.onclick = () => {
        modal.classList.remove('active');
    };

    modal.classList.add('active');
};


function bind(id, ev, fn) { const el = getEl(id); if(el) el.addEventListener(ev, fn); }
function shuffleArray(array) { for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; } }



function launchConfetti() { const canvas = getEl('confetti-canvas'); const ctx = canvas.getContext('2d'); canvas.width = window.innerWidth; canvas.height = window.innerHeight; let particles = []; for(let i=0; i<100; i++) particles.push({x:Math.random()*canvas.width, y:Math.random()*canvas.height-canvas.height, c:['#fbbf24','#f59e0b','#ffffff'][Math.floor(Math.random()*3)], s:Math.random()*5+2, v:Math.random()*5+2}); function draw() { ctx.clearRect(0,0,canvas.width,canvas.height); particles.forEach(p => { ctx.fillStyle=p.c; ctx.beginPath(); ctx.arc(p.x,p.y,p.s,0,Math.PI*2); ctx.fill(); p.y+=p.v; if(p.y>canvas.height) p.y=-10; }); requestAnimationFrame(draw); } draw(); setTimeout(()=>canvas.width=0, 5000); }

bind('login-btn', 'click', handleLogin);
bind('register-btn', 'click', handleReg);
bind('show-register-btn', 'click', () => { hide('login-view'); show('register-view'); getEl('login-error-message').textContent=''; });
bind('show-login-btn', 'click', () => { hide('register-view'); show('login-view'); getEl('register-error-message').textContent=''; });

bind('btn-marathon-start', 'click', () => { 
    // --- بداية التعديل: التحقق من بنك الأخطاء ---
    if (userProfile.wrongQuestionsBank && userProfile.wrongQuestionsBank.length > 0) {
        openModal('force-review-modal');
        return; // إيقاف الدالة
    }

    document.getElementById('marathon-rules-modal').classList.add('active'); 
    getEl('ai-question-count').disabled = true;
    getEl('ai-generate-btn').disabled = true;
    getEl('btn-marathon-start').disabled = true;
});


bind('btn-marathon-confirm', 'click', startMarathon);

function showReviveModal() {
    let modal = document.getElementById('revive-modal');
    // إزالة النافذة القديمة لضمان تحديث النصوص
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'revive-modal';
    modal.className = 'modal-overlay';
    // لاحظ استخدام formatNumberAr لكل الأرقام في الأسعار والكميات
    modal.innerHTML = `
        <div class="modal-box border-2 border-red-500/50">
            <div class="text-center mb-6">
                <span class="material-symbols-rounded text-red-500 text-6xl animate-pulse">heart_broken</span>
                <h3 class="text-2xl font-bold text-white mt-2 font-heading">نفدت القلوب!</h3>
                <p class="text-slate-400 text-sm mt-2">لا تفقد تقدمك.. اشترِ قلوباً لإكمال هذه الجولة.</p>
            </div>
            <div class="bg-slate-800/50 p-3 rounded-xl mb-6 text-center border border-slate-700">
                <span class="text-xs text-slate-400 block">رصيدك الحالي</span>
                <span class="text-amber-400 font-bold text-xl font-heading flex justify-center items-center gap-1">
                    ${formatNumberAr(userProfile.highScore)} <span class="material-symbols-rounded text-sm">monetization_on</span>
                </span>
            </div>
            <div class="space-y-3">
                <button onclick="window.buyLives(1, 50)" class="w-full bg-slate-700 hover:bg-slate-600 border border-slate-600 p-3 rounded-xl flex justify-between items-center group transition">
                    <div class="flex items-center gap-2"><span class="material-symbols-rounded text-red-500">favorite</span><span class="text-white font-bold">${formatNumberAr(1)} قلب</span></div>
                    <span class="text-amber-400 font-bold text-sm bg-black/20 px-2 py-1 rounded">${formatNumberAr(50)} نقطة</span>
                </button>
                <button onclick="window.buyLives(2, 90)" class="w-full bg-slate-700 hover:bg-slate-600 border border-slate-600 p-3 rounded-xl flex justify-between items-center group transition">
                    <div class="flex items-center gap-2"><div class="flex"><span class="material-symbols-rounded text-red-500">favorite</span><span class="material-symbols-rounded text-red-500 -mr-2">favorite</span></div><span class="text-white font-bold">${formatNumberAr(2)} قلب</span></div>
                    <span class="text-amber-400 font-bold text-sm bg-black/20 px-2 py-1 rounded">${formatNumberAr(90)} نقطة <span class="text-[10px] text-green-400">(وفر ${formatNumberAr(10)})</span></span>
                </button>
                <button onclick="window.buyLives(3, 120)" class="w-full bg-slate-700 hover:bg-slate-600 border border-slate-600 p-3 rounded-xl flex justify-between items-center group transition">
                    <div class="flex items-center gap-2"><div class="flex"><span class="material-symbols-rounded text-red-500">favorite</span><span class="material-symbols-rounded text-red-500 -mr-2">favorite</span><span class="material-symbols-rounded text-red-500 -mr-2">favorite</span></div><span class="text-white font-bold">${formatNumberAr(3)} قلوب</span></div>
                    <span class="text-amber-400 font-bold text-sm bg-black/20 px-2 py-1 rounded">${formatNumberAr(120)} نقطة <span class="text-[10px] text-green-400">(وفر ${formatNumberAr(30)})</span></span>
                </button>
            </div>
            <div class="mt-6 border-t border-slate-700 pt-4">
                <button onclick="window.cancelRevive()" class="w-full text-slate-500 hover:text-red-400 text-sm transition">لا شكراً، إنهاء الجولة</button>
            </div>
        `;
    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('active'), 100);
}


window.buyLives = async function(amount, cost) {
    if (userProfile.highScore < cost) {
        toast("رصيدك غير كافٍ للشراء!", "error");
        playSound('lose');
        return;
    }
    
    try {
        userProfile.highScore -= cost;
        await updateDoc(doc(db, "users", effectiveUserId), { highScore: userProfile.highScore });
        updateProfileUI();
        quizState.lives = amount;
        renderLives();
        document.getElementById('revive-modal').classList.remove('active');
        toast(`تم شراء ${amount} قلب بنجاح!`, "success");
        playSound('win');
        nextQuestion();
    } catch (e) {
        console.error("Error buying lives:", e);
        toast("حدث خطأ أثناء الشراء، حاول مرة أخرى", "error");
    }
};

window.cancelRevive = function() {
    document.getElementById('revive-modal').classList.remove('active');
    endQuiz();
};


function checkMarathonStatus() {
    const btn = getEl('btn-marathon-start');
    if (marathonInterval) clearInterval(marathonInterval);

    if (!userProfile || !userProfile.lastMarathonDate) {
        btn.disabled = false;
        btn.classList.remove('opacity-50', 'cursor-not-allowed');
        btn.innerHTML = `<span class="text-lg">تحدي الماراثون</span> <span class="material-symbols-rounded">directions_run</span>`;
        return;
    }

    const lastPlayed = userProfile.lastMarathonDate.toMillis ? userProfile.lastMarathonDate.toMillis() : new Date(userProfile.lastMarathonDate).getTime();
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    const diff = now - lastPlayed;

    if (diff < twentyFourHours) {
        btn.disabled = true;
        btn.classList.add('cursor-not-allowed');
        
        const updateTimer = () => {
            const currentNow = Date.now();
            const timeLeft = twentyFourHours - (currentNow - lastPlayed);
            
            if (timeLeft <= 0) {
                clearInterval(marathonInterval);
                checkMarathonStatus();
                return;
            }

            const h = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const m = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
            const s = Math.floor((timeLeft % (1000 * 60)) / 1000);

            // تعريب الساعة
            const pad = (n) => n.toString().padStart(2, '0');
            const timeStr = `${pad(h)}:${pad(m)}:${pad(s)}`;
            const arTime = timeStr.replace(/\d/g, d => ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'][d]);

            btn.innerHTML = `
                <span class="text-lg font-mono font-bold text-black" dir="ltr">
                    ${arTime}
                </span> 
                <span class="material-symbols-rounded text-black">lock_clock</span>
            `;
        };

        updateTimer();
        marathonInterval = setInterval(updateTimer, 1000);
    } else {
        btn.disabled = false;
        btn.classList.remove('cursor-not-allowed');
        btn.innerHTML = `<span class="text-lg">تحدي الماراثون</span> <span class="material-symbols-rounded">directions_run</span>`;
    }
}


async function checkWhatsNew() {
    try {
        const docRef = doc(db, "system", "whats_new");
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();

            if (!data.isActive || !data.message) return;

            const serverTime = data.updatedAt ? data.updatedAt.toMillis() : 0;
            const localTime = parseInt(localStorage.getItem('last_seen_news_time') || '0');

            if (serverTime > localTime) {
                const contentEl = getEl('news-content');
                contentEl.innerHTML = data.message;
 
                
                const modal = getEl('news-modal');
                modal.classList.add('active');

                getEl('close-news-btn').onclick = () => {
                    localStorage.setItem('last_seen_news_time', serverTime);
                    modal.classList.remove('active');
                    playSound('win'); 
                };
            }
        }
      } catch (e) {
        console.error("News fetch error:", e);
    }
}

// --- CHEAT CODES & DEV TOOLS ---
// Inject improved CSS for Sauron Eye
const sauronStyle = document.createElement('style');
sauronStyle.innerHTML = `
/* ====== Animations ====== */
@keyframes sauronPulse {
  0%   { transform: scale(1); opacity: 0.9; box-shadow: 0 0 40px #ff3300; }
  50%  { transform: scale(1.08); opacity: 1; box-shadow: 0 0 120px #ff4500; }
  100% { transform: scale(1); opacity: 0.9; box-shadow: 0 0 40px #ff3300; }
}
@keyframes pupilMove {
  0%   { transform: scaleY(0.9) translateX(0); }
  25%  { transform: scaleY(1) translateX(6px); }
  50%  { transform: scaleY(1.1) translateX(-6px); }
  75%  { transform: scaleY(1) translateX(4px); }
  100% { transform: scaleY(0.9) translateX(0); }
}

/* ====== Overlay Container ====== */
.sauron-overlay {
  position: fixed;
  inset: 0;
  background: radial-gradient(circle at 50% 60%, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.98) 100%);
  z-index: 9999;
  display: flex;
  justify-content: center;
  align-items: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.8s ease-in-out;
}
.sauron-overlay.active {
  opacity: 1;
  pointer-events: auto;
}

/* ====== Eye Core ====== */
.eye-shape {
  position: relative;
  width: clamp(200px, 30vw, 320px);
  height: clamp(100px, 15vw, 180px);
  background: radial-gradient(circle at 50% 50%, #ffe066 0%, #ff8800 25%, #cc0000 65%, #220000 100%);
  border-radius: 60% / 100%;
  box-shadow: 0 0 80px #ff2200, inset 0 0 40px #000;
  animation: sauronPulse 4s infinite ease-in-out;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  border: 3px solid #660000;
  will-change: transform, opacity, box-shadow;
}

/* ====== Pupil ====== */
.eye-pupil {
  width: 18px;
  height: 65%;
  background: #000;
  border-radius: 50%;
  box-shadow: 0 0 20px #ff2200;
  animation: pupilMove 2s infinite ease-in-out;
  filter: blur(0.8px);
  will-change: transform;
}
`;
document.head.appendChild(sauronStyle);

/* ====== Example Usage ====== */
// Create the overlay and append it to the document
const sauronOverlay = document.createElement('div');
sauronOverlay.className = 'sauron-overlay';
sauronOverlay.innerHTML = `
  <div class="eye-shape">
    <div class="eye-pupil"></div>
  </div>
`;
document.body.appendChild(sauronOverlay);

// Toggle function (for demo)
window.toggleSauronEye = function () {
  sauronOverlay.classList.toggle('active');
};
const sauronDiv = document.createElement('div');
sauronDiv.id = 'sauron-modal';
sauronDiv.className = 'sauron-overlay';
sauronDiv.innerHTML = '<div class="eye-shape"><div class="eye-pupil"></div></div>';
document.body.appendChild(sauronDiv);

// 1. Marathon Cheat: Click 5 times on Header Score
let marathonCheatClicks = 0;
bind('header-score', 'click', async () => {
    marathonCheatClicks++;
    if(marathonCheatClicks === 5) {
        if(userProfile) {
            userProfile.lastMarathonDate = null;
            await updateDoc(doc(db, "users", effectiveUserId), { lastMarathonDate: null });
            checkMarathonStatus();
            toast("Sauron", "success");
            playSound('win');
        }
        marathonCheatClicks = 0;
    }
    setTimeout(() => marathonCheatClicks = 0, 1000);
});

// 2. Reveal Answer Cheat Sequence: 
// (Double Click "1/10") -> (Click "Lives") -> (Click "Round Score")
let cheatStep1 = false;
let cheatStep2 = false;

bind('question-counter-text', 'dblclick', () => {
    if(!quizState.active) return;
    cheatStep1 = true;
    // Reset if sequence not completed in 4 seconds
    setTimeout(() => { cheatStep1 = false; cheatStep2 = false; }, 4000);
});

bind('lives-display', 'click', () => {
    if(cheatStep1) cheatStep2 = true;
    else { cheatStep1 = false; cheatStep2 = false; }
});

bind('live-score-text', 'click', () => {
    if(cheatStep1 && cheatStep2) {
        triggerSauronEffect();
        cheatStep1 = false; 
        cheatStep2 = false;
    } else {
        cheatStep1 = false; 
        cheatStep2 = false;
    }
});

// ربط زر النافذة الجديدة بوظيفة المراجعة الموجودة مسبقاً
bind('btn-force-review-confirm', 'click', () => {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active')); // إغلاق النافذة
    getEl('review-mistakes-btn').click(); // محاكاة الضغط على زر المراجعة الأصلي
});

function triggerSauronEffect() {
    const modal = document.getElementById('sauron-modal');
    
    // Play scary low frequency sound
    if(!isMuted) {
        createOscillator(80, 'sawtooth', 2.0, 0.6);
        createOscillator(60, 'square', 2.0, 0.6);
    }

    modal.classList.add('active');
    
    setTimeout(() => {
        modal.classList.remove('active');
        const q = quizState.questions[quizState.idx];
        const btns = document.querySelectorAll('.option-btn');
        if(btns[q.correctAnswer]) {
            // Apply fiery style to correct answer
            const btn = btns[q.correctAnswer];
            btn.style.transition = "all 0.5s";
            btn.style.border = "2px solid #ef4444";
            btn.style.boxShadow = "0 0 25px rgba(220, 38, 38, 0.8), inset 0 0 10px rgba(220, 38, 38, 0.5)";
            btn.style.background = "linear-gradient(to right, #7f1d1d, #450a0a)";
            btn.classList.add('animate-pulse');
        }
    }, 2500);
}
// --- دالة تحويل الأرقام وتنسيقها ---
function formatNumberAr(num, compact = false) {
    if (num === null || num === undefined || isNaN(num)) return '٠';
    
    const map = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    const toAr = (n) => n.toString().replace(/\d/g, d => map[d]).replace(/,/g, '،'); // استبدال الأرقام والفواصل

    // 1. الوضع المختصر (للشريط العلوي والمتصدرين)
    if (compact) {
        if (num >= 1000000) {
            return toAr((num / 1000000).toFixed(1)) + " مليون";
        }
        if (num >= 1000) {
            // هنا نستخدم "ألف" بالهمزة كما طلبت للتمييز عن الرقم 1
            return toAr((num / 1000).toFixed(1)) + " ألف"; 
        }
    }
    
    // 2. الوضع العادي (للحقيبة والمتجر والنقاط الحية) - يضيف فواصل الآلاف
    return toAr(Number(num).toLocaleString('en-US'));
}

// دالة مساعدة لتنظيف البيانات وإصلاح التالف منها
function sanitizeUserData(data) {
    let wasFixed = false;
    
    // نسخة آمنة نبدأ بها
    const cleanData = { ...data };

    // 1. إصلاح النقاط (High Score)
    if (typeof cleanData.highScore !== 'number' || isNaN(cleanData.highScore)) {
        cleanData.highScore = 0;
        wasFixed = true;
    }

    // 2. إصلاح الإحصائيات (Stats)
    if (!cleanData.stats || typeof cleanData.stats !== 'object') {
        cleanData.stats = {};
        wasFixed = true;
    }

    const statFields = [
        'quizzesPlayed', 'totalCorrect', 'totalQuestions', 'bestRoundScore',
        'totalHardQuizzes', 'noHelperQuizzesCount', 'maxStreak', 'fastAnswerCount'
    ];

    statFields.forEach(field => {
        if (typeof cleanData.stats[field] !== 'number' || isNaN(cleanData.stats[field])) {
            cleanData.stats[field] = 0;
            wasFixed = true;
        }
    });

    if (!cleanData.stats.topicCorrect || typeof cleanData.stats.topicCorrect !== 'object') {
        cleanData.stats.topicCorrect = {};
        wasFixed = true;
    }
    
    if (!Array.isArray(cleanData.stats.lastPlayedDates)) {
        cleanData.stats.lastPlayedDates = [];
        wasFixed = true;
    }

    // 3. إصلاح الحقيبة (Inventory)
    if (!cleanData.inventory || typeof cleanData.inventory !== 'object') {
        cleanData.inventory = { lives: 0, helpers: { fifty: 0, hint: 0, skip: 0 }, themes: ['default'] };
        wasFixed = true;
    } else {
        if (typeof cleanData.inventory.lives !== 'number' || isNaN(cleanData.inventory.lives)) {
            cleanData.inventory.lives = 0;
            wasFixed = true;
        }
        if (!cleanData.inventory.helpers) cleanData.inventory.helpers = {};
        ['fifty', 'hint', 'skip'].forEach(h => {
            if (typeof cleanData.inventory.helpers[h] !== 'number' || isNaN(cleanData.inventory.helpers[h])) {
                cleanData.inventory.helpers[h] = 0;
                wasFixed = true;
            }
        });
        if (!Array.isArray(cleanData.inventory.themes)) {
                    cleanData.inventory.themes = ['default'];
            wasFixed = true;
        }
        // --- إضافة فحص الإطارات (جديد) ---
        if (!Array.isArray(cleanData.inventory.frames)) {
            cleanData.inventory.frames = ['default']; 
            wasFixed = true;
        }
    } 
    
    // فحص الإطار المجهز
    if (!cleanData.equippedFrame) {
        cleanData.equippedFrame = 'default';
        wasFixed = true;
    }

            

    // 4. إصلاح المصفوفات الأساسية
    if (!Array.isArray(cleanData.badges)) { cleanData.badges = ['beginner']; wasFixed = true; }
    if (!Array.isArray(cleanData.favorites)) { cleanData.favorites = []; wasFixed = true; }
    if (!Array.isArray(cleanData.seenQuestions)) { cleanData.seenQuestions = []; wasFixed = true; }
    if (!Array.isArray(cleanData.wrongQuestionsBank)) { cleanData.wrongQuestionsBank = []; wasFixed = true; }

    return { cleanData, wasFixed };
}

// --- نظام الإشعارات المحلي ---
const NOTIF_KEY = 'ahlulbayt_local_notifs_v1';

function addLocalNotification(title, body, icon='info') {
    // 1. جلب القائمة القديمة
    let list = JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]');
    
    // 2. إنشاء الإشعار الجديد
    const newNotif = {
        id: Date.now(),
        title: title,
        body: body,
        icon: icon,
        time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        date: new Date().toLocaleDateString('ar-EG'),
        read: false
    };
    
    // 3. الإضافة في البداية
    list.unshift(newNotif);
    
    // 4. الحفاظ على الحد الأقصى (30)
    if (list.length > 30) list = list.slice(0, 30);
    
    // 5. الحفظ
    localStorage.setItem(NOTIF_KEY, JSON.stringify(list));
    
    // 6. تحديث الواجهة
    updateNotifUI();
    playSound('click'); // صوت خفيف للتنبيه
}

function updateNotifUI() {
    const list = JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]');
    const badge = document.getElementById('notif-badge');
    const container = document.getElementById('notif-list');
    
    // 1. إدارة الوميض والشارة الحمراء
    const unreadCount = list.filter(n => !n.read).length;
    if (unreadCount > 0) {
        badge.classList.remove('hidden');
        badge.classList.add('pulse-red'); // تفعيل الوميض
    } else {
        badge.classList.add('hidden');
        badge.classList.remove('pulse-red');
    }

    // 2. رسم القائمة
    container.innerHTML = '';
    if (list.length === 0) {
        container.innerHTML = '<p class="text-center text-slate-500 text-xs py-6">لا توجد إشعارات</p>';
        return;
    }

    list.forEach(n => {
        const item = document.createElement('div');
        item.className = `notif-item p-3 flex gap-3 ${n.read ? 'opacity-70' : 'bg-slate-800/30 border-l-2 border-amber-500'}`;
        
        // تحديد لون الأيقونة حسب نوعها
        let iconColor = 'text-slate-400';
        if(n.icon === 'emoji_events') iconColor = 'text-amber-400'; // وسام
        if(n.icon === 'monetization_on') iconColor = 'text-green-400'; // نقاط/مكافأة
        if(n.icon === 'lock_reset') iconColor = 'text-red-400'; // كلمة سر
        
        item.innerHTML = `
            <div class="mt-1"><span class="material-symbols-rounded ${iconColor} text-lg">${n.icon}</span></div>
            <div class="flex-1">
                <p class="text-xs font-bold text-slate-200 mb-0.5">${n.title}</p>
                <p class="text-[10px] text-slate-400 leading-relaxed">${n.body}</p>
                <p class="text-[9px] text-slate-600 mt-1 text-left" dir="ltr">${n.date} - ${n.time}</p>
            </div>
        `;
        container.appendChild(item);
    });
}

// فتح/غلق القائمة
bind('notif-btn', 'click', (e) => {
    e.stopPropagation();
    const dropdown = document.getElementById('notif-dropdown');
    const isHidden = dropdown.classList.contains('hidden');
    
    // إغلاق أي نوافذ أخرى
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    
    if (isHidden) {
        dropdown.classList.remove('hidden');
        updateNotifUI(); // للتأكد من الرسم
        
        // تعليم الكل كمقروء بمجرد الفتح (لإيقاف الوميض)
        let list = JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]');
        if (list.some(n => !n.read)) {
            list.forEach(n => n.read = true);
            localStorage.setItem(NOTIF_KEY, JSON.stringify(list));
            // نحدث الواجهة فوراً لإزالة النقطة الحمراء
            document.getElementById('notif-badge').classList.add('hidden');
            document.getElementById('notif-badge').classList.remove('pulse-red');
        }
    } else {
        dropdown.classList.add('hidden');
    }
});

// إغلاق القائمة عند النقر خارجها
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('notif-dropdown');
    const btn = document.getElementById('notif-btn');
    if (!dropdown.classList.contains('hidden') && !dropdown.contains(e.target) && !btn.contains(e.target)) {
        dropdown.classList.add('hidden');
    }
});

bind('clear-notif-btn', 'click', (e) => {
    e.stopPropagation();
    localStorage.removeItem(NOTIF_KEY);
    updateNotifUI();
});

// استدعاء التحديث عند بدء التشغيل
document.addEventListener('DOMContentLoaded', () => {
    updateNotifUI();
});

// --- دالة حساب التقدم والمستوى (النسخة الشاملة لكل الأوسمة) ---
function getBadgeProgress(badge) {
    const stats = userProfile.stats || {};
    let currentScore = 0;

    // 1. حساب النقاط الحالية
    if (badge.type === 'topic') {
        if (stats.topicCorrect) {
            // جلب قائمة المواضيع الفرعية لهذا القسم (إن وجدت)
            // هذا السطر هو المسؤول عن جعل الوسام يشمل كل مواضيع القسم
            const categorySubTopics = topicsData[badge.topicKey] || [];

            Object.keys(stats.topicCorrect).forEach(playedTopic => {
                // تنظيف النصوص من المسافات لضمان التطابق
                const pTopic = playedTopic.trim();
                const bKey = badge.topicKey.trim();

                // الحالة 1: تطابق مباشر (لأوسمة المعصومين المحددة)
                // مثال: لعب "سيرة الإمام علي" والوسام هو "عاشق الإمام علي"
                const isDirectMatch = pTopic === bKey || pTopic.includes(bKey) || bKey.includes(pTopic);
                
                // الحالة 2: الموضوع الملعوب هو جزء من قائمة هذا التصنيف (لأوسمة التبحر العامة)
                // مثال: لعب "واقعة كربلاء" والوسام هو "التاريخ"
                const isSubTopicMatch = categorySubTopics.includes(pTopic);

                if (isDirectMatch || isSubTopicMatch) {
                    currentScore += stats.topicCorrect[playedTopic];
                }
            });
        }
    } else if (badge.type === 'score') {
        currentScore = userProfile.highScore || 0;
    } else if (badge.type === 'streak') {
        currentScore = stats.maxStreak || 0;
    } else if (badge.type === 'counter') {
        currentScore = stats[badge.statKey] || 0;
    }

    // 2. تحديد المستوى الحالي
    let activeLevel = badge.levels[0]; 
    let currentTierColor = 'locked';   
    let nextTierLabel = badge.levels[0].label;
    
    // معرفة أقصى مستوى تم الوصول إليه
    for (let i = 0; i < badge.levels.length; i++) {
        const level = badge.levels[i];
        
        if (currentScore >= level.target) {
            if (i === badge.levels.length - 1) {
                // الوصول للختم النهائي
                activeLevel = level;
                currentTierColor = level.color; // سيأخذ legendary أو diamond
                nextTierLabel = 'مكتمل';
            } else {
                // انتقل للمستوى التالي
                activeLevel = badge.levels[i + 1];
                currentTierColor = level.color; 
                nextTierLabel = badge.levels[i + 1].label;
            }
        } else {
            // هذا هو المستوى الحالي المستهدف
            activeLevel = level;
            if (i > 0) currentTierColor = badge.levels[i-1].color;
            nextTierLabel = level.label;
            break; 
        }
    }

    // 3. حساب النسبة المئوية
    let percent = 0;
    if (activeLevel.target > 0) {
        percent = Math.floor((currentScore / activeLevel.target) * 100);
    }
    if (percent > 100) percent = 100;

    return {
        current: currentScore,
        max: activeLevel.target,
        percent: percent,
        activeLevel: activeLevel,
        tier: currentTierColor, 
        isMaxed: currentScore >= badge.levels[badge.levels.length-1].target
    };
}

// 2. دالة الترتيب الذكي (Smart Sorting)
function sortBadgesSmartly() {
    return badgesData.sort((a, b) => {
        // فحص هل الوسام مختوم بالكامل (الذهبي)
        const progA = getBadgeProgress(a);
        const progB = getBadgeProgress(b);
        
        const finishedA = progA.isMaxed;
        const finishedB = progB.isMaxed;
        
        // القاعدة 1: غير المكتمل يظهر قبل المكتمل (المختوم)
        if (finishedA && !finishedB) return 1;
        if (!finishedA && finishedB) return -1;
        
        // القاعدة 2: الأقرب للاكتمال يظهر أولاً
        return progB.percent - progA.percent; 
    });
}

/* =========================================
   نظام طابور الجوائز الجديد (New Queue System)
   ========================================= */

// 1. دالة التحقق من الأوسمة (المعدلة)
async function checkAndUnlockBadges() {
    let newUnlocks = [];
    
    badgesData.forEach(badge => {
        const progressData = getBadgeProgress(badge);
        badge.levels.forEach(level => {
            const uniqueLevelId = `${badge.id}_lvl${level.id}`;
            if (progressData.current >= level.target && !userProfile.badges.includes(uniqueLevelId)) {
                newUnlocks.push({ badge: badge, level: level, uniqueId: uniqueLevelId });
            }
        });
    });

    if (newUnlocks.length > 0) {
        let totalScoreAdded = 0;
        
        newUnlocks.forEach(unlock => {
            const r = unlock.level.rewards;
            const bName = unlock.badge.name;
            const lName = unlock.level.label;

            userProfile.badges.push(unlock.uniqueId);
            
            if (r.score) { userProfile.highScore += r.score; totalScoreAdded += r.score; }
            if (r.lives) userProfile.inventory.lives = (userProfile.inventory.lives || 0) + r.lives;
            if (r.hint) userProfile.inventory.helpers.hint = (userProfile.inventory.helpers.hint || 0) + r.hint;
            if (r.fifty) userProfile.inventory.helpers.fifty = (userProfile.inventory.helpers.fifty || 0) + r.fifty;
            if (r.skip) userProfile.inventory.helpers.skip = (userProfile.inventory.helpers.skip || 0) + r.skip;

            // إشعار فوري لكل وسام
            addLocalNotification('إنجاز جديد 🏆', `مبروك! حصلت على وسام "${bName}" - ${lName}`, 'emoji_events');

            // إضافة للطابور
            window.rewardQueue.push(unlock);
        });

        await updateDoc(doc(db, "users", effectiveUserId), {
            badges: userProfile.badges,
            highScore: userProfile.highScore,
            inventory: userProfile.inventory
        });

        updateProfileUI();
        processRewardQueue(); // بدء العرض
        return true;
    }
    return false;
}

// 2. دالة معالجة الطابور (الجديدة)
function processRewardQueue() {
    if (window.rewardQueue.length === 0) return;
    const nextReward = window.rewardQueue.shift();
    showRewardModal(nextReward.badge, nextReward.level);
    playSound('applause');
    // إذا أضفنا دالة الاهتزاز لاحقاً ستعمل هنا
    if(window.triggerHaptic) window.triggerHaptic('success');
}
function showRewardModal(badge, level) {
    const modal = getEl('reward-modal');
    const box = getEl('reward-content-area');
    
    let rewardsHtml = '';
    if (level.rewards) {
        if (level.rewards.score) rewardsHtml += `<div class="reward-item-box"><span class="material-symbols-rounded text-amber-400 text-2xl block mb-1">monetization_on</span><span class="text-white text-xs font-bold">+${formatNumberAr(level.rewards.score)}</span></div>`;
        if (level.rewards.lives) rewardsHtml += `<div class="reward-item-box"><span class="material-symbols-rounded text-red-500 text-2xl block mb-1">favorite</span><span class="text-white text-xs font-bold">+${formatNumberAr(level.rewards.lives)}</span></div>`;
        if (level.rewards.hint) rewardsHtml += `<div class="reward-item-box"><span class="material-symbols-rounded text-yellow-400 text-2xl block mb-1">lightbulb</span><span class="text-white text-xs font-bold">+${formatNumberAr(level.rewards.hint)}</span></div>`;
        if (level.rewards.skip) rewardsHtml += `<div class="reward-item-box"><span class="material-symbols-rounded text-green-400 text-2xl block mb-1">skip_next</span><span class="text-white text-xs font-bold">+${formatNumberAr(level.rewards.skip)}</span></div>`;
        if (level.rewards.fifty) rewardsHtml += `<div class="reward-item-box"><span class="material-symbols-rounded text-blue-400 text-2xl block mb-1">percent</span><span class="text-white text-xs font-bold">+${formatNumberAr(level.rewards.fifty)}</span></div>`;
    }

    let titleColor = 'text-white';
    let borderColor = 'border-white'; 
    let levelName = level.label;

    if(level.color === 'bronze') { titleColor = 'text-red-500'; borderColor = 'border-red-500'; }
    else if(level.color === 'silver') { titleColor = 'text-slate-200'; borderColor = 'border-slate-300'; }
    else if(level.color === 'gold') { titleColor = 'text-amber-400'; borderColor = 'border-amber-400'; }
    else if(level.color === 'diamond') { titleColor = 'text-cyan-400'; borderColor = 'border-cyan-400'; }
    else if(level.color === 'legendary') { titleColor = 'text-red-600 animate-pulse'; borderColor = 'border-red-600'; }

    box.innerHTML = `
        <img src="${badge.image}" class="reward-icon-large ${borderColor}" style="border-width: 4px; border-style: solid;">
        <h3 class="text-xl font-bold text-white font-heading mb-1">إنجاز جديد!</h3>
        <p class="${titleColor} text-lg font-bold mb-2">${badge.name}</p>
        <span class="text-xs bg-slate-800 px-3 py-1 rounded-full border border-white/10 mb-4 inline-block">${levelName}</span>
        <p class="text-slate-400 text-sm mb-6 px-4">${badge.desc}</p>
        <div class="text-xs text-slate-500 mb-2">-- الجوائز --</div>
        <div class="reward-items-grid">${rewardsHtml}</div>
    `;
    
    const claimBtn = modal.querySelector('.btn-gold-action');
    const newBtn = claimBtn.cloneNode(true);
    claimBtn.parentNode.replaceChild(newBtn, claimBtn);
    
    newBtn.textContent = (window.rewardQueue.length > 0) ? "استلام والتالي >>" : "استلام الجوائز";
    
    newBtn.onclick = () => {
        modal.classList.remove('active');
        playSound('click');
        setTimeout(() => { processRewardQueue(); }, 300);
    };

    launchConfetti();
    modal.classList.add('active'); 
}

function showMotivator() {
    // البحث عن أوسمة لم تختم بعد
    const candidates = badgesData.filter(b => {
        const prog = getBadgeProgress(b);
        return !prog.isMaxed && b.type !== 'streak'; // نستثني الستريك لأنه يتصفر
    });
    
    let bestCandidate = null;
    let highestPercent = 0;

    candidates.forEach(b => {
        const prog = getBadgeProgress(b);
        if (prog.percent >= 60 && prog.percent < 100) { 
            if (prog.percent > highestPercent) {
                highestPercent = prog.percent;
                bestCandidate = b;
            }
        }
    });

    if (bestCandidate) {
        const prog = getBadgeProgress(bestCandidate);
        const remaining = prog.max - prog.current;
        const msg = `أنت قريب! بقي ${formatNumberAr(remaining)} للحصول على مستوى جديد في "${bestCandidate.name}"`;
        
        toast(`🚀 ${msg}`, 'success'); 
        playSound('hint');
    }
}


/* =========================================
   Global Navigation Handlers (Back Button & Click Outside)
   ========================================= */

// 1. معالجة زر الرجوع في الهاتف (نظام الاعتراض الذكي)
window.addEventListener('popstate', (event) => {
    // أولوية 1: إغلاق النوافذ المنبثقة والقوائم الجانبية أولاً
    const activeModal = document.querySelector('.modal-overlay.active');
    const sideMenu = getEl('side-menu');
    const notifDropdown = getEl('notif-dropdown');

    if (activeModal || (sideMenu && sideMenu.classList.contains('open')) || (notifDropdown && !notifDropdown.classList.contains('hidden'))) {
        // إذا كان هناك نافذة مفتوحة، نغلقها فقط ولا نفعل شيئاً آخر
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
        if(sideMenu) sideMenu.classList.remove('open');
        getEl('side-menu-overlay')?.classList.remove('open');
        if(notifDropdown) notifDropdown.classList.add('hidden');
        
        // إذا كنا داخل اللعبة، نعيد تثبيت الحالة لضمان عدم الخروج في الضغطة التالية
        if (quizState.active) {
            window.history.pushState({ view: 'playing' }, "", "");
        }
        return;
    }

    // أولوية 2: نحن داخل اللعبة ولا توجد نوافذ مفتوحة
    if (quizState.active) {
        // الخدعة: نعيد دفع الحالة فوراً لنبقي المستخدم في الصفحة (إلغاء مفعول الرجوع)
        window.history.pushState({ view: 'playing' }, "", "");

        // إظهار نافذة الانسحاب بدلاً من الخروج
        window.showConfirm(
            "مغادرة المسابقة",
            "هل تريد الانسحاب؟ سيتم احتساب النقاط الحالية فقط.",
            "logout", // أيقونة باب الخروج
            async () => {
                // إذا وافق المستخدم على الخروج:
                quizState.active = false; // نوقف اللعبة أولاً لمنع التكرار
                
                // حفظ النقاط الجزئية
                if (quizState.score > 0) {
                    try {
                        const userRef = doc(db, "users", effectiveUserId);
                        await updateDoc(userRef, {
                            highScore: increment(quizState.score),
                            "stats.quizzesPlayed": increment(1)
                        });
                        userProfile.highScore = (Number(userProfile.highScore) || 0) + quizState.score;
                        toast(`تم حفظ ${quizState.score} نقطة`, "success");
                    } catch (e) { console.error(e); }
                }
                
                // نعود للصفحة الرئيسية
                navToHome();
            }
        );
    }
});

// 2. معالجة النقر على الخلفية المعتمة لإغلاق النوافذ
document.addEventListener('click', (e) => {
    const isOverlay = e.target.classList.contains('modal-overlay');
    const isSideMenuOverlay = (e.target.id === 'side-menu-overlay');

    if (isOverlay || isSideMenuOverlay) {
        // منع إغلاق النوافذ الإجبارية بالنقر خارجها
        if (e.target.id === 'force-review-modal' || e.target.id === 'auth-loading' || e.target.id === 'revive-modal') {
            if(window.playSound) window.playSound('lose');
            const box = e.target.querySelector('.modal-box');
            if(box) { box.classList.add('shake'); setTimeout(()=>box.classList.remove('shake'), 500); }
            return;
        }

        // الإغلاق اليدوي
        if(isOverlay) e.target.classList.remove('active');
        if(isSideMenuOverlay) toggleMenu(false);
    }
});

/* =========================================
   Step 3: Haptics & Animations (Magic Touch)
   ========================================= */

window.triggerHaptic = function(type) {
    // التحقق من تفعيل الاهتزاز ودعم المتصفح
    if (!isVibration || !navigator.vibrate) return;
    
    switch(type) {
        // زدنا القوة من 10 إلى 40 (نقرة واضحة ومسموعة)
        case 'light': navigator.vibrate(40); break; 
        
        // التفاعل المتوسط (مثل فتح القوائم)
        case 'medium': navigator.vibrate(70); break; 
        
        // الخطأ (اهتزاز قوي ومزدوج: طررر-طررر)
        case 'heavy': navigator.vibrate([100, 50, 100]); break; 
        
        // النجاح/الوسام (نغمة اهتزازية: طر-طر-طر-طووووط)
        case 'success': navigator.vibrate([30, 40, 50, 60, 200]); break; 
    }
};


// 2. دالة تحريك الأرقام (العداد المتدحرج)
function animateValue(obj, start, end, duration) {
    if(!obj) return;
    if(start === end) { obj.textContent = formatNumberAr(end); return; }
    
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        
        // معادلة Ease-Out لجعل الحركة ناعمة في النهاية
        const easeOut = 1 - Math.pow(1 - progress, 3);
        
        const currentVal = Math.floor(progress * (end - start) + start);
        obj.textContent = formatNumberAr(currentVal); // استخدام دالة التعريب
        
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.textContent = formatNumberAr(end); // ضمان الرقم النهائي بدقة
        }
    };
    window.requestAnimationFrame(step);
}

// 3. مستمع عام للاهتزاز عند لمس أي زر (تجربة تفاعلية كاملة)
document.addEventListener('click', (e) => {
    // إذا ضغط المستخدم على زر أو رابط أو عنصر قائمة
    if(e.target.closest('button') || e.target.closest('.menu-item') || e.target.closest('.selection-item')) {
        window.triggerHaptic('light');
    }
});

// 4. تفعيل زر الإعدادات الجديد
const vibToggle = getEl('vibrate-toggle');
if(vibToggle) {
    vibToggle.checked = isVibration;
    vibToggle.onchange = () => {
        isVibration = vibToggle.checked;
        localStorage.setItem('vibration_enabled_v1', isVibration);
        if(isVibration) window.triggerHaptic('medium');
    };
}

/* =========================================
   Skeleton Loading Logic
   ========================================= */
function renderSkeleton(type, count=5) {
    let html = '';
    
    if (type === 'leaderboard') {
        const container = getEl('leaderboard-list');
        if(!container) return;
        
        container.innerHTML = '';
        container.classList.remove('hidden'); // إظهار الحاوية
        
        for(let i=0; i<count; i++) {
            html += `
            <div class="sk-row skeleton-box">
                <div class="skeleton sk-circle shrink-0"></div>
                <div class="flex-1 space-y-2">
                    <div class="skeleton sk-line long"></div>
                    <div class="skeleton sk-line short"></div>
                </div>
                <div class="skeleton sk-line short" style="width: 40px;"></div>
            </div>`;
        }
        container.innerHTML = html;
        
    } else if (type === 'quiz') {
        // تنظيف الواجهة القديمة
        getEl('question-text').innerHTML = '<div class="skeleton sk-line long mx-auto mb-2"></div><div class="skeleton sk-line short mx-auto"></div>';
        const box = getEl('options-container');
        box.innerHTML = '';
        
        for(let i=0; i<4; i++) {
            box.innerHTML += `<div class="skeleton sk-btn"></div>`;
        }
    }
}

/* =========================================
   Step 5: Advanced Audio System (Intro & Quiz)
   ========================================= */

// متغير لتتبع هل تم تشغيل المقدمة أم لا
let introPlayed = false;

// 1. دالة تشغيل الموسيقى حسب الحالة
function manageAudioSystem(action) {
    if (isMuted) return; // إذا كان الصوت مكتوماً لا تفعل شيئاً

    const intro = document.getElementById('audio-intro');
    const quizAudio = document.getElementById('audio-quiz');

    if (action === 'start_intro') {
        // تشغيل المقدمة فقط إذا لم تعمل من قبل
        if (!introPlayed && intro) {
            intro.play().catch(e => console.log("Waiting for interaction"));
            introPlayed = true; // نحدد أنها عملت ولن تتكرر
        }
    } 
    else if (action === 'start_quiz') {
        // عند بدء المسابقة: نوقف المقدمة (إن كانت تعمل) ونشغل حماس المسابقة
        if (intro) { intro.pause(); intro.currentTime = 0; }
        if (quizAudio) quizAudio.play().catch(console.error);
    } 
    else if (action === 'stop_quiz') {
        // عند الخروج من المسابقة: نوقف صوت المسابقة
        if (quizAudio) { quizAudio.pause(); quizAudio.currentTime = 0; }
    }
}

// 2. مستمع النقرة الأولى (لتشغيل المقدمة)
document.addEventListener('click', function firstClickHandler() {
    // نشغل المقدمة عند أول لمسة في أي مكان
    manageAudioSystem('start_intro');
    
    // نحذف هذا المستمع فوراً لكي لا يحاول التشغيل مرة أخرى
    document.removeEventListener('click', firstClickHandler);
});


// 3. تحديث زر كتم الصوت ليتعامل مع الصوتين
const muteToggleBtn = document.getElementById('mute-toggle');
if(muteToggleBtn) {
    muteToggleBtn.onchange = () => { 
        isMuted = !muteToggleBtn.checked; 
        
        const intro = document.getElementById('audio-intro');
        const quizAudio = document.getElementById('audio-quiz');

        if(isMuted) {
            // كتم فوري للجميع
            if(intro) intro.pause();
            if(quizAudio) quizAudio.pause();
        } else {
            // عند إعادة الصوت:
            // إذا كنا داخل اللعبة، نشغل صوت المسابقة
            if (quizState.active) {
                if(quizAudio) quizAudio.play();
            } 
            // ملاحظة: لا نعيد تشغيل المقدمة إذا تم كتمها ثم إلغاء الكتم، لأنها "مرة واحدة"
        }
    };
}

// --- التحكم بمستوى الصوت (للمقدمة والمسابقة معاً) ---
document.addEventListener('DOMContentLoaded', () => {
    const volSlider = document.getElementById('bg-music-volume');
    const intro = document.getElementById('audio-intro');
    const quizAudio = document.getElementById('audio-quiz');

    if(volSlider) {
        // دالة مساعدة لتطبيق الصوت على الملفين
        const setVolume = (val) => {
            const decimalVol = val / 100; // تحويل 20 إلى 0.2
            if(intro) intro.volume = decimalVol;
            if(quizAudio) quizAudio.volume = decimalVol;
        };

        // 1. تطبيق القيمة الافتراضية فوراً عند التشغيل
        // (يأخذ القيمة المكتوبة في index.html وهي value="20")
        setVolume(volSlider.value);

        // 2. تحديث الصوت عند تحريك الشريط
        volSlider.oninput = (e) => {
            setVolume(e.target.value);
        };
    }
});

/* =========================================
   Visual Magic: Golden Ripple Effect (إعادة تفعيل)
   ========================================= */

document.addEventListener('click', (e) => {
    // إنشاء عنصر النبضة
    const ripple = document.createElement('div');
    ripple.className = 'touch-ripple';
    
    // تحديد الموقع بدقة مكان الإصبع
    ripple.style.left = `${e.pageX}px`;
    ripple.style.top = `${e.pageY}px`;
    
    document.body.appendChild(ripple);
    
    // تنظيف العنصر من الذاكرة بعد انتهاء الحركة (0.6 ثانية)
    setTimeout(() => {
        ripple.remove();
    }, 600);
});

function typeWriter(elementId, text, speed = 25) {
    const element = getEl(elementId);
    if (!element) return;

    if (quizState.typeWriterInterval) clearInterval(quizState.typeWriterInterval);

    element.textContent = ''; 
    let i = 0;

    quizState.typeWriterInterval = setInterval(() => {
        if (i < text.length) {
            element.textContent += text.charAt(i);
            i++;
        } else {
            clearInterval(quizState.typeWriterInterval);
            quizState.typeWriterInterval = null;
        }
    }, speed);
}

function showFloatingFeedback(element, text, colorClass) {
    if (!element) return;
    
    // 1. تحديد مكان الزر بدقة
    const rect = element.getBoundingClientRect();
    
    // 2. إنشاء العنصر
    const el = document.createElement('div');
    el.className = `float-feedback ${colorClass}`;
    
    // 3. تحويل الأرقام إلى عربية (٠-٩)
    // نستخدم replace لاستبدال الأرقام الإنجليزية بالعربية
    el.textContent = text.replace(/\d/g, d => ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'][d]);
    
    // 4. ضبط الموقع (منتصف الزر)
    // نخصم نصف عرض تقريبي للنص ليكون في المنتصف تماماً
    el.style.left = `${rect.left + rect.width / 2 - 20}px`; 
    el.style.top = `${rect.top}px`;

    document.body.appendChild(el);
    
    // 5. الحذف بعد انتهاء الحركة
    setTimeout(() => el.remove(), 1200);
}

// ==========================================
// 🕵️‍♂️ أدوات المشرف المخفية (Admin Secret Tools)
// ==========================================

/**
 * دالة تحديث عداد الأسئلة في قاعدة البيانات
 * تقوم بمسح كامل للأسئلة وحفظ الإحصائيات في ملف system/counts
 */
window.generateCounts = async function() {
    // منع التكرار إذا كانت العملية جارية
    if(document.getElementById('admin-loading-badge')) return;

    // 1. إنشاء مؤشر تحميل بصري صغير في أعلى الشاشة
    const badge = document.createElement('div');
    badge.id = 'admin-loading-badge';
    badge.innerHTML = '⚙️ جاري تحديث العدادات...';
    badge.style.cssText = "position:fixed; top:20px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.9); color:#fbbf24; padding:8px 15px; z-index:9999; border-radius:20px; border:1px solid #fbbf24; font-size:12px; font-weight:bold; box-shadow: 0 4px 15px rgba(0,0,0,0.5);";
    document.body.appendChild(badge);

    console.log("🚀 بدأ تحديث العدادات...");
    
    try {
        const counts = {};
        // جلب جميع الأسئلة من قاعدة البيانات
        const q = query(collection(db, "questions"));
        const snap = await getDocs(q);
        
        // حساب عدد الأسئلة لكل موضوع
        snap.forEach(doc => {
            const d = doc.data();
            if (d.topic) {
                const cleanTopic = d.topic.trim();
                counts[cleanTopic] = (counts[cleanTopic] || 0) + 1;
            }
        });
        
        // حفظ النتائج في ملف النظام
        await setDoc(doc(db, "system", "counts"), counts);
        
        // تحديث حالة النجاح
        badge.innerHTML = '✅ تم التحديث بنجاح!';
        badge.style.borderColor = '#4ade80';
        badge.style.color = '#4ade80';
        
        // تشغيل صوت نجاح وتحديث المتغير المحلي فوراً
        if(typeof playSound === 'function') playSound('applause');
        dbTopicCounts = counts; 
        
        // إخفاء المؤشر بعد 3 ثواني
        setTimeout(() => badge.remove(), 3000);
        
    } catch (e) {
        console.error("Admin Update Error:", e);
        badge.innerHTML = '❌ فشل التحديث';
        badge.style.color = '#ef4444';
        badge.style.borderColor = '#ef4444';
        setTimeout(() => badge.remove(), 3000);
    }
};

/**
 * مراقب الحركة السرية
 * يتطلب الضغط 7 مرات متتالية بسرعة على العنوان الرئيسي
 */
let adminSecretClicks = 0;
let adminClickResetTimer = null;

document.addEventListener('click', (e) => {
    // استهداف العنوان الرئيسي في الشاشة الترحيبية
    const titleEl = e.target.closest('#welcome-area h1');
    
    if (titleEl) {
        adminSecretClicks++;
        
        // إعادة تصفير العداد إذا توقف الضغط لمدة ثانية
        clearTimeout(adminClickResetTimer);
        adminClickResetTimer = setTimeout(() => { adminSecretClicks = 0; }, 1000);

        // عند الوصول لـ 7 نقرات
        if (adminSecretClicks === 7) {
            // اهتزاز للتنبيه ببدء العملية
            if(window.triggerHaptic) window.triggerHaptic('success');
            
            // استدعاء دالة التحديث
            window.generateCounts();
            
            // تصفير العداد
            adminSecretClicks = 0;
        }
    }
});
// ==========================================
// 🎁 نظام المكافأة اليومية
// ==========================================

window.checkAndShowDailyReward = function() {
    if (!userProfile) return;

    // 1. الحصول على تاريخ اليوم كنص (YYYY-MM-DD)
    const today = new Date().toLocaleDateString('en-CA'); // en-CA يعطي تنسيق YYYY-MM-DD دائماً
    
    // 2. التحقق من آخر تاريخ استلام
    const lastClaimDate = userProfile.lastDailyRewardDate || "";

    // 3. المقارنة: إذا لم يستلم اليوم
    if (lastClaimDate !== today) {
        // تأخير بسيط لتظهر بعد تحميل الواجهة
        setTimeout(() => {
            const modal = document.getElementById('daily-reward-modal');
            if(modal) {
                modal.classList.add('active');
                playSound('streak'); // صوت لطيف عند الظهور
            }
        }, 1500);
    }
};

window.claimDailyReward = async function() {
    const today = new Date().toLocaleDateString('en-CA');
    const modal = document.getElementById('daily-reward-modal');
    const btn = modal.querySelector('button');

    // منع النقر المتكرر
    btn.disabled = true;
    btn.textContent = "جاري الاستلام...";

    try {
        // 1. تحديث القيم محلياً
        userProfile.highScore += 200; // الجائزة: 200 نقطة
        userProfile.inventory.lives = (userProfile.inventory.lives || 0) + 1; // الجائزة: قلب واحد
        userProfile.lastDailyRewardDate = today;

        // 2. الحفظ في السيرفر
        await updateDoc(doc(db, "users", effectiveUserId), {
            highScore: userProfile.highScore,
            "inventory.lives": userProfile.inventory.lives,
            lastDailyRewardDate: today
        });

        // 3. تحديث الواجهة والمؤثرات
        updateProfileUI();
        playSound('applause'); // صوت تصفيق
        launchConfetti(); // قصاصات ورقية
        
        // إشعار
        toast("تم استلام 200 نقطة وقلب إضافي! 🎁");
        addLocalNotification('مكافأة يومية', 'تم استلام الجائزة اليومية', 'card_giftcard');

        // إغلاق النافذة
        modal.classList.remove('active');

    } catch (e) {
        console.error("Error claiming reward:", e);
        toast("حدث خطأ في الاتصال", "error");
    } finally {
        btn.disabled = false;
        btn.textContent = "استلام المكافأة";
    }
};

bind('btn-update-password', 'click', async () => {
    const newPassInput = getEl('settings-new-password');
    const newPass = newPassInput.value.trim();
    const btn = getEl('btn-update-password');

    if (!newPass) {
        toast("الرجاء كتابة كلمة مرور جديدة", "error");
        return;
    }
    if (newPass.length < 4) {
        toast("كلمة المرور قصيرة جداً (4 أحرف على الأقل)", "error");
        return;
    }

    btn.disabled = true;
    btn.textContent = "...";

    try {
        await updateDoc(doc(db, "users", effectiveUserId), { password: newPass });
        addLocalNotification('أمان الحساب 🔐', 'تم تغيير كلمة المرور بنجاح من الإعدادات', 'lock_reset');
        toast("✅ تم تحديث كلمة المرور بنجاح");
        newPassInput.value = ''; // تفريغ الحقل
    } catch(e) {
        console.error(e);
        toast("فشل التحديث", "error");
    } finally {
        btn.disabled = false;
        btn.textContent = "تحديث";
    }
});

// ==========================================
// 📩 نظام التواصل مع المطور (بصيغة بلاغ)
// ==========================================

// 1. فتح النافذة وتجهيز البيانات
bind('nav-contact', 'click', () => {
    toggleMenu(false); // إغلاق القائمة الجانبية
    openModal('contact-modal');
    
    // تعبئة اسم المستخدم تلقائياً
    if(userProfile) {
        getEl('contact-username').value = userProfile.username;
    }
    
    // تفريغ الحقول القديمة
    getEl('contact-msg-body').value = '';
    getEl('contact-title').value = '';
    getEl('contact-note').value = '';
    getEl('contact-feedback').textContent = '';
});

// 2. كود الإرسال (حيلة البلاغ)
bind('btn-send-contact', 'click', async () => {
    const msgBody = getEl('contact-msg-body').value.trim();
    const title = getEl('contact-title').value.trim();
    const note = getEl('contact-note').value.trim();
    const feedback = getEl('contact-feedback');
    const btn = getEl('btn-send-contact');

    // تحقق بسيط
    if (!msgBody || !title) {
        feedback.textContent = "يرجى كتابة نص الرسالة والعنوان";
        feedback.className = "text-center text-xs mt-3 h-4 text-red-400 font-bold";
        return;
    }

    // تعطيل الزر لمنع التكرار
    btn.disabled = true;
    const oldBtnContent = btn.innerHTML;
    btn.innerHTML = '<span class="material-symbols-rounded animate-spin">autorenew</span> جاري الإرسال...';

    // تجهيز البيانات لتشبه "البلاغ" تماماً
    // هذا ما سيظهر في تطبيق المطور الخاص بك:
    const fakeReportData = {
        questionId: "CONTACT_MSG",          // لتميزها أنها ليست سؤالاً
        topic: `📩 رسالة: ${title}`,        // سيظهر في خانة "القسم"
        questionText: `${msgBody}\n\n📝 ملاحظة إضافية:\n${note || 'لا يوجد'}`, // سيظهر في خانة "نص السؤال"
        reportedByUserId: effectiveUserId,
        reportedByUsername: userProfile.username,
        timestamp: serverTimestamp()
    };

    try {
        // الإرسال إلى مجموعة البلاغات (reports)
        await setDoc(doc(collection(db, "reports")), fakeReportData);
        
        // نجاح
        toast("✅ تم إرسال رسالتك للمطور بنجاح!");
        playSound('win');
        
        // إغلاق النافذة
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));

    } catch (e) {
        console.error("Error sending contact msg:", e);
        feedback.textContent = "فشل الإرسال، تأكد من الاتصال بالإنترنت";
        feedback.className = "text-center text-xs mt-3 h-4 text-red-400 font-bold";
    } finally {
        // إعادة الزر لوضعه الطبيعي
        btn.disabled = false;
        btn.innerHTML = oldBtnContent;
    }
});

// ==========================================
// 🧠 نظام الشرح الذكي (محدث)
// ==========================================

// 1. تفعيل الميزة على الأحداث
document.addEventListener('DOMContentLoaded', () => {
    // استعادة الإعدادات
    const savedKey = localStorage.getItem('ai_api_key');
    if(savedKey) {
        const input = document.getElementById('ai-api-key');
        if(input) input.value = savedKey;
    }
});

// حفظ الإعدادات
const btnSaveAi = document.getElementById('btn-save-ai');
if(btnSaveAi) {
    btnSaveAi.addEventListener('click', () => {
        const key = document.getElementById('ai-api-key').value.trim();
        const model = document.getElementById('ai-model-select').value.trim();
        if(!key) return toast("أدخل المفتاح أولاً", "error");
        
        localStorage.setItem('ai_api_key', key);
        localStorage.setItem('ai_model', model || 'gemini-2.5-flash');
        toast("✅ تم الحفظ");
    });
}

// 2. مستمع النقر المزدوج (للحاسوب وبعض الهواتف)
document.addEventListener('dblclick', (e) => {
    // التأكد أن النقر تم داخل المناطق المسموح بها
    if (e.target.closest('#question-text') || e.target.closest('#enrichment-content')) {
        handleAiTrigger();
    }
});

// 3. مستمع القائمة المختصرة (للضغط المطول في الهاتف)
document.addEventListener('contextmenu', (e) => {
    if (e.target.closest('#question-text') || e.target.closest('#enrichment-content')) {
        const selection = window.getSelection();
        // إذا كان هناك نص محدد، نلغي القائمة ونشغل الذكاء
        if (selection.toString().trim().length > 0) {
            e.preventDefault();
            handleAiTrigger();
        }
    }
});

// 4. الدالة الرئيسية (مع إصلاح العلامات الزرقاء وزر النسخ)
async function handleAiTrigger() {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    if (!selectedText) return;

    // 1. التقاط السياق
    let fullContext = "";
    if (selection.anchorNode && selection.anchorNode.parentElement) {
        fullContext = selection.anchorNode.parentElement.textContent;
    }

    // 2. التحقق من المفتاح
    const apiKey = localStorage.getItem('ai_api_key');
    if (!apiKey) {
        if (selection.removeAllRanges) selection.removeAllRanges();
        toast("⚠️ أدخل مفتاح AI في الإعدادات", "error");
        const settingsModal = document.getElementById('settings-modal');
        if(settingsModal) settingsModal.classList.add('active');
        return;
    }

    // ============================================================
    // 🛠️ الحل الجذري للمقابض الزرقاء
    // ============================================================
    // إلغاء التحديد فوراً
    if (selection.removeAllRanges) selection.removeAllRanges();
    else if (selection.empty) selection.empty();
    
    // تفعيل وضع "عدم التحديد" لمدة نصف ثانية لإجبار المتصفح على إخفاء العلامات
    document.body.classList.add('force-deselect');
    setTimeout(() => {
        document.body.classList.remove('force-deselect');
    }, 500); // زيادة الوقت لضمان الاختفاء
    // ============================================================

    // 3. تجهيز النافذة
    const modal = document.getElementById('ai-explanation-modal');
    const title = document.getElementById('ai-word-target');
    const content = document.getElementById('ai-result-content');
    
    title.textContent = `"${selectedText}"`;
    
    // وضع التحميل
    content.style.display = 'flex'; 
    content.style.alignItems = 'center';
    content.style.justifyContent = 'center';
    content.innerHTML = '<div class="flex flex-col items-center gap-2"><span class="material-symbols-rounded animate-spin text-cyan-400 text-2xl">autorenew</span><span>اللّهم صَلِّ على محمد وآل محمد</span></div>';
    
    modal.classList.add('active');

    const model = localStorage.getItem('ai_model') || 'gemini-2.5-flash';
    const promptText = `اشرح باختصار (حوالي 40 كلمة) معنى "${selectedText}" في سياق: "${fullContext}". قم بتمييز الكلمات المفتاحية الأهم بوضعها بين نجمتين **كلمة**.`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        
        let explanation = data.candidates[0].content.parts[0].text;
        explanation = explanation.replace(/\*\*(.*?)\*\*/g, '<span class="ai-highlight">$1</span>');

        // --- بناء المحتوى (زر النسخ + النص) بشكل برمجي آمن ---
        content.style.display = 'block'; 
        content.innerHTML = ''; // تفريغ

        // إنشاء زر النسخ
        const copyBtn = document.createElement('button');
        copyBtn.className = "float-left ml-2 mb-2 flex items-center gap-1 bg-slate-800 border border-slate-600 text-slate-300 text-[10px] px-2 py-1 rounded hover:bg-slate-700 transition cursor-pointer";
        copyBtn.innerHTML = '<span class="material-symbols-rounded text-sm">content_copy</span> نسخ';
        
        // إنشاء حاوية النص
        const textDiv = document.createElement('div');
        textDiv.className = "leading-loose text-justify";
        textDiv.innerHTML = explanation;

        // برمجة زر النسخ
        copyBtn.onclick = () => {
            // نأخذ النص الخام (بدون HTML) للنسخ
            const rawText = textDiv.innerText;
            navigator.clipboard.writeText(rawText).then(() => {
                copyBtn.innerHTML = '<span class="material-symbols-rounded text-sm text-green-400">check</span> تم!';
                copyBtn.classList.add('border-green-500', 'text-green-400');
                if(window.triggerHaptic) window.triggerHaptic('light');
                setTimeout(() => {
                    copyBtn.innerHTML = '<span class="material-symbols-rounded text-sm">content_copy</span> نسخ';
                    copyBtn.classList.remove('border-green-500', 'text-green-400');
                }, 2000);
            }).catch(err => toast("فشل النسخ", "error"));
        };

        // إضافة العناصر للنافذة
        content.appendChild(copyBtn);
        content.appendChild(textDiv);

    } catch (e) {
        content.style.display = 'block';
        content.innerHTML = `<span class="text-red-400 text-sm">فشل: ${e.message}</span>`;
    }
}
