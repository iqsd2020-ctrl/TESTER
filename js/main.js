import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, query, where, getDocs, serverTimestamp, orderBy, limit, arrayUnion } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { topicsData, staticWisdoms, infallibles, badgesData, badgesMap } from './data.js';

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

let currentUser = null;
let effectiveUserId = null;
let userProfile = null;
const initialTimerState = localStorage.getItem('timerEnabled') === 'false' ? false : true;

let quizState = { 
    questions: [], idx: 0, score: 0, correctCount: 0, active: false, 
    lives: 3,
    mode: 'standard',
    history: [], streak: 0, usedHelpers: false, fastAnswers: 0, enrichmentEnabled: true,
    startTime: 0, difficulty: 'موحد', contextTopic: ''
};
let helpers = { fifty: false, hint: false, skip: false };
const ENRICHMENT_FREQUENCY = 0;
let transitionDelay = 2000;
let isMuted = false;
let timerInterval = null;
let audioContext = null; 
let wisdomInterval = null;
let marathonInterval = null;
let currentSelectionMode = null; 

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

function initTheme() {
    const savedTheme = localStorage.getItem('app_theme_v2') || 'default';
    applyTheme(savedTheme);
    const select = document.getElementById('theme-selector');
    if(select) {
        select.value = savedTheme;
        select.onchange = (e) => {
            const newTheme = e.target.value;
            applyTheme(newTheme);
            localStorage.setItem('app_theme_v2', newTheme);
            toast(`تم تغيير الثيم إلى: ${themes[newTheme]}`);
        };
    }
}

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
const toast = (msg, type='success') => { const t=getEl('toast-notification'); t.textContent=msg; t.className = type==='error'?'bg-red-900 border-red-500':'bg-green-900 border-green-500'; t.classList.add('show'); t.classList.remove('hidden'); setTimeout(()=>{t.classList.remove('show');t.classList.add('hidden')},3000); };

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

const muteToggle = getEl('mute-toggle');
if(muteToggle) muteToggle.onchange = () => { isMuted = !muteToggle.checked; };

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        const storedId = localStorage.getItem('ahlulbaytQuiz_UserId_v2.7');
        if (storedId) {
            effectiveUserId = storedId;
            await loadProfile(storedId);
            navToHome();
        } else {
            hide('auth-loading');
            show('login-area'); 
            hide('top-header');
        }
    } else {
        show('auth-loading');
        hide('top-header');
        signInAnonymously(auth).catch(e => console.error(e));
    }
});

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

async function loadProfile(uid) {
    try {
        const snap = await getDoc(doc(db, "users", uid));
        if(snap.exists()) {
            userProfile = snap.data();
            // تهيئة القيم الافتراضية للبيانات القديمة
            if(!userProfile.badges) userProfile.badges = ['beginner'];
            if(!userProfile.favorites) userProfile.favorites = [];
            if(!userProfile.stats) userProfile.stats = {};
            userProfile.stats.topicCorrect = userProfile.stats.topicCorrect || {};
            userProfile.stats.lastPlayedDates = userProfile.stats.lastPlayedDates || [];
            if(!userProfile.wrongQuestionsBank) userProfile.wrongQuestionsBank = [];
            if(userProfile.customAvatar === undefined) userProfile.customAvatar = null;
            if(!userProfile.seenQuestions) userProfile.seenQuestions = [];
            
            // --- تهيئة الحقيبة (Inventory) ---
            if(!userProfile.inventory) {
                userProfile.inventory = {
                    lives: 0,
                    helpers: { fifty: 0, hint: 0, skip: 0 },
                    themes: ['default']
                };
            }
            if(!userProfile.inventory.themes) userProfile.inventory.themes = ['default'];
            // -------------------------------

        } else {
            userProfile = { 
                username: "ضيف", highScore: 0, badges: ['beginner'], favorites: [], wrongQuestionsBank: [], customAvatar: null,
                seenQuestions: [], stats: { topicCorrect: {}, lastPlayedDates: [], totalHardQuizzes: 0, noHelperQuizzesCount: 0, maxStreak: 0, fastAnswerCount: 0 },
                inventory: { lives: 0, helpers: { fifty: 0, hint: 0, skip: 0 }, themes: ['default'] }
            };
        }
        updateProfileUI();
    } catch(e) { console.error(e); }
}

function updateProfileUI() {
    getEl('username-display').textContent = userProfile.username;
    const imgEl = getEl('user-avatar-img');
    const iconEl = getEl('user-avatar-icon');
    if (userProfile.customAvatar) {
        imgEl.src = userProfile.customAvatar;
        show('user-avatar-img');
        hide('user-avatar-icon');
    } else {
        iconEl.textContent = 'account_circle';
        hide('user-avatar-img');
        show('user-avatar-icon');
    }
    getEl('header-score').textContent = userProfile.highScore || 0;
    if(userProfile.wrongQuestionsBank && userProfile.wrongQuestionsBank.length > 0) {
        show('review-mistakes-btn');
        getEl('review-mistakes-text').textContent = `مراجعة أخطائي (${userProfile.wrongQuestionsBank.length})`;
    } else {
        hide('review-mistakes-btn');
    }
}

function navToHome() {
    stopTimer(); 
    show('top-header');
    if(wisdomInterval) clearInterval(wisdomInterval);
    loadAIWisdom();
    wisdomInterval = setInterval(loadAIWisdom, 7000);
    quizState.active = false;
    
    // إخفاء الشاشات الأخرى
    hide('login-area'); hide('auth-loading'); hide('quiz-proper'); hide('results-area');
    show('welcome-area'); show('user-profile-container');
    
    initDropdowns();
    
    // إعدادات المؤقت
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

    // تحديث قائمة الثيمات في الإعدادات بناءً على ما يملكه المستخدم
    updateThemeSelector();
}

// دالة مساعدة لتحديث قائمة الثيمات
function updateThemeSelector() {
    const select = getEl('theme-selector');
    if(!select) return;
    select.innerHTML = ''; // مسح القائمة الحالية
    
    const allThemes = {
        default: 'الافتراضي',
        ruby: 'الياقوتي',
        midnight: 'الزجاجي الليلي',
        royal: 'ملكي',
        blackfrost: 'الزجاج الأسود',
        persian: 'المنمنمات',
        ashura: 'العاشورائي',
    };

    // إضافة الثيمات المملوكة فقط
    const owned = userProfile.inventory.themes || ['default'];
    Object.keys(allThemes).forEach(key => {
        if(owned.includes(key)) {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = allThemes[key];
            select.appendChild(opt);
        }
    });
    
    // تحديد الثيم الحالي
    const current = localStorage.getItem('app_theme_v2') || 'default';
    if(owned.includes(current)) select.value = current;
    else select.value = 'default';
}

