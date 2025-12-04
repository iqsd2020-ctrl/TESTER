import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, query, where, getDocs, serverTimestamp, orderBy, limit, arrayUnion, increment } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
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
            const rawData = snap.data();
            
            // --- هنا يبدأ السحر: الفحص والإصلاح التلقائي ---
            const { cleanData, wasFixed } = sanitizeUserData(rawData);

            if (wasFixed) {
                console.log("Found corrupted data for user, auto-fixing...");
                // تحديث قاعدة البيانات بالنسخة النظيفة بصمت
                await updateDoc(doc(db, "users", uid), cleanData);
                userProfile = cleanData; // استخدام النسخة النظيفة في التطبيق
            } else {
                userProfile = rawData; // البيانات سليمة
            }
            // ------------------------------------------------

        } else {
            // مستخدم جديد (لا يحتاج إصلاح)
            userProfile = { 
                username: "ضيف", highScore: 0, badges: ['beginner'], favorites: [], wrongQuestionsBank: [], customAvatar: null,
                seenQuestions: [], stats: { topicCorrect: {}, lastPlayedDates: [], totalHardQuizzes: 0, noHelperQuizzesCount: 0, maxStreak: 0, fastAnswerCount: 0 },
                inventory: { lives: 0, helpers: { fifty: 0, hint: 0, skip: 0 }, themes: ['default'] }
            };
        }
        updateProfileUI();
    } catch(e) { console.error("Error loading profile:", e); }
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
    getEl('header-score').textContent = formatNumberAr(userProfile.highScore || 0, true);
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


bind('ai-generate-btn', 'click', async () => {
    // --- بداية التعديل: التحقق من بنك الأخطاء ---
    if (userProfile.wrongQuestionsBank && userProfile.wrongQuestionsBank.length > 0) {
        openModal('force-review-modal');
        return; // إيقاف الدالة ومنع بدء اللعب
    }
    // --- نهاية التعديل ---
    const cat = getEl('category-select').value;
    // ... يكمل الكود كما هو دون تغيير ...
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
        
        // 1. رفع الحد الأقصى للجلب (Query Limit)
        // غيرنا الرقم من 500 إلى 5000 لنضمن أن النظام "يرى" كل الأسئلة الموجودة في القاعدة
        // هذا يحل مشكلة "العمى" حيث يظن النظام أن الأسئلة انتهت بينما هي موجودة لكن لم يتم تحميلها
        const QUERY_LIMIT = 5000;

        if(cat === 'random' || !cat) {
            qQuery = query(collection(db, "questions"), where("isReviewed", "==", true), limit(QUERY_LIMIT)); 
        } else {
            qQuery = query(collection(db, "questions"), where("topic", "==", topic), where("isReviewed", "==", true), limit(QUERY_LIMIT));
        }
        
        const snap = await getDocs(qQuery);
        
        // التحقق من وجود أسئلة في القسم أصلاً
        if (cat !== 'random' && cat !== '' && snap.empty) {
            toast("عذراً، لا توجد أسئلة متاحة لهذا الموضوع حالياً.", "error");
            btn.disabled = false; 
            btn.innerHTML = `<span class="text-lg">ابدأ التحدي</span> <span class="material-symbols-rounded">play_circle</span>`;
            return;
        }

        snap.forEach(d => firebaseQs.push({ id: d.id, ...d.data() }));
        
        // 2. الفلترة الصارمة (Strict Filtering)
        let allAvailableQuestions = firebaseQs;
        const seenIds = userProfile.seenQuestions || [];
        
        // استبعاد أي سؤال موجود في قائمة seenIds
        let freshQuestions = allAvailableQuestions.filter(q => !seenIds.includes(q.id));
        
        // خلط الأسئلة الجديدة
        shuffleArray(freshQuestions);
        
        // 3. منطق التوزيع (Allocation Logic)
        if (freshQuestions.length >= count) {
            // الحالة الممتازة: لدينا أسئلة جديدة تكفي للعدد المطلوب
            quizState.questions = freshQuestions.slice(0, count);
        } else if (freshQuestions.length > 0) {
            // الحالة المتوسطة: لدينا أسئلة جديدة لكن أقل من المطلوب (مثلاً طلب 10 ووجدنا 4)
            // القرار الصارم: نعطيه الـ 4 فقط ولا نخلطها بالقديم
            quizState.questions = freshQuestions;
            toast(`تبقى لديك ${freshQuestions.length} أسئلة جديدة فقط في هذا القسم!`, "info");
        } else {
            // حالة نفاذ الكمية تماماً (Zero Fresh Questions)
            // هنا فقط يُسمح بالتكرار
            let recycledQuestions = [...allAvailableQuestions];
            shuffleArray(recycledQuestions);
            quizState.questions = recycledQuestions.slice(0, count);
            
            toast("سيتم عرض اسئله سابقة في هذه الجوله.", "warning");
        }

        // التحقق النهائي للأمان
        if(quizState.questions.length === 0) { 
            toast("لا توجد أسئلة كافية لبدء الجولة.", "error"); 
            throw new Error("No questions"); 
        }
        
        // بدء اللعبة
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
    // التعديل: استخدام formatNumberAr للرقم
    el.innerHTML = `
        <div class="flex items-center gap-1 transition-all duration-300">
            <span class="material-symbols-rounded text-red-500 text-2xl drop-shadow-sm ${quizState.lives <= 1 ? 'animate-pulse' : ''}">favorite</span>
            <span class="text-red-400 font-bold text-xl font-heading pt-1" dir="ltr">x${formatNumberAr(quizState.lives)}</span>
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
        
        // --- متغيرات النقاط والمضاعف ---
        let basePoints = 1; 
        let multiplier = 1;
        let multiplierText = "";

        // --- التعديل: تفعيل الستريك والمكافآت فقط في الماراثون ---
        if (quizState.mode === 'marathon') {
            quizState.streak++;
            
            // تحديث إحصائية أعلى ستريك فقط في الماراثون
            if(quizState.streak > userProfile.stats.maxStreak) { userProfile.stats.maxStreak = quizState.streak; } 

            // مكافأة الثيمات (خاصة بالماراثون)
            quizState.marathonCorrectStreak = (quizState.marathonCorrectStreak || 0) + 1;
            if(quizState.marathonCorrectStreak === 15) {
                unlockRandomThemeReward();
                quizState.marathonCorrectStreak = 0; 
            }

            // حساب المضاعفات
            if (quizState.streak >= 15) { multiplier = 4; multiplierText = "x4 🪙"; }
            else if (quizState.streak >= 9) { multiplier = 3; multiplierText = "x3 ✨"; }
            else if (quizState.streak >= 5) { multiplier = 2; multiplierText = "x2🔸"; }

            // صوت الستريك
            if(quizState.streak >= 5) playSound('streak'); else playSound('win');
        } else {
            // في الوضع العادي: لا يوجد ستريك ولا مضاعفات
            quizState.streak = 0;
            playSound('win');
        }
        // -------------------------------------------------------
        
        let pointsAdded = Math.floor(basePoints * multiplier);
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
        
        // عرض رسالة النقاط (مع المضاعف فقط إن وجد)
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
        if(btn) { btn.classList.remove('opacity-60'); btn.classList.add('btn-incorrect'); }
        if(q.correctAnswer >= 0 && q.correctAnswer < btns.length) {
            btns[q.correctAnswer].classList.remove('opacity-60'); 
            btns[q.correctAnswer].classList.add('btn-correct');
        } 
        
        // --- التعديل: منطق خفض الستريك فقط في الماراثون ---
        if (quizState.mode === 'marathon') {
            if (quizState.streak >= 10) { quizState.streak = 5; toast("تم تفعيل حماية الستريك! انخفض إلى 5 بدلاً من 0", "info"); } 
            else if (quizState.streak >= 5) { quizState.streak = 2; } 
            else { quizState.streak = 0; }
        } else {
            quizState.streak = 0;
        }
        // ------------------------------------------------
        
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

async function endQuiz() {
    // 1. إعداد الواجهة وإظهار النتائج
    hide('quiz-proper'); 
    show('results-area');
    
    // التأكد من أن القيم أرقام لضمان عدم ظهور NaN
    const safeCorrectCount = Number(quizState.correctCount) || 0;
    const safeTotalQuestions = Number(quizState.questions.length) || 0;
    const accuracy = safeTotalQuestions > 0 ? Math.round((safeCorrectCount / safeTotalQuestions) * 100) : 0;

    // تحديث بطاقة النتيجة
    getEl('card-score').textContent = formatNumberAr(quizState.score); 
    getEl('card-username').textContent = userProfile.username;
    getEl('card-difficulty').textContent = quizState.difficulty;
    
    getEl('card-correct-count').innerHTML = `<span class="material-symbols-rounded text-green-400 text-sm align-middle">check_circle</span> ${formatNumberAr(safeCorrectCount)}`;
    getEl('card-wrong-count').innerHTML = `<span class="material-symbols-rounded text-red-400 text-sm align-middle">cancel</span> ${formatNumberAr(safeTotalQuestions - safeCorrectCount)}`;

    // 2. رسالة النتيجة
    let msg = "حاول مرة أخرى";
    if(accuracy === 100) { 
        msg = "أداء أسطوري! درجة كاملة"; 
        playSound('applause'); 
    } else if(accuracy >= 80) msg = "أداء ممتاز!";
    else if(accuracy >= 50) msg = "جيد جداً";
    
    getEl('final-message').textContent = msg;

    // 3. حساب الإحصائيات الجديدة (Stats)
    const stats = userProfile.stats || {};
    
    const oldTotalCorrect = Number(stats.totalCorrect) || 0;
    const oldTotalQs = Number(stats.totalQuestions) || 0;
    const oldBestScore = Number(stats.bestRoundScore) || 0;
    const oldQuizzesPlayed = Number(stats.quizzesPlayed) || 0;
    
    // إصلاح التاريخ
    const currentTodayStr = new Date().toISOString().split('T')[0];
    let lastPlayedDates = Array.isArray(stats.lastPlayedDates) ? stats.lastPlayedDates.filter(d => d !== currentTodayStr).slice(-6) : [];
    if(!lastPlayedDates.includes(currentTodayStr)) lastPlayedDates.push(currentTodayStr);

    const newStats = {
        quizzesPlayed: oldQuizzesPlayed + 1,
        totalCorrect: oldTotalCorrect + safeCorrectCount,
        totalQuestions: oldTotalQs + safeTotalQuestions,
        bestRoundScore: Math.max(oldBestScore, quizState.score),
        
        topicCorrect: stats.topicCorrect || {},
        lastPlayedDates: lastPlayedDates,
        totalHardQuizzes: Number(stats.totalHardQuizzes) || 0,
        noHelperQuizzesCount: (Number(stats.noHelperQuizzesCount) || 0) + (!quizState.usedHelpers ? 1 : 0),
        maxStreak: Math.max((Number(stats.maxStreak) || 0), quizState.streak), // تحديث الستريك
        fastAnswerCount: (Number(stats.fastAnswerCount) || 0) + (quizState.fastAnswers >= 10 ? 1 : 0),
        enrichmentCount: stats.enrichmentCount || 0 // للحفاظ على عداد القراءة
    };

    // تحديث إحصائيات المواضيع (لأوسمة التخصص)
    // هنا مربط الفرس: نحتسب الموضوع لكل سؤال تمت إجابته بشكل صحيح
    // (حالياً نعتمد على موضوع الجولة، لكن يمكن تطويره لاحقاً ليشمل موضوع كل سؤال)
    const currentTopic = quizState.contextTopic;
    if (currentTopic && currentTopic !== 'عام' && currentTopic !== 'مراجعة الأخطاء') {
        const oldTopicScore = Number(newStats.topicCorrect[currentTopic]) || 0;
        newStats.topicCorrect[currentTopic] = oldTopicScore + safeCorrectCount;
    }

    // 4. إدارة الأسئلة وبنك الأخطاء
    const playedIds = quizState.questions.filter(q => q.id).map(q => q.id);
    const oldSeen = Array.isArray(userProfile.seenQuestions) ? userProfile.seenQuestions : [];
    let updatedSeenQuestions = [...new Set([...oldSeen, ...playedIds])]; 

    let updatedWrongQuestionsBank = Array.isArray(userProfile.wrongQuestionsBank) ? userProfile.wrongQuestionsBank : [];
    if (updatedWrongQuestionsBank.length > 15) updatedWrongQuestionsBank = updatedWrongQuestionsBank.slice(-15);

    // 5. الحفظ في Firebase
    const firestoreUpdates = {
        highScore: increment(quizState.score), 
        stats: newStats, 
        wrongQuestionsBank: updatedWrongQuestionsBank, 
        seenQuestions: updatedSeenQuestions,
        // inventory: userProfile.inventory // لا نحتاج إرسالها هنا لأننا لم نعدلها في هذه الدالة، سنتركها لدالة الأوسمة
    };

    try {
        await updateDoc(doc(db, "users", effectiveUserId), firestoreUpdates);
        
        // التحديث المحلي المتزامن
        userProfile.highScore = (Number(userProfile.highScore) || 0) + quizState.score;
        userProfile.stats = newStats;
        userProfile.wrongQuestionsBank = updatedWrongQuestionsBank;
        userProfile.seenQuestions = updatedSeenQuestions;
        
        updateProfileUI(); // تحديث الهيدر

        // --- 🚀 تشغيل النظام الجديد (هنا التغيير) ---
        // ننتظر ثانية واحدة ثم نفحص الأوسمة والمحفزات
        setTimeout(async () => {
            // هذه الدالة ستفحص الأوسمة، تمنح الجوائز، وتُظهر النافذة
            const gotBadge = await checkAndUnlockBadges();
            
            // إذا لم يحصل على وسام جديد، نظهر له المحفز "أنت قريب"
            if (!gotBadge) {
                showMotivator(); 
            }
        }, 1000);
        // ---------------------------------------------

    } catch(e) {
        console.error("Error saving quiz results:", e);
        toast("تم حفظ النقاط محلياً مؤقتاً لضعف الاتصال", "info");
        // حتى لو فشل الاتصال، نحدث محلياً ليستمر اللعب
        userProfile.highScore = (Number(userProfile.highScore) || 0) + quizState.score;
        updateProfileUI();
    }

    // إضافة إشعار محلي للنهاية
    addLocalNotification(
        'نهاية جولة', 
        `أتممت جولة في "${quizState.contextTopic}". النتيجة: ${quizState.score} نقطة.`, 
        'sports_score'
    );

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
        getEl('live-score-text').textContent = formatNumberAr(quizState.score);

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
    const container = getEl('badges-list');
    
    container.className = 'badges-list-container'; 
    container.innerHTML = '';

    const sortedBadges = sortBadgesSmartly();

    sortedBadges.forEach(b => {
        const progressData = getBadgeProgress(b);
        const targetLvl = progressData.activeLevel;
        
        // --- ضبط الألوان (أحمر -> أبيض -> ذهبي) ---
        let iconColorClass = 'text-slate-600 opacity-50'; // لون القفل (رمادي غامق)
        let glowClass = ''; 
        let tierText = '';
        let barColor = '#ef4444'; // أحمر افتراضي

        // تحديد اللون بناءً على المستوى الذي وصل له
        if (progressData.tier === 'bronze' || (progressData.percent > 0 && progressData.tier === 'locked')) {
            // المستوى 1: برونزي (أحمر حسب طلبك)
            iconColorClass = 'text-red-500 drop-shadow-sm';
            tierText = 'مستوى برونزي';
            barColor = '#ef4444'; // أحمر
        } else if (progressData.tier === 'silver') {
            // المستوى 2: فضي (أبيض)
            iconColorClass = 'text-slate-100 drop-shadow-md'; 
            glowClass = 'shadow-[0_0_10px_rgba(255,255,255,0.3)]';
            tierText = 'مستوى فضي';
            barColor = '#f8fafc'; // أبيض
        } else if (progressData.tier === 'gold') {
            // المستوى 3: ذهبي
            iconColorClass = 'text-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.8)] animate-pulse-slow';
            tierText = 'مستوى ذهبي 👑';
            barColor = '#fbbf24'; // ذهبي
        }

        // --- عرض الجائزة القادمة ---
        let miniRewardHtml = '';
        if (targetLvl.rewards && !progressData.isMaxed) {
             if(targetLvl.rewards.score) {
                miniRewardHtml += `
                    <div class="flex items-center justify-center gap-0.5 text-amber-400 mb-0.5">
                        <span class="material-symbols-rounded text-[10px]">monetization_on</span>
                        <span class="font-bold text-[9px]" dir="ltr">${formatNumberAr(targetLvl.rewards.score)}</span>
                    </div>`;
            }
             if(targetLvl.rewards.lives) {
                miniRewardHtml += `
                    <div class="flex items-center justify-center gap-0.5 text-red-500">
                        <span class="material-symbols-rounded text-[10px]">favorite</span>
                        <span class="font-bold text-[9px]" dir="ltr">+${targetLvl.rewards.lives}</span>
                    </div>`;
            }
        } else if (progressData.isMaxed) {
            miniRewardHtml = '<span class="text-[9px] text-green-400 font-bold">تم الختم</span>';
        }

        // الأيقونة
        let iconHtml = `<span class="material-symbols-rounded">${b.icon}</span>`;
        if(progressData.isMaxed) iconHtml = `<span class="material-symbols-rounded">military_tech</span>`; 

        // حالة البطاقة
        let cardClass = progressData.percent > 0 ? 'active-target' : 'locked';
        if (progressData.isMaxed) cardClass = 'unlocked';

        const div = document.createElement('div');
        div.className = `badge-card ${cardClass} ${progressData.tier === 'gold' ? 'border-amber-500/50' : ''}`;
        
        div.innerHTML = `
            <div class="flex flex-col items-center justify-center gap-1 ml-3 shrink-0" style="min-width: 60px;">
                <div class="badge-icon-box ${iconColorClass} ${glowClass}" style="margin: 0 !important; width: 50px !important; height: 50px !important; font-size: 1.8rem !important; border: 2px solid currentColor !important; background: rgba(0,0,0,0.2);">
                    ${iconHtml}
                </div>
                
                <div class="flex flex-col w-full mt-1 bg-slate-900/40 rounded px-1 py-1 border border-white/5 items-center min-h-[20px] justify-center">
                    ${miniRewardHtml || '<span class="text-[9px] text-slate-500">-</span>'}
                </div>
            </div>

            <div class="badge-info flex flex-col justify-center h-full w-full">
                <div class="flex justify-between items-center mb-1">
                    <div class="flex flex-col">
                        <h4 class="font-bold text-white text-sm leading-tight">${b.name}</h4>
                        <span class="text-[9px] ${iconColorClass} font-bold opacity-90">${tierText || 'غير مكتسب'}</span>
                    </div>
                    
                    <div class="bg-slate-900/50 px-2 py-0.5 rounded text-[10px] border border-white/5 shrink-0">
                         <span class="text-amber-400 font-bold" dir="ltr">${formatNumberAr(progressData.current)} / ${formatNumberAr(progressData.max)}</span>
                    </div>
                </div>
                
                <p class="text-[10px] text-slate-400 mb-2 leading-tight opacity-80 pl-1">${b.desc}</p>
                
                <div class="badge-progress-track" style="height: 6px; background: rgba(255,255,255,0.05); border-radius: 4px; overflow: hidden;">
                    <div class="badge-progress-fill" style="width: ${progressData.percent}%; background: ${barColor}; transition: width 1s;"></div>
                </div>
            </div>
        `;

        container.appendChild(div);
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
            
            let medalIcon = `<span class="text-slate-500 font-mono font-bold text-sm w-6 text-center">#${formatNumberAr(r)}</span>`;
            
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
            
            // --- 👇 (الجديد) منطق تصغير الخط حسب طول الاسم 👇 ---
            let fontSizeClass = 'text-lg'; // الحجم الطبيعي
            const nameLen = data.username.length;
            
            if (nameLen > 25) fontSizeClass = 'text-[10px] leading-tight'; // صغير جداً للأسماء الطويلة جداً
            else if (nameLen > 18) fontSizeClass = 'text-xs'; // صغير
            else if (nameLen > 12) fontSizeClass = 'text-sm'; // متوسط
            
            // --- 👆 ------------------------------------- 👆 ---

            const row = document.createElement('div');
            row.className = `flex justify-between items-center p-3 ${bgClass} rounded-xl border-2 ${borderClass} mb-3 transition transform hover:scale-[1.01] cursor-pointer group hover:bg-slate-700`;
            
            // لاحظ إضافة class: whitespace-nowrap overflow-hidden
            // واستبدال text-lg بـ ${fontSizeClass}
            row.innerHTML = `
                <div class="flex items-center gap-3 overflow-hidden">
                    <div class="flex items-center justify-center min-w-[40px] shrink-0">${medalIcon}</div>
                    <div class="w-10 h-10 rounded-full relative shrink-0">${avatarHtml}</div>
                    <div class="flex flex-col overflow-hidden w-full">
                        <span class="text-white ${fontSizeClass} font-bold group-hover:text-amber-400 transition whitespace-nowrap overflow-hidden text-ellipsis" style="font-family: 'Amiri', serif;">${data.username}</span>
                    </div>
                </div>
                <div class="text-center pl-2 shrink-0 min-w-[60px]">
                    <span class="text-amber-400 font-mono font-bold text-lg block leading-none text-shadow">${formatNumberAr(data.highScore, true)}</span>
                </div>`;
            row.onclick = () => showPlayerProfile(data);
            l.appendChild(row);
            r++;
        });
        hide('leaderboard-loading');
        show('leaderboard-list');
    } catch(e) { console.error(e); getEl('leaderboard-loading').textContent = "خطأ في التحميل"; }
});