// --- أضف هذا الكود لإصلاح القوائم المنسدلة ---

function openSelectionModal(mode) {
    currentSelectionMode = mode;
    const modal = document.getElementById('selection-modal');
    const container = document.getElementById('selection-list-container');
    const title = document.getElementById('selection-title');
    
    // تنظيف القائمة القديمة
    container.innerHTML = '';
    
    // فتح النافذة
    modal.classList.add('active');

    if (mode === 'category') {
        title.textContent = 'اختر القسم الرئيسي';
        // إضافة خيار العشوائي
        renderSelectionItem(' عشوائي شامل', 'random', container);
        // إضافة الأقسام من ملف data.js
        Object.keys(topicsData).forEach(key => {
            renderSelectionItem(key, key, container);
        });

    } else if (mode === 'topic') {
        title.textContent = 'اختر الموضوع الفرعي';
        const selectedCat = document.getElementById('category-select').value;
        
        if (!selectedCat || selectedCat === 'random') {
            container.innerHTML = '<p class="text-center text-slate-400 p-4">لا توجد مواضيع فرعية لهذا الاختيار.</p>';
        } else {
            const subs = topicsData[selectedCat];
            if (subs) {
                subs.forEach(sub => {
                    renderSelectionItem(sub, sub, container);
                });
            }
        }

    } else if (mode === 'count') {
        title.textContent = 'عدد الأسئلة';
        const counts = [5, 10, 15, 20,];
        counts.forEach(c => {
            renderSelectionItem(`${c} أسئلة`, c, container);
        });
    }
}


function initDropdowns() {
    const btnCat = document.getElementById('btn-category-trigger');
    const btnTop = document.getElementById('btn-topic-trigger');
    const btnCount = document.getElementById('btn-count-trigger');
    
    if(btnCat) btnCat.onclick = () => openSelectionModal('category');
    if(btnTop) btnTop.onclick = () => {
        if (!btnTop.disabled) openSelectionModal('topic');
        else toast("يرجى اختيار القسم الرئيسي أولاً", "error");
    };
    if(btnCount) btnCount.onclick = () => openSelectionModal('count');
}


function renderSelectionItem(text, value, container) {
    const div = document.createElement('div');
    div.className = 'selection-item';
    div.innerHTML = `<span>${text}</span><span class="material-symbols-rounded text-slate-500 text-sm">chevron_left</span>`;
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
    }
    modal.classList.remove('active');
}

function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast("الصورة كبيرة جداً، اختر صورة أصغر", "error"); return; }
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const maxSize = 150;
            let width = img.width;
            let height = img.height;
            if (width > height) {
                if (width > maxSize) { height *= maxSize / width; width = maxSize; }
            } else {
                if (height > maxSize) { width *= maxSize / height; height = maxSize; }
            }
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.4);
            getEl('profile-img-preview').src = dataUrl;
            show('profile-img-preview');
            hide('profile-icon-preview');
            show('delete-custom-avatar');
            userProfile.tempCustomAvatar = dataUrl; 
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