function showPlayerProfile(data) {
    // 1. تعبئة البيانات الأساسية
    getEl('popup-player-name').textContent = data.username;
    getEl('popup-player-score').textContent = `${formatNumberAr(data.highScore)} نقطة`;
    
    // 2. عرض الصورة الشخصية
    if (data.customAvatar) {
        getEl('popup-player-img').src = data.customAvatar;
        show('popup-player-img');
        hide('popup-player-icon');
    } else {
        hide('popup-player-img');
        show('popup-player-icon');
    }

    // 3. تجهيز حاوية الأوسمة (تغيير التنسيق لشبكة)
    const bContainer = getEl('popup-player-badges');
    bContainer.innerHTML = '';
    // جعلنا التنسيق شبكياً (Grid) ليحتوي 3 أوسمة في الصف الواحد بشكل مرتب
    bContainer.className = 'grid grid-cols-3 gap-3 justify-items-center max-h-60 overflow-y-auto p-2 scrollbar-thin';

    // 4. إنشاء (أو إعادة تهيئة) صندوق الوصف أسفل الأوسمة
    // نتحقق مما إذا كان الصندوق موجوداً من قبل لتجنب تكراره
    let descBox = document.getElementById('profile-badge-desc-box');
    if (!descBox) {
        descBox = document.createElement('div');
        descBox.id = 'profile-badge-desc-box';
        descBox.className = 'mt-4 p-3 bg-slate-900/50 rounded-lg border border-slate-700 text-center min-h-[4rem] flex items-center justify-center w-full';
        // نضيفه بعد حاوية الأوسمة مباشرة
        bContainer.parentNode.appendChild(descBox);
    }
    // النص الافتراضي عند الفتح
    descBox.innerHTML = '<p class="text-xs text-slate-500 animate-pulse">اضغط على أي وسام لمعرفة قصة الحصول عليه</p>';

    // 5. تعبئة الأوسمة
    if (data.badges && data.badges.length > 0) {
        data.badges.forEach(bid => {
            const bObj = badgesMap[bid]; 
            if(bObj) {
                 // العنصر الحاوي للوسام واسمه
                 const item = document.createElement('div');
                 item.className = 'flex flex-col items-center gap-1 cursor-pointer group w-full';

                 // أيقونة الوسام
                 const iconDiv = document.createElement('div');
                 iconDiv.className = 'w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center border border-amber-500/30 text-amber-400 group-hover:bg-amber-500/20 group-hover:scale-110 group-hover:border-amber-400 transition duration-300';
                 iconDiv.innerHTML = `<span class="material-symbols-rounded text-2xl">${bObj.icon}</span>`;

                 // اسم الوسام (يظهر تحته)
                 const nameSpan = document.createElement('span');
                 nameSpan.className = 'text-[10px] text-slate-400 text-center font-bold group-hover:text-amber-300 transition leading-tight';
                 nameSpan.textContent = bObj.name;

                 item.appendChild(iconDiv);
                 item.appendChild(nameSpan);

                 // الحدث عند الضغط
                 item.onclick = () => {
                     // تأثير التحديد البصري (إزالة التحديد من الباقين)
                     const allIcons = bContainer.querySelectorAll('div > div:first-child');
                     allIcons.forEach(ic => ic.classList.remove('ring-2', 'ring-amber-400', 'bg-amber-500/30'));
                     iconDiv.classList.add('ring-2', 'ring-amber-400', 'bg-amber-500/30');

                     // تحديث صندوق الوصف بالنص المطلوب
                     // نستخدم bObj.desc الموجود في ملف data.js والذي يحتوي العبارة مثل "لعب 100 مسابقة..."
                     descBox.innerHTML = `
                        <div class="fade-in">
                            <strong class="text-amber-400 text-xs block mb-1 border-b border-amber-500/20 pb-1 mx-auto w-fit">${bObj.name}</strong>
                            <p class="text-xs text-slate-200 leading-relaxed">
                                حصل على هذا الوسام: <br>
                                <span class="text-green-400 font-bold">"${bObj.desc}"</span>
                            </p>
                        </div>
                     `;
                     playSound('click'); // صوت اختياري عند الضغط
                 };

                 bContainer.appendChild(item);
            }
        });
    } else { 
        bContainer.innerHTML = '<span class="col-span-3 text-xs text-slate-500 py-6">لا توجد أوسمة مكتسبة بعد لهذا البطل.</span>'; 
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
    
    // تعبئة الاسم الحالي
    getEl('edit-username').value = userProfile.username;
    
    // تفريغ حقل كلمة المرور دائماً عند الفتح
    if(getEl('edit-password')) getEl('edit-password').value = ''; 

    // عرض الصورة الشخصية
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
    
    // عرض الإحصائيات
    if(userProfile.stats) { 
        show('user-stats'); 
        getEl('stat-score').textContent = formatNumberAr(userProfile.highScore); 
        getEl('stat-played').textContent = formatNumberAr(userProfile.stats.quizzesPlayed || 0); 
    }
});


bind('close-user-modal', 'click', () => { document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active')); });

bind('save-user-btn', 'click', async () => { 
    const n = getEl('edit-username').value.trim();
    const newPass = getEl('edit-password') ? getEl('edit-password').value.trim() : ""; // الحصول على كلمة المرور الجديدة
    
    const updates = {};
    let change = false;

    // 1. معالجة تغيير الاسم
    if(n && n !== userProfile.username) { 
        updates.username = n; 
        userProfile.username = n; 
        change = true; 
    }

    // 2. معالجة تغيير كلمة المرور (الجديد)
    if (newPass) {
        if (newPass.length < 4) {
            toast("كلمة المرور قصيرة جداً (4 أحرف على الأقل)", "error");
            return; // إيقاف الحفظ إذا كانت الكلمة قصيرة
        }
        updates.password = newPass; // إضافة كلمة المرور للتحديثات
        change = true;
    }

    // 3. معالجة الصورة الرمزية
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
                        // --- إضافة إشعارات التعديل ---
            if (updates.password) addLocalNotification('أمان الحساب 🔐', 'تم تغيير كلمة المرور بنجاح', 'lock_reset');
            if (updates.customAvatar) addLocalNotification('تحديث الملف', 'تم تغيير الصورة الشخصية', 'account_circle');
            if (updates.username) addLocalNotification('تحديث الملف', `تم تغيير الاسم إلى ${updates.username}`, 'badge');

            toast("✅ تم حفظ التغييرات بنجاح");
            
            // إغلاق النافذة
            document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
        } catch(e) {
            console.error(e);
            toast("حدث خطأ أثناء الحفظ", "error");
        } finally {
            btn.disabled = false;
            btn.textContent = "حفظ التغييرات";
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

function renderBag() {
    // تحديث الرصيد
    getEl('bag-user-score').textContent = formatNumberAr(userProfile.highScore);
    
    // --- بداية التعديل: تعريب أرقام المقتنيات والمساعدات ---
    const inv = userProfile.inventory;
    getEl('inv-lives-count').textContent = formatNumberAr(inv.lives || 0);       // عدد القلوب
    getEl('inv-fifty-count').textContent = formatNumberAr(inv.helpers.fifty || 0); // عدد 50/50
    getEl('inv-hint-count').textContent = formatNumberAr(inv.helpers.hint || 0);   // عدد التلميحات
    getEl('inv-skip-count').textContent = formatNumberAr(inv.helpers.skip || 0);   // عدد التخطي
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
                                // --- إضافة إشعار الشراء ---
                let itemName = type === 'theme' ? `ثيم` : (type === 'life' ? 'قلب إضافي' : 'وسيلة مساعدة');
                addLocalNotification('عملية شراء 🛒', `تم شراء ${itemName} مقابل ${cost} نقطة`, 'shopping_bag');

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


// --- دالة حساب التقدم والمستوى (المطورة) ---
function getBadgeProgress(badge) {
    const stats = userProfile.stats || {};
    let currentScore = 0;

    // 1. حساب النقاط الحالية بدقة (مع البحث الذكي)
    if (badge.type === 'topic') {
        if (stats.topicCorrect) {
            Object.keys(stats.topicCorrect).forEach(key => {
                // يجمع النقاط إذا كان الاسم يحتوي على الكلمة المفتاحية (حل المشكلة الرمادية)
                if (key.includes(badge.topicKey) || badge.topicKey.includes(key)) {
                    currentScore += stats.topicCorrect[key];
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

    // 2. تحديد المستوى الذي يعمل عليه اللاعب حالياً
    let activeLevel = badge.levels[0]; // افتراضياً المستوى الأول
    let currentTierColor = 'locked';   
    let nextTierLabel = badge.levels[0].label;
    
    // معرفة أقصى مستوى تم الوصول إليه
    for (let i = 0; i < badge.levels.length; i++) {
        const level = badge.levels[i];
        
        if (currentScore >= level.target) {
            if (i === badge.levels.length - 1) {
                // ختم الذهبي
                activeLevel = level;
                currentTierColor = 'gold';
                nextTierLabel = 'مكتمل';
            } else {
                // انتقل للمستوى التالي
                activeLevel = badge.levels[i + 1];
                currentTierColor = level.color; // لون المستوى المنجز
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

    // 3. حساب النسبة المئوية للهدف الحالي
    let percent = Math.floor((currentScore / activeLevel.target) * 100);
    if (percent > 100) percent = 100;

    return {
        current: currentScore,
        max: activeLevel.target,
        percent: percent,
        activeLevel: activeLevel,
        tier: currentTierColor, // (bronze/silver/gold/locked)
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

// --- دالة التحقق من الأوسمة (نظام المستويات) ---
async function checkAndUnlockBadges() {
    let newUnlocks = [];
    
    badgesData.forEach(badge => {
        const progressData = getBadgeProgress(badge);
        
        // التحقق من كل مستوى
        badge.levels.forEach(level => {
            // المعرف الفريد للمستوى: badgeId_lvlX
            const uniqueLevelId = `${badge.id}_lvl${level.id}`;
            
            // الشرط: حقق الهدف + لم يستلم الجائزة سابقاً
            if (progressData.current >= level.target && !userProfile.badges.includes(uniqueLevelId)) {
                newUnlocks.push({
                    badge: badge,
                    level: level,
                    uniqueId: uniqueLevelId
                });
            }
        });
    });

    if (newUnlocks.length > 0) {
        let totalScoreAdded = 0;
        
        newUnlocks.forEach(unlock => {
            const r = unlock.level.rewards;
            userProfile.badges.push(unlock.uniqueId); // تسجيل المستوى
            
            if (r.score) { 
                userProfile.highScore += r.score; 
                totalScoreAdded += r.score;
            }
            if (r.lives) userProfile.inventory.lives = (userProfile.inventory.lives || 0) + r.lives;
            if (r.hint) userProfile.inventory.helpers.hint = (userProfile.inventory.helpers.hint || 0) + r.hint;
            if (r.fifty) userProfile.inventory.helpers.fifty = (userProfile.inventory.helpers.fifty || 0) + r.fifty;
            if (r.skip) userProfile.inventory.helpers.skip = (userProfile.inventory.helpers.skip || 0) + r.skip;
        });

        await updateDoc(doc(db, "users", effectiveUserId), {
            badges: userProfile.badges,
            highScore: userProfile.highScore,
            inventory: userProfile.inventory
        });

        const lastUnlock = newUnlocks[newUnlocks.length - 1];
        updateProfileUI();
        playSound('applause');
        
        showRewardModal(lastUnlock.badge, lastUnlock.level); 
        
        return true;
    }
    
    return false;
}

// تحديث دالة عرض نافذة الجائزة لتأخذ المستوى بعين الاعتبار
function showRewardModal(badge, level) {
    const modal = getEl('reward-modal');
    const box = getEl('reward-content-area');
    
    let rewardsHtml = '';
    if (level.rewards) {
        if (level.rewards.score) rewardsHtml += `<div class="reward-item-box"><span class="material-symbols-rounded text-amber-400 text-2xl block mb-1">monetization_on</span><span class="text-white text-xs font-bold">+${formatNumberAr(level.rewards.score)}</span></div>`;
        if (level.rewards.lives) rewardsHtml += `<div class="reward-item-box"><span class="material-symbols-rounded text-red-500 text-2xl block mb-1">favorite</span><span class="text-white text-xs font-bold">+${formatNumberAr(level.rewards.lives)}</span></div>`;
        if (level.rewards.hint) rewardsHtml += `<div class="reward-item-box"><span class="material-symbols-rounded text-yellow-400 text-2xl block mb-1">lightbulb</span><span class="text-white text-xs font-bold">+${formatNumberAr(level.rewards.hint)}</span></div>`;
        if (level.rewards.skip) rewardsHtml += `<div class="reward-item-box"><span class="material-symbols-rounded text-green-400 text-2xl block mb-1">skip_next</span><span class="text-white text-xs font-bold">+${formatNumberAr(level.rewards.skip)}</span></div>`;
    }

    // لون العنوان حسب الرتبة
    let titleColor = 'text-white';
    let levelName = level.label;
    
    if(level.color === 'bronze') { titleColor = 'text-red-500'; }
    if(level.color === 'silver') { titleColor = 'text-slate-200'; }
    if(level.color === 'gold')   { titleColor = 'text-amber-400'; }

    box.innerHTML = `
        <span class="material-symbols-rounded reward-icon-large ${titleColor}">${badge.icon}</span>
        <h3 class="text-xl font-bold text-white font-heading mb-1">إنجاز جديد!</h3>
        <p class="${titleColor} text-lg font-bold mb-2">${badge.name}</p>
        <span class="text-xs bg-slate-800 px-3 py-1 rounded-full border border-white/10 mb-4 inline-block">${levelName}</span>
        
        <p class="text-slate-400 text-sm mb-6 px-4">${badge.desc}</p>
        
        <div class="text-xs text-slate-500 mb-2">-- الجوائز --</div>
        <div class="reward-items-grid">
            ${rewardsHtml}
        </div>
    `;
    
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