bind('ai-generate-btn', 'click', async () => {
    const cat = getEl('category-select').value;
    const count = parseInt(getEl('ai-question-count').value);
    quizState.difficulty = 'موحد';
    quizState.mode = 'standard';
    const topicValue = getEl('topic-select').value;
    let topic = cat === 'random' || !cat ? "عام" : (topicValue || cat); 
    quizState.contextTopic = topic;
    const btn = getEl('ai-generate-btn');
    btn.disabled = true; btn.innerHTML = `<span class="material-symbols-rounded animate-spin">autorenew</span> جاري جلب الأسئلة...`;
    let qs = [];
    if(userProfile.wrongQuestionsBank.length > 0) {
        shuffleArray(userProfile.wrongQuestionsBank);
        qs = userProfile.wrongQuestionsBank.slice(0, Math.floor(count * 0.3));
    }
    try {
        let firebaseQs = [];
        let qQuery;
        if(cat === 'random' || !cat) {
            qQuery = query(collection(db, "questions"), where("isReviewed", "==", true), limit(500)); 
        } else {
            qQuery = query(collection(db, "questions"), where("topic", "==", topic), where("isReviewed", "==", true));
        }
        const snap = await getDocs(qQuery);
        if (cat !== 'random' && cat !== '' && snap.empty) {
            toast("عذراً، لا توجد أسئلة متاحة لهذا الموضوع حالياً.", "error");
            btn.disabled = false; 
            btn.innerHTML = `<span class="text-lg">ابدأ التحدي</span> <span class="material-symbols-rounded">play_circle</span>`;
            return;
        }
        snap.forEach(d => firebaseQs.push({ id: d.id, ...d.data() }));
        let allAvailableQuestions = firebaseQs;
        const seenIds = userProfile.seenQuestions || [];
        let freshQuestions = allAvailableQuestions.filter(q => !seenIds.includes(q.id));
        let seenQuestionsPool = allAvailableQuestions.filter(q => seenIds.includes(q.id));
        shuffleArray(freshQuestions);
        shuffleArray(seenQuestionsPool);
        const needed = count - qs.length; 
        let selectedFromFirebase = [];
        if (freshQuestions.length >= needed) {
            selectedFromFirebase = freshQuestions.slice(0, needed);
        } else {
            selectedFromFirebase = [...freshQuestions]; 
            const remaining = needed - freshQuestions.length;
            selectedFromFirebase = [...selectedFromFirebase, ...seenQuestionsPool.slice(0, remaining)];
        }
        const uniqueMap = new Map();
        qs.forEach(item => { if (item && item.question) uniqueMap.set(item.question.trim(), item); });
        selectedFromFirebase.forEach(item => { if (item && item.question && !uniqueMap.has(item.question.trim())) uniqueMap.set(item.question.trim(), item); });
        let allUniqueQs = Array.from(uniqueMap.values());
        quizState.questions = allUniqueQs.slice(0, count);
        if(quizState.questions.length === 0) { toast("لا توجد أسئلة كافية لبدء الجولة.", "error"); throw new Error("No questions"); }
        shuffleArray(quizState.questions); 
        startQuiz();
    } catch(e) {
        console.error(e);
        if (e.message !== "No questions") toast("حدث خطأ في تحميل الأسئلة", "error");
    }
    btn.disabled = false; btn.innerHTML = `<span class="text-lg">ابدأ التحدي</span> <span class="material-symbols-rounded">play_circle</span>`;
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
        "هل تريد الانسحاب؟ سيتم احتساب النقاط الحالية فقط ولن يتم حفظ التقدم في هذه الجولة.",
        "exit_to_app",
        () => {
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
    el.innerHTML = `
        <div class="flex items-center gap-1 transition-all duration-300">
            <span class="material-symbols-rounded text-red-500 text-2xl drop-shadow-sm ${quizState.lives <= 1 ? 'animate-pulse' : ''}">favorite</span>
            <span class="text-red-400 font-bold text-xl font-heading pt-1" dir="ltr">x${quizState.lives}</span>
        </div>
    `;
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
    if(wisdomInterval) { clearInterval(wisdomInterval); wisdomInterval = null; }
    hide('top-header');
    
    quizState.idx = 0; quizState.score = 0; quizState.correctCount = 0; quizState.active = true; 
    quizState.history = []; quizState.streak = 0; 
    
    // --- منطق دمج القلوب ---
    // القلوب = 3 (الأساسية) + المخزون
    const extraLives = (userProfile.inventory && userProfile.inventory.lives) ? userProfile.inventory.lives : 0;
    quizState.lives = 3 + extraLives;
    // ----------------------

    helpers = { fifty: false, hint: false, skip: false };
    quizState.usedHelpers = false; 
    quizState.fastAnswers = 0; 
    quizState.enrichmentEnabled = true;

    // تصفير عداد الماراثون للثيمات
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
    quizState.active = true; 
    const q = quizState.questions[quizState.idx];
    getEl('question-text').textContent = q.question;
    
    if (quizState.mode === 'marathon') {
        getEl('question-counter-text').textContent = `${quizState.idx+1}`;
        const dots = getEl('progress-dots'); 
        dots.innerHTML = '<span class="text-xs text-slate-500 font-mono tracking-widest">🪙 وضع الماراثون</span>';
    } else {
        getEl('question-counter-text').textContent = `${quizState.idx+1}/${quizState.questions.length}`;
        const dots = getEl('progress-dots'); dots.innerHTML = '';
        for(let i=0; i<quizState.questions.length; i++) {
            let cls = "w-2 h-2 rounded-full bg-slate-700";
            if(i < quizState.idx) cls = "w-2 h-2 rounded-full bg-amber-500";
            else if(i === quizState.idx) cls = "w-2 h-2 rounded-full bg-white scale-125";
            dots.innerHTML += `<div class="${cls}"></div>`;
        }
    }

    getEl('live-score-text').textContent = quizState.score;
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
    const s = quizState.streak;
    const icon = getEl('streak-icon');
    const txt = getEl('streak-count');
    txt.textContent = 'x' + s;
    icon.classList.remove('text-orange-500', 'text-yellow-400', 'text-red-500', 'text-purple-500', 'animate-pulse');
    txt.classList.remove('text-orange-400', 'text-yellow-300', 'text-red-400', 'text-purple-400');
    if(s > 1) {
        icon.classList.add('active');
        txt.classList.remove('opacity-0');
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
    getEl('enrichment-content').textContent = text;
    const modal = getEl('enrichment-modal');
    modal.classList.add('active');
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
        if(btn) { btn.classList.remove('opacity-60'); btn.classList.add('btn-correct'); }
        quizState.streak++;
        
        if(quizState.mode === 'marathon') {
            quizState.marathonCorrectStreak = (quizState.marathonCorrectStreak || 0) + 1;
            if(quizState.marathonCorrectStreak === 15) {
                unlockRandomThemeReward();
                quizState.marathonCorrectStreak = 0; 
            }
        }

        if(quizState.streak > userProfile.stats.maxStreak) { userProfile.stats.maxStreak = quizState.streak; } 
                const basePoints = 1; 
        let multiplier = 1;
        let multiplierText = "";

        if (quizState.streak >= 15) { multiplier = 12; multiplierText = "x12 🔥"; }
        else if (quizState.streak >= 12) { multiplier = 10; multiplierText = "x10 🪙"; }
        else if (quizState.streak >= 9) { multiplier = 9; multiplierText = "x9 🔥"; }
        else if (quizState.streak >= 6) { multiplier = 6; multiplierText = "x6 🪙"; }
        else if (quizState.streak >= 3) { multiplier = 2; multiplierText = "x2"; }

        let pointsAdded = Math.floor(basePoints * multiplier);
        quizState.score += pointsAdded; 
        quizState.correctCount++;
        const scoreEl = getEl('live-score-text');
        scoreEl.textContent = quizState.score;
        scoreEl.classList.remove('score-pop'); void scoreEl.offsetWidth; scoreEl.classList.add('score-pop');
        if(quizState.streak >= 5) playSound('streak'); else playSound('win');
        if(qBankIdx > -1) userProfile.wrongQuestionsBank.splice(qBankIdx, 1);
        const currentTopic = q.topic || quizState.contextTopic;
        if (currentTopic && currentTopic !== 'عام' && currentTopic !== 'مراجعة الأخطاء') {
            userProfile.stats.topicCorrect[currentTopic] = (userProfile.stats.topicCorrect[currentTopic] || 0) + 1;
        }
        getEl('feedback-text').innerHTML = `<span class="text-green-400">إجابة صحيحة! (+${pointsAdded})</span> <span class="text-amber-400 text-xs bg-slate-800 px-2 py-1 rounded-full border border-amber-500/30">${multiplierText}</span>`;
        getEl('feedback-text').className = "text-center mt-2 font-bold h-6 flex justify-center items-center gap-2";
        
        if(q.explanation && quizState.enrichmentEnabled) {
            setTimeout(() => showEnrichment(q.explanation), transitionDelay);
            return; 
        }
        setTimeout(nextQuestion, transitionDelay);
    } else {
        quizState.marathonCorrectStreak = 0; 
        quizState.fastAnswers = 0; 
        if(btn) { btn.classList.remove('opacity-60'); btn.classList.add('btn-incorrect'); }
        if(q.correctAnswer >= 0 && q.correctAnswer < btns.length) {
            btns[q.correctAnswer].classList.remove('opacity-60'); 
            btns[q.correctAnswer].classList.add('btn-correct');
        } 
        if (quizState.streak >= 10) { quizState.streak = 5; toast("تم تفعيل حماية الستريك! انخفض إلى 5 بدلاً من 0", "info"); } 
        else if (quizState.streak >= 5) { quizState.streak = 2; } 
        else { quizState.streak = 0; }
        
        if(quizState.lives > 3) {
            userProfile.inventory.lives = Math.max(0, userProfile.inventory.lives - 1);
            updateDoc(doc(db, "users", effectiveUserId), { "inventory.lives": userProfile.inventory.lives });
        }
        quizState.lives--;

        // --- منطق الخصم الجديد: من الجولة أولاً ثم من الرصيد العام ---
        const deductionTarget = 2;
        let deductedFromRound = 0;
        let deductedFromBalance = 0;

        // 1. محاولة الخصم من نقاط الجولة الحالية
        if (quizState.score >= deductionTarget) {
            quizState.score -= deductionTarget;
            deductedFromRound = deductionTarget;
        } else {
            // خصم كل ما في الجولة
            deductedFromRound = quizState.score;
            quizState.score = 0;
            
            // حساب المتبقي للخصم من الرصيد العام
            const remainingToDeduct = deductionTarget - deductedFromRound;

            // 2. الخصم من الرصيد العام (highScore)
            if (userProfile.highScore >= remainingToDeduct) {
                userProfile.highScore -= remainingToDeduct;
                deductedFromBalance = remainingToDeduct;
            } else {
                // إذا لم يكفِ الرصيد العام، نخصم ما تبقى فيه فقط
                deductedFromBalance = userProfile.highScore;
                userProfile.highScore = 0;
            }

            // تحديث الرصيد العام في قاعدة البيانات والواجهة فوراً
            if (deductedFromBalance > 0) {
                updateDoc(doc(db, "users", effectiveUserId), { highScore: userProfile.highScore });
                updateProfileUI(); // تحديث الهيدر
            }
        }
        
        getEl('live-score-text').textContent = quizState.score;
        // -----------------------------------------------------------

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
        const deductionText = totalDeducted > 0 ? `(-${totalDeducted})` : `(+0)`;
        
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
    const score = quizState.score;
    const correct = quizState.correctCount;
    const total = quizState.questions.length;
    const accuracy = Math.round((correct / total) * 100);
    const message = `🕌 من وحي أهل البيت (ع) 🌟\n` + `لقد حصلت على ${score} نقطة في: ${quizState.contextTopic}!\n` + `✅ الإجابات الصحيحة: ${correct}/${total} (${accuracy}%)\n` + `هل يمكنك تحدي رقمي؟\n` + `#مسابقة_أهل_البيت #ثقافة_شيعية`;
    if (navigator.share) {
        navigator.share({ title: 'تحدي المعرفة - من وحي أهل البيت (ع)', text: message }).then(() => toast('تمت مشاركة النتيجة بنجاح!'));
    } else {
        navigator.clipboard.writeText(message).then(() => { toast('تم نسخ النتيجة إلى الحافظة! شاركها مع أصدقائك.'); });
    }
});

async function endQuiz() {
    hide('quiz-proper'); show('results-area');
    getEl('card-score').textContent = quizState.score;
    getEl('card-username').textContent = userProfile.username;
    getEl('card-difficulty').textContent = quizState.difficulty;
    const accuracy = (quizState.correctCount / quizState.questions.length) * 100;
    const today = new Date().toISOString().slice(0, 10);
    getEl('card-correct-count').innerHTML = `<span class="material-symbols-rounded text-green-400 text-sm align-middle">check_circle</span> ${quizState.correctCount}`;
    getEl('card-wrong-count').innerHTML = `<span class="material-symbols-rounded text-red-400 text-sm align-middle">cancel</span> ${quizState.questions.length - quizState.correctCount}`;
    
    let msg = "حاول مرة أخرى";
    if(accuracy === 100) { 
        msg = "أداء أسطوري! درجة كاملة"; 
        playSound('applause'); 
        launchConfetti(); 
        
        // --- مكافأة الجولة الكاملة ---
        // منح جائزة عشوائية (قلب أو مساعدة)
        const rewards = ['life', 'fifty', 'hint', 'skip'];
        const rewardType = rewards[Math.floor(Math.random() * rewards.length)];
        let rewardMsg = "";
        
        if(rewardType === 'life') {
            userProfile.inventory.lives++;
            rewardMsg = "قلب إضافي ❤️";
        } else {
            userProfile.inventory.helpers[rewardType]++;
            rewardMsg = "وسيلة مساعدة ✨";
        }
        
        toast(`🎁 هدية الأداء الكامل: حصلت على ${rewardMsg}`, "success");
        // سيتم حفظ المخزون مع التحديث النهائي في الأسفل
        // -------------------------
    }
    else if(accuracy >= 80) msg = "أداء ممتاز!";
    else if(accuracy >= 50) msg = "جيد جداً";
    getEl('final-message').textContent = msg;

    const newHigh = (userProfile.highScore || 0) + quizState.score;
    const stats = userProfile.stats || {};
    if (quizState.fastAnswers >= 10) { stats.fastAnswerCount++; }
    if (!quizState.usedHelpers) { stats.noHelperQuizzesCount++; }
    let lastPlayedDates = stats.lastPlayedDates.filter(d => d !== today).slice(-6); 
    lastPlayedDates.push(today);
    stats.lastPlayedDates = lastPlayedDates;
    const newStats = {
        quizzesPlayed: (stats.quizzesPlayed || 0) + 1,
        totalCorrect: (stats.totalCorrect || 0) + quizState.correctCount,
        totalQuestions: (stats.totalQuestions || 0) + quizState.questions.length,
        bestRoundScore: Math.max((stats.bestRoundScore || 0), quizState.score),
        topicCorrect: userProfile.stats.topicCorrect,
        lastPlayedDates: stats.lastPlayedDates,
        totalHardQuizzes: stats.totalHardQuizzes,
        noHelperQuizzesCount: stats.noHelperQuizzesCount,
        maxStreak: stats.maxStreak,
        fastAnswerCount: stats.fastAnswerCount
    };
    let newBadges = [];
    let loverBadgesEarned = 0;
    const requiredCorrectLover = 200;
    infallibles.forEach(person => {
        const badgeId = `lover_${person.id}`;
        const currentCorrect = userProfile.stats.topicCorrect[person.topic] || 0;
        if (currentCorrect >= requiredCorrectLover && !userProfile.badges.includes(badgeId)) {
            newBadges.push(badgeId);
            loverBadgesEarned++;
        } else if (userProfile.badges.includes(badgeId)) { loverBadgesEarned++; }
    });
    if (loverBadgesEarned === infallibles.length && !userProfile.badges.includes('lover_infallibility')) {
        newBadges.push('lover_infallibility');
    }
    if(newStats.quizzesPlayed >= 10 && !userProfile.badges.includes('scholar')) newBadges.push('scholar');
    if(newStats.quizzesPlayed >= 50 && !userProfile.badges.includes('master')) newBadges.push('master');
    if(newStats.quizzesPlayed >= 100 && !userProfile.badges.includes('grand_master')) newBadges.push('grand_master');
    if(newStats.quizzesPlayed >= 200 && !userProfile.badges.includes('historian_master')) newBadges.push('historian_master');
    if(newStats.quizzesPlayed >= 500 && !userProfile.badges.includes('insightful')) newBadges.push('insightful');
    if(newHigh >= 500 && !userProfile.badges.includes('veteran')) newBadges.push('veteran');
    if(newHigh >= 1000 && !userProfile.badges.includes('servant')) newBadges.push('servant');
    if(newHigh >= 5000 && !userProfile.badges.includes('supporter')) newBadges.push('supporter');
    if(newHigh >= 10000 && !userProfile.badges.includes('treasurer')) newBadges.push('treasurer');
    if(newStats.totalCorrect >= 100 && !userProfile.badges.includes('narrator')) newBadges.push('narrator');
    if(newStats.totalCorrect >= 500 && !userProfile.badges.includes('ally')) newBadges.push('ally');
    if(newStats.bestRoundScore >= 50 && !userProfile.badges.includes('high_score_v1')) newBadges.push('high_score_v1');
    if(newStats.bestRoundScore >= 100 && !userProfile.badges.includes('high_score_v2')) newBadges.push('high_score_v2');
    if(newStats.lastPlayedDates.length >= 7 && !userProfile.badges.includes('consistent')) newBadges.push('consistent');
    if(accuracy === 100 && quizState.questions.length >= 5 && !userProfile.badges.includes('sharpshooter')) newBadges.push('sharpshooter');
    if(newStats.maxStreak >= 5 && !userProfile.badges.includes('onfire')) newBadges.push('onfire'); 
    if(newStats.maxStreak >= 10 && !userProfile.badges.includes('masterpiece')) newBadges.push('masterpiece');
    if(quizState.questions.length >= 15 && accuracy >= 80 && !userProfile.badges.includes('patient')) newBadges.push('patient');
    if(newStats.quizzesPlayed >= 5 && accuracy >= 80 && !userProfile.badges.includes('challenger')) newBadges.push('challenger');
    if(newStats.noHelperQuizzesCount >= 10 && !userProfile.badges.includes('self_reliant')) newBadges.push('self_reliant');
    if(newStats.totalQuestions > 0 && (newStats.totalCorrect / newStats.totalQuestions) >= 0.9 && !userProfile.badges.includes('precise')) newBadges.push('precise');
    if(newStats.fastAnswerCount >= 10 && !userProfile.badges.includes('fast_learner')) newBadges.push('fast_learner');
    if(quizState.contextTopic === "عام" && newStats.topicCorrect["عام"] >= 50 && !userProfile.badges.includes('general_expert')) newBadges.push('general_expert');
    const specialistBadges = [
        { key: "تاريخ ومعارك", id: 'master_history' }, { key: "عقائد وفقه", id: 'master_theology' },
        { key: "الأنبياء والرسل", id: 'master_prophets' }, { key: "شخصيات (أصحاب وعلماء)", id: 'master_companions' },
        { key: "أدعية وزيارات", id: 'master_ziyarat' }
    ];
    specialistBadges.forEach(item => {
        if ((newStats.topicCorrect[item.key] || 0) >= 50 && !userProfile.badges.includes(item.id)) {
            newBadges.push(item.id);
        }
    });
    const hour = new Date().getHours();
    if(hour >= 5 && hour <= 8 && !userProfile.badges.includes('morning')) newBadges.push('morning');
    if(hour >= 0 && hour <= 4 && !userProfile.badges.includes('night')) newBadges.push('night');
    if(userProfile.favorites.length >= 20 && !userProfile.badges.includes('dedicated')) newBadges.push('dedicated');
    if(userProfile.wrongQuestionsBank.length <= 0 && (stats.totalQuestions - stats.totalCorrect) >= 15 && !userProfile.badges.includes('fixer')) newBadges.push('fixer'); 
    const playedIds = quizState.questions.filter(q => q.id).map(q => q.id);
    let updatedSeenQuestions = new Set([...(userProfile.seenQuestions || []), ...playedIds]);
    let seenArray = Array.from(updatedSeenQuestions);
    if (seenArray.length > 1000) seenArray = seenArray.slice(seenArray.length - 1000);
    let updatedWrongQuestionsBank = userProfile.wrongQuestionsBank;
    if (updatedWrongQuestionsBank.length > 15) updatedWrongQuestionsBank = updatedWrongQuestionsBank.slice(updatedWrongQuestionsBank.length - 15);
    userProfile.seenQuestions = seenArray;
    userProfile.wrongQuestionsBank = updatedWrongQuestionsBank;
    
    // إضافة تحديث المخزون للقاعدة
    const firestoreUpdates = {
        highScore: newHigh, stats: newStats, wrongQuestionsBank: updatedWrongQuestionsBank, 
        seenQuestions: seenArray, badges: newBadges.length > 0 ? arrayUnion(...newBadges) : userProfile.badges,
        'stats.quizzesPlayed': newStats.quizzesPlayed, 'stats.totalCorrect': newStats.totalCorrect, 'stats.totalQuestions': newStats.totalQuestions,
        'stats.bestRoundScore': newStats.bestRoundScore, 'stats.lastPlayedDates': newStats.lastPlayedDates, 'stats.totalHardQuizzes': newStats.totalHardQuizzes,
        'stats.noHelperQuizzesCount': newStats.noHelperQuizzesCount, 'stats.maxStreak': newStats.maxStreak, 'stats.fastAnswerCount': newStats.fastAnswerCount,
        inventory: userProfile.inventory // حفظ حالة الحقيبة بعد الجوائز
    };
    Object.keys(newStats.topicCorrect).forEach(topicKey => { firestoreUpdates[`stats.topicCorrect.${topicKey}`] = newStats.topicCorrect[topicKey]; });
    await updateDoc(doc(db, "users", effectiveUserId), firestoreUpdates);
    userProfile.highScore = newHigh; userProfile.stats = newStats;
    if(newBadges.length > 0) { userProfile.badges.push(...newBadges); toast(`مبروك! حصلت على أوسمة جديدة: ${newBadges.map(b=>badgesMap[b]?.name).join(', ')}`); }
    updateProfileUI();
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
        div.innerHTML = `<p class="text-white font-bold mb-1">${statusIcon} ${i+1}. ${h.q}</p>`;
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
    const btns = ['helper-fifty-fifty', 'helper-hint', 'helper-skip', 'helper-report'];
    btns.forEach(id => getEl(id).disabled = false);
    
    // دالة مساعدة لتحديث الزر والشارة
    const updateBtn = (id, isActive, typeKey) => {
        const btn = getEl(id);
        btn.classList.toggle('opacity-50', isActive);
        
        // إزالة أي شارة قديمة
        const oldBadge = btn.querySelector('.count-badge');
        if(oldBadge) oldBadge.remove();

        // إضافة شارة العدد إذا كان يوجد رصيد في الحقيبة
        const count = userProfile.inventory.helpers[typeKey] || 0;
        if(count > 0 && !isActive) {
            const badge = document.createElement('span');
            badge.className = 'count-badge';
            badge.textContent = `x${count}`;
            btn.style.position = 'relative'; // لضمان ظهور الشارة
            btn.appendChild(badge);
        }
    };

    updateBtn('helper-fifty-fifty', helpers.fifty, 'fifty');
    updateBtn('helper-hint', helpers.hint, 'hint');
    updateBtn('helper-skip', helpers.skip, 'skip');
}


// دالة مساعدة لاستخدام وسيلة مساعدة (حقيبة ثم نقاط)
async function useHelper(type, cost, actionCallback) {
    if(helpers[type] || !quizState.active) return;

    // 1. محاولة الخصم من الحقيبة أولاً
    if(userProfile.inventory.helpers[type] > 0) {
        userProfile.inventory.helpers[type]--;
        // تنفيذ التغيير فوراً في القاعدة
        updateDoc(doc(db, "users", effectiveUserId), { [`inventory.helpers.${type}`]: userProfile.inventory.helpers[type] });
        toast(`تم استخدام ${type} من الحقيبة (مجاناً)`);
    } 
    // 2. الخصم من الرصيد العام
    else {
        if(quizState.score < cost) { toast(`رصيدك غير كافٍ! تحتاج ${cost} نقطة.`, "error"); return; }
        quizState.score -= cost;
        getEl('live-score-text').textContent = quizState.score;
        toast(`تم خصم ${cost} نقطة`);
    }

    helpers[type] = true;
    quizState.usedHelpers = true; 
    actionCallback(); // تنفيذ تأثير المساعدة
    updateHelpersUI();
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

function toggleMenu(open) { 
    const m = getEl('side-menu'); 
    const o = getEl('side-menu-overlay'); 
    if(open) { m.classList.add('open'); o.classList.add('open'); } else { m.classList.remove('open'); o.classList.remove('open'); } 
}
bind('menu-btn', 'click', () => toggleMenu(true));
bind('side-menu-overlay', 'click', () => toggleMenu(false));
const openModal = (id) => { 
    toggleMenu(false); 
    document.querySelectorAll('.modal-overlay').forEach(m=>m.classList.remove('active')); 
    getEl(id).classList.add('active'); 
};
document.querySelectorAll('.close-modal').forEach(b => b.onclick = () => document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active')));

bind('nav-home', 'click', () => { toggleMenu(false); navToHome(); });
bind('nav-badges', 'click', () => {
    openModal('badges-modal');
    const l = getEl('badges-list');
    l.innerHTML = '';
    badgesData.forEach(b => {
        const has = userProfile.badges.includes(b.id);
        const badgeEl = document.createElement('div');
        badgeEl.className = `badge-item ${has ? 'unlocked' : ''}`;
        badgeEl.innerHTML = `<span class="material-symbols-rounded text-2xl ${has ? 'text-amber-400' : 'text-slate-600'}">${b.icon}</span><p class="text-xs text-white mt-1">${b.name}</p>`;
        badgeEl.onclick = () => {
            document.querySelectorAll('.badge-item').forEach(x => x.classList.remove('selected-info'));
            badgeEl.classList.add('selected-info');
            getEl('badge-desc-display').innerHTML = `<strong class="text-amber-400 block mb-1">${b.name}</strong>${b.desc}`;
        };
        l.appendChild(badgeEl);
    });
});

bind('nav-leaderboard', 'click', async () => {
    openModal('leaderboard-modal');
    show('leaderboard-loading');
    hide('leaderboard-list');
    try {
        const q = query(collection(db, "users"), orderBy("highScore", "desc"), limit(20));
        const s = await getDocs(q);
        const l = getEl('leaderboard-list');
        l.innerHTML = '';
        let r = 1;
        s.forEach(d => {
            const data = d.data();       
            let borderClass = 'border-slate-700'; 
            let medalIcon = `<span class="text-slate-500 font-mono font-bold text-sm w-6 text-center">#${r}</span>`;
            let bgClass = 'bg-slate-800';
            if (r <= 3) {
                borderClass = 'border-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.3)]';
                bgClass = 'bg-gradient-to-r from-slate-800 to-amber-900/20';
            }
            if (r === 1) medalIcon = '<span class="material-symbols-rounded text-amber-400 text-2xl drop-shadow-md">emoji_events</span>'; 
else if (r === 2) medalIcon = '<span class="material-symbols-rounded text-slate-300 text-2xl drop-shadow-md">military_tech</span>';
else if (r === 3) medalIcon = '<span class="material-symbols-rounded text-orange-700 text-2xl drop-shadow-md">military_tech</span>';
            let avatarHtml = '';
            if (data.customAvatar) avatarHtml = `<img src="${data.customAvatar}" class="w-10 h-10 object-cover rounded-full border border-slate-600">`;
            else avatarHtml = `<div class="w-10 h-10 rounded-full bg-slate-900 border border-slate-600 flex items-center justify-center"><span class="material-symbols-rounded text-slate-200 text-2xl">account_circle</span></div>`;
            const row = document.createElement('div');
            row.className = `flex justify-between items-center p-3 ${bgClass} rounded-xl border-2 ${borderClass} mb-3 transition transform hover:scale-[1.01] cursor-pointer group hover:bg-slate-700`;
            row.innerHTML = `<div class="flex items-center gap-3"><div class="flex items-center justify-center min-w-[40px]">${medalIcon}</div><div class="w-10 h-10 rounded-full relative">${avatarHtml}</div><div class="flex flex-col"><span class="text-white text-lg font-bold group-hover:text-amber-400 transition" style="font-family: 'Amiri', serif;">${data.username}</span></div></div><div class="text-center pl-2"><span class="text-amber-400 font-mono font-bold text-lg block leading-none text-shadow">${data.highScore}</span></div>`;
            row.onclick = () => showPlayerProfile(data);
            l.appendChild(row);
            r++;
        });
        hide('leaderboard-loading');
        show('leaderboard-list');
    } catch(e) { console.error(e); getEl('leaderboard-loading').textContent = "خطأ في التحميل"; }
});

function showPlayerProfile(data) {
    getEl('popup-player-name').textContent = data.username;
    getEl('popup-player-score').textContent = `${data.highScore} نقطة`;
    if (data.customAvatar) {
        getEl('popup-player-img').src = data.customAvatar;
        show('popup-player-img');
        hide('popup-player-icon');
    } else {
        hide('popup-player-img');
        show('popup-player-icon');
    }
    const bContainer = getEl('popup-player-badges');
    bContainer.innerHTML = '';
    if (data.badges && data.badges.length > 0) {
        data.badges.forEach(bid => {
            const bObj = badgesMap[bid]; 
            if(bObj) {
                 const span = document.createElement('div');
                 span.className = 'w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center border border-amber-500/50 text-amber-400';
                 span.title = bObj.name;
                 span.innerHTML = `<span class="material-symbols-rounded text-lg">${bObj.icon}</span>`;
                 bContainer.appendChild(span);
            }
        });
    } else { bContainer.innerHTML = '<span class="text-xs text-slate-500">لا توجد أوسمة بعد</span>'; }
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
bind('font-size-slider', 'input', (e) => document.documentElement.style.setProperty('--base-size', e.target.value+'px'));
bind('delay-slider', 'input', (e) => { const v = e.target.value; transitionDelay = v * 1000; getEl('delay-val').textContent = v; });


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
    getEl('edit-username').value = userProfile.username;
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
    if(userProfile.stats) { 
        show('user-stats'); 
        getEl('stat-score').textContent = userProfile.highScore; 
        getEl('stat-played').textContent = userProfile.stats.quizzesPlayed || 0; 
    }
});

bind('close-user-modal', 'click', () => { document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active')); });

bind('save-user-btn', 'click', async () => { 
    const n = getEl('edit-username').value;
    const updates = {};
    let change = false;
    if(n && n !== userProfile.username) { updates.username = n; userProfile.username = n; change = true; }
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
    if(change) {
        await updateDoc(doc(db,"users",effectiveUserId), updates);
        updateProfileUI(); 
        toast("تم حفظ التغييرات");
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
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

function renderBag() {
    // تحديث الرصيد
    getEl('bag-user-score').textContent = userProfile.highScore;
    
    // تحديث أرقام المقتنيات
    const inv = userProfile.inventory;
    getEl('inv-lives-count').textContent = inv.lives || 0;
    getEl('inv-fifty-count').textContent = inv.helpers.fifty || 0;
    getEl('inv-hint-count').textContent = inv.helpers.hint || 0;
    getEl('inv-skip-count').textContent = inv.helpers.skip || 0;

    // تحديث قائمة الثيمات المملوكة في تبويب المقتنيات
    const themesList = getEl('inv-themes-list');
    themesList.innerHTML = '';
    const themesNames = {
        default: 'الافتراضي', ruby: 'الياقوتي', midnight: 'الزجاجي الليلي',
        royal: 'ملكي', blackfrost: 'الزجاج الأسود', persian: 'المنمنمات', ashura: 'العاشورائي',
    };
    
    (inv.themes || ['default']).forEach(t => {
        const span = document.createElement('span');
        span.className = "text-xs bg-slate-700 px-2 py-1 rounded text-slate-300 border border-slate-600";
        span.textContent = themesNames[t] || t;
        themesList.appendChild(span);
    });

    // تحديث متجر الثيمات (إظهار القفل)
    const shopList = getEl('shop-themes-list');
    shopList.innerHTML = '';
    Object.keys(themesNames).forEach(key => {
        if(key === 'default') return; // الافتراضي لا يباع
        const isOwned = inv.themes.includes(key);
        const btn = document.createElement('button');
        // تنسيق الزر بناء على الملكية
        btn.className = `p-3 rounded-xl border border-slate-600 text-center relative transition hover:border-amber-400 ${isOwned ? 'shop-item-owned' : 'shop-item-locked'}`;
        
        btn.innerHTML = `
            <div class="h-12 w-full bg-slate-900 rounded mb-2 border border-slate-700 overflow-hidden" data-theme-preview="${key}"></div>
            <p class="text-white text-sm font-bold">${themesNames[key]}</p>
        `;
        
        if(!isOwned) {
            btn.onclick = () => window.buyShopItem('theme', 500, key);
        }
        shopList.appendChild(btn);
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

// دالة الشراء العالمية
window.buyShopItem = async function(type, cost, id=null) {
    if(userProfile.highScore < cost) {
        toast("رصيدك غير كافٍ!", "error");
        playSound('lose');
        return;
    }

    // استخدام نافذة التأكيد الجديدة
    window.showConfirm(
        "تأكيد الشراء", 
        `هل تريد دفع ${cost} نقطة لإتمام العملية؟`, 
        "shopping_cart", 
        async () => {
            // خصم النقاط
            userProfile.highScore -= cost;
            
            // إضافة العنصر
            if(type === 'theme') {
                userProfile.inventory.themes.push(id);
                toast(`تم شراء ثيم: ${id}`);
            } else if(type === 'life') {
                userProfile.inventory.lives++;
                toast("تم شراء قلب إضافي ❤️");
            } else if(type === 'fifty') {
                userProfile.inventory.helpers.fifty++;
                toast("تم شراء مساعدة 50/50");
            } else if(type === 'hint') {
                userProfile.inventory.helpers.hint++;
                toast("تم شراء تلميح 💡");
            } else if(type === 'skip') {
                userProfile.inventory.helpers.skip++;
                toast("تم شراء تخطي ⏭️");
            }

            // حفظ في قاعدة البيانات
            try {
                await updateDoc(doc(db, "users", effectiveUserId), {
                    highScore: userProfile.highScore,
                    inventory: userProfile.inventory
                });
                playSound('win');
                renderBag(); // تحديث الواجهة
                updateProfileUI(); // تحديث الرصيد في الهيدر
                updateThemeSelector(); // تحديث قائمة الثيمات في الإعدادات
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

function loadAIWisdom() {
    const wEl = getEl('wisdom-text');
    wEl.style.opacity = '0';
    wEl.style.transition = 'opacity 0.5s';
    setTimeout(() => {
        const randomWisdom = staticWisdoms[Math.floor(Math.random() * staticWisdoms.length)];
        wEl.textContent = `"${randomWisdom}"`;
        wEl.style.opacity = '1';
    }, 500);
}

function launchConfetti() { const canvas = getEl('confetti-canvas'); const ctx = canvas.getContext('2d'); canvas.width = window.innerWidth; canvas.height = window.innerHeight; let particles = []; for(let i=0; i<100; i++) particles.push({x:Math.random()*canvas.width, y:Math.random()*canvas.height-canvas.height, c:['#fbbf24','#f59e0b','#ffffff'][Math.floor(Math.random()*3)], s:Math.random()*5+2, v:Math.random()*5+2}); function draw() { ctx.clearRect(0,0,canvas.width,canvas.height); particles.forEach(p => { ctx.fillStyle=p.c; ctx.beginPath(); ctx.arc(p.x,p.y,p.s,0,Math.PI*2); ctx.fill(); p.y+=p.v; if(p.y>canvas.height) p.y=-10; }); requestAnimationFrame(draw); } draw(); setTimeout(()=>canvas.width=0, 5000); }

bind('login-btn', 'click', handleLogin);
bind('register-btn', 'click', handleReg);
bind('show-register-btn', 'click', () => { hide('login-view'); show('register-view'); getEl('login-error-message').textContent=''; });
bind('show-login-btn', 'click', () => { hide('register-view'); show('login-view'); getEl('register-error-message').textContent=''; });

bind('btn-marathon-start', 'click', () => { 
    document.getElementById('marathon-rules-modal').classList.add('active'); 
    getEl('ai-question-count').disabled = true;
    getEl('ai-generate-btn').disabled = true;
    getEl('btn-marathon-start').disabled = true;
});

bind('btn-marathon-confirm', 'click', startMarathon);

function showReviveModal() {
    let modal = document.getElementById('revive-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'revive-modal';
        modal.className = 'modal-overlay';
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
                        ${userProfile.highScore} <span class="material-symbols-rounded text-sm">monetization_on</span>
                    </span>
                </div>
                <div class="space-y-3">
                    <button onclick="window.buyLives(1, 50)" class="w-full bg-slate-700 hover:bg-slate-600 border border-slate-600 p-3 rounded-xl flex justify-between items-center group transition">
                        <div class="flex items-center gap-2"><span class="material-symbols-rounded text-red-500">favorite</span><span class="text-white font-bold">1 قلب</span></div>
                        <span class="text-amber-400 font-bold text-sm bg-black/20 px-2 py-1 rounded">50 نقطة</span>
                    </button>
                    <button onclick="window.buyLives(2, 90)" class="w-full bg-slate-700 hover:bg-slate-600 border border-slate-600 p-3 rounded-xl flex justify-between items-center group transition">
                        <div class="flex items-center gap-2"><div class="flex"><span class="material-symbols-rounded text-red-500">favorite</span><span class="material-symbols-rounded text-red-500 -mr-2">favorite</span></div><span class="text-white font-bold">2 قلب</span></div>
                        <span class="text-amber-400 font-bold text-sm bg-black/20 px-2 py-1 rounded">90 نقطة <span class="text-[10px] text-green-400">(وفر 10)</span></span>
                    </button>
                    <button onclick="window.buyLives(3, 120)" class="w-full bg-slate-700 hover:bg-slate-600 border border-slate-600 p-3 rounded-xl flex justify-between items-center group transition">
                        <div class="flex items-center gap-2"><div class="flex"><span class="material-symbols-rounded text-red-500">favorite</span><span class="material-symbols-rounded text-red-500 -mr-2">favorite</span><span class="material-symbols-rounded text-red-500 -mr-2">favorite</span></div><span class="text-white font-bold">3 قلوب</span></div>
                        <span class="text-amber-400 font-bold text-sm bg-black/20 px-2 py-1 rounded">120 نقطة <span class="text-[10px] text-green-400">(وفر 30)</span></span>
                    </button>
                </div>
                <div class="mt-6 border-t border-slate-700 pt-4">
                    <button onclick="window.cancelRevive()" class="w-full text-slate-500 hover:text-red-400 text-sm transition">لا شكراً، إنهاء الجولة</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    } else {
        const balanceDisplay = modal.querySelector('.text-amber-400.font-bold.text-xl');
        if(balanceDisplay) balanceDisplay.innerHTML = `${userProfile.highScore} <span class="material-symbols-rounded text-sm">monetization_on</span>`;
    }
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

            btn.innerHTML = `
                <span class="text-lg font-mono font-bold text-black" dir="ltr">
                    ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}
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
                contentEl.textContent = data.message; 
                
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

// Inject CSS for Sauron Eye
const sauronStyle = document.createElement('style');
sauronStyle.innerHTML = `
@keyframes sauronPulse { 0% { transform: scale(1); opacity: 0.9; } 50% { transform: scale(1.05); opacity: 1; box-shadow: 0 0 80px #ff3300; } 100% { transform: scale(1); opacity: 0.9; } }
@keyframes pupilMove { 0% { height: 60%; width: 15px; } 50% { height: 70%; width: 10px; } 100% { height: 60%; width: 15px; } }
.sauron-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.95); z-index: 10000; display: flex; justify-content: center; align-items: center; opacity: 0; pointer-events: none; transition: opacity 0.8s ease-in-out; }
.sauron-overlay.active { opacity: 1; pointer-events: auto; }
.eye-shape { 
    position: relative; width: 300px; height: 140px; 
    background: radial-gradient(circle at 50% 50%, #ffdd00 0%, #ff8800 25%, #cc0000 60%, #330000 100%); 
    border-radius: 70% 70% 70% 70% / 100% 100% 100% 100%; 
    box-shadow: 0 0 60px #ff2200, inset 0 0 30px #000; 
    animation: sauronPulse 3s infinite ease-in-out; 
    display: flex; justify-content: center; align-items: center; overflow: hidden; border: 2px solid #550000;
}
.eye-pupil { 
    width: 15px; height: 60%; background: #000; 
    border-radius: 50%; box-shadow: 0 0 15px #ff0000; 
    animation: pupilMove 0.5s infinite alternate; filter: blur(1px);
}
`;
document.head.appendChild(sauronStyle);

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
            toast("🔓 تم كسر الزمن! الماراثون متاح الآن.", "success");
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