// تأكد أن السطر يشبه هذا (أضفنا onSnapshot)
import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, deleteDoc, query, where, getDocs, serverTimestamp, orderBy, limit, arrayUnion, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { 
    getAuth, 
    signInAnonymously, 
    onAuthStateChanged,
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,     
    signOut,                        
    updateProfile,                  
    GoogleAuthProvider,             
    signInWithPopup,                
    linkWithPopup,                  
    fetchSignInMethodsForEmail      
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { topicsData, staticWisdoms, infallibles, badgesData, badgesMap } from './data.js';
function getSafeEmail(username) {
    const isEnglish = /^[a-zA-Z0-9._-]+$/.test(username);
    if (isEnglish) {
        return `${username}@ahlulbayt.app`;
    } else {
        // تحويل الاسم العربي إلى كود Base64 آمن
        const safeId = btoa(unescape(encodeURIComponent(username))).replace(/[^a-zA-Z0-9]/g, '').substring(0, 15);
        return `u_${safeId}@ahlulbayt.app`;
    }
}
const firebaseConfig = { apiKey: "AIzaSyDY1FNxvECtaV_dflCzkRH4pHQi_HQ4fwA", authDomain: "all-in-b0422.firebaseapp.com", projectId: "all-in-b0422", storageBucket: "all-in-b0422.firebasestorage.app", messagingSenderId: "347315641241", appId: "1:347315641241:web:c9ed240a0a0e5d2c5031108" };
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let effectiveUserId = null;
let userProfile = null;
const initialTimerState = localStorage.getItem('timerEnabled') === 'false' ? false : true;

let quizState = { 
    questions: [], idx: 0, score: 0, correctCount: 0, active: false, 
    difficulty: 'موحد', history: [], contextTopic: '', streak: 0,
    timerEnabled: initialTimerState, usedHelpers: false, fastAnswers: 0,
    enrichmentEnabled: true,
    lives: 3
};
let helpers = { fifty: false, hint: false, skip: false };
let transitionDelay = 2000;
let isMuted = false;
let timerInterval = null;
let audioContext = null; 
let wisdomInterval = null;
let currentSelectionMode = null; 
// متغيرات المسابقة الحية
let activeEventData = null;
let eventTimerInterval = null;

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
        console.log("User session found:", user.uid);
        currentUser = user;
        effectiveUserId = user.uid;
        await loadProfile(effectiveUserId);
        
        // إذا نجح تحميل البروفايل (ليس null)، ندخله للتطبيق
        if (userProfile) {
            navToHome();
        }
    } else {
        console.log("No user session, showing login");
        hide('auth-loading');
        show('login-area');
        hide('main-header'); // إخفاء الهيدر بالكامل
        hide('side-menu'); // إخفاء القائمة الجانبية
        // إخفاء زر القائمة تحديداً للتأكد
        getEl('menu-btn').classList.add('hidden');
    }
});



async function handleLogin() {
    const u = getEl('login-username-input').value.trim();
    const p = getEl('login-password-input').value.trim();
    const err = getEl('login-error-message');

    if(!u || !p) return err.textContent = "أدخل البيانات";
    
    getEl('login-btn').disabled = true;

    try {
        // نستخدم الدالة الآمنة الجديدة
        const safeEmail = getSafeEmail(u);
        
        // 1. محاولة الدخول بالنظام الجديد
        const userCredential = await signInWithEmailAndPassword(auth, safeEmail, p);
        
        // نجح الدخول
        effectiveUserId = userCredential.user.uid;
        await loadProfile(effectiveUserId);
        navToHome();
        toast(`أهلاً بك ${u}`);

    } catch(e) { 
        // التعديل هنا: أضفنا auth/invalid-email للقائمة
        if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential' || e.code === 'auth/invalid-email') {
            console.log("Migration needed or user not found...");
            await migrateOldAccount(u, p, err);
        } else {
            console.error("Login Error:", e);
            if (e.code === 'auth/wrong-password') err.textContent = "كلمة المرور غير صحيحة";
            else if (e.code === 'auth/too-many-requests') err.textContent = "محاولات كثيرة جداً، انتظر قليلاً";
            else err.textContent = "حدث خطأ في الاتصال";
            getEl('login-btn').disabled = false; 
        }
    }
}

async function migrateOldAccount(username, password, errElement) {
    try {
        const q = query(collection(db, "users"), where("username", "==", username));
        const snap = await getDocs(q);

        if (snap.empty) {
            errElement.textContent = "اسم المستخدم غير صحيح";
            getEl('login-btn').disabled = false;
            return;
        }

        const oldDoc = snap.docs[0];
        const userData = oldDoc.data();

        if (userData.password === password) {
            toast("جاري تحديث نظام حسابك للأمان الجديد...", "info");
            
            // التعديل هنا: استخدام الإيميل الآمن بدلاً من الاسم المباشر
            const safeEmail = getSafeEmail(username);
            
            const userCredential = await createUserWithEmailAndPassword(auth, safeEmail, password);
            const newUser = userCredential.user;
            
            await updateProfile(newUser, { displayName: username });
            
            const newId = newUser.uid;
            const dataToKeep = { ...userData };
            delete dataToKeep.password; 
            
            await setDoc(doc(db, "users", newId), dataToKeep);
            await deleteDoc(doc(db, "users", oldDoc.id));
            
            effectiveUserId = newId;
            await loadProfile(effectiveUserId);
            navToHome();
            toast("تم تحديث حسابك بنجاح!");
            
        } else {
            errElement.textContent = "كلمة المرور غير صحيحة";
            getEl('login-btn').disabled = false;
        }
    } catch (migrationErr) {
        // في حال كان الحساب موجوداً مسبقاً في Auth (ربما من محاولة سابقة فاشلة)، نحاول تسجيل الدخول به
        if (migrationErr.code === 'auth/email-already-in-use') {
             try {
                const safeEmail = getSafeEmail(username);
                const userCredential = await signInWithEmailAndPassword(auth, safeEmail, password);
                effectiveUserId = userCredential.user.uid;
                await loadProfile(effectiveUserId);
                navToHome();
             } catch(loginErr) {
                 console.error(loginErr);
                 errElement.textContent = "حدث خطأ، يرجى المحاولة لاحقاً";
                 getEl('login-btn').disabled = false;
             }
        } else {
            console.error("Migration Failed:", migrationErr);
            errElement.textContent = "حدث خطأ أثناء التحديث (" + migrationErr.code + ")";
            getEl('login-btn').disabled = false;
        }
    }
}





// ==========================================
// 2. دالة إنشاء الحساب الجديدة (handleReg)
// ==========================================
async function handleReg() {
    const u = getEl('reg-username-input').value.trim();
    const p = getEl('reg-password-input').value.trim();
    const pc = getEl('reg-confirm-password-input').value.trim();
    const err = getEl('register-error-message');

    // التحقق من المدخلات
    if(!u || !p) return err.textContent = "املأ الحقول";
    if(u.length < 3) return err.textContent = "الاسم قصير جداً";
    if(p !== pc) return err.textContent = "كلمة المرور غير متطابقة";
    if(p.length < 6) return err.textContent = "كلمة المرور يجب أن تكون 6 أحرف على الأقل";

    // قفل الزر لمنع التكرار
    getEl('register-btn').disabled = true;

    try {
        // 1. التحقق من أن الاسم غير محجوز في قاعدة البيانات (لأننا نسمح بتكرار الإيميل الوهمي أحياناً لكن الاسم يجب أن يكون فريداً)
        const q = query(collection(db, "users"), where("username", "==", u));
        const snap = await getDocs(q);
        if(!snap.empty) { 
            err.textContent = "الاسم محجوز، اختر اسماً آخر"; 
            getEl('register-btn').disabled = false; 
            return; 
        }

        // 2. توليد الإيميل الآمن (يحل مشكلة auth/invalid-email)
        const safeEmail = getSafeEmail(u);

        // 3. إنشاء المستخدم في Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, safeEmail, p);
        const newUser = userCredential.user;

        // 4. تحديث اسم العرض
        await updateProfile(newUser, { displayName: u });
        effectiveUserId = newUser.uid;

        // 5. تجهيز بيانات المستخدم للحفظ في Firestore
        const data = { 
    username: u, 
    highScore: 0, 
    createdAt: serverTimestamp(), 
    avatar: 'account_circle', customAvatar: null, badges: ['beginner'], favorites: [],
    seenQuestions: [], 
    playedEvents: [], // <--- هام جداً: إضافة هذا السطر
    stats: { quizzesPlayed: 0, totalCorrect: 0, totalQuestions: 0, bestRoundScore: 0, topicCorrect: {}, lastPlayedDates: [], totalHardQuizzes: 0, noHelperQuizzesCount: 0, maxStreak: 0, fastAnswerCount: 0 }, 
    wrongQuestionsBank: []
};

        
        // حفظ الملف
        await setDoc(doc(db, "users", effectiveUserId), data);
        
        // الدخول للتطبيق
        navToHome();
        toast("تم إنشاء الحساب بنجاح");

    } catch(e) { 
        console.error("Registration Error:", e); 
        // معالجة الأخطاء
        if (e.code === 'auth/email-already-in-use') err.textContent = "الاسم محجوز مسبقاً (جرب اسماً آخر)";
        else if (e.code === 'auth/weak-password') err.textContent = "كلمة المرور ضعيفة جداً";
        else if (e.code === 'auth/invalid-email') err.textContent = "الاسم يحتوي على رموز غير مقبولة";
        else err.textContent = "حدث خطأ، حاول لاحقاً"; 
        
        getEl('register-btn').disabled = false; 
    }
}


async function loadProfile(uid) {
    try {
        const snap = await getDoc(doc(db, "users", uid));
        if(snap.exists()) {
            userProfile = snap.data();
            // التأكد من وجود المصفوفات لتجنب الأخطاء
            if(!userProfile.badges) userProfile.badges = ['beginner'];
            if(!userProfile.favorites) userProfile.favorites = [];
            if(!userProfile.stats) userProfile.stats = {};
            userProfile.stats.topicCorrect = userProfile.stats.topicCorrect || {};
            userProfile.stats.lastPlayedDates = userProfile.stats.lastPlayedDates || [];
            if(!userProfile.wrongQuestionsBank) userProfile.wrongQuestionsBank = [];
            // إصلاح المسابقة: التأكد من وجود مصفوفة الأحداث
            if(!userProfile.playedEvents) userProfile.playedEvents = [];
            
            if(userProfile.customAvatar === undefined) userProfile.customAvatar = null;
            if(!userProfile.seenQuestions) userProfile.seenQuestions = [];
        } else {
            // التغيير هنا: إذا لم يوجد ملف، لا تنشئ ضيفاً، بل سجل خروج
            console.log("No profile found for this UID, logging out...");
            await signOut(auth);
            userProfile = null;
            show('login-area');
            hide('auth-loading');
            return; 
        }
        updateProfileUI();
    } catch(e) { 
        console.error("Error loading profile:", e);
        // في حال الخطأ أيضاً نخرج المستخدم للأمان
        await signOut(auth);
    }
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
    show('main-header'); // إظهار شريط الرأس
    show('menu-btn'); // إظهار زر القائمة (الحل لمشكلة الاختفاء عند الخروج)
    stopTimer(); // إيقاف أي مؤقت قد يكون نشطاً
    
    if(wisdomInterval) clearInterval(wisdomInterval); // إيقاف مؤقت رسالة اليوم القديم
    loadAIWisdom(); // تحميل رسالة اليوم
    wisdomInterval = setInterval(loadAIWisdom, 7000); // بدء مؤقت جديد لرسالة اليوم
    
    // إعادة تعيين حالة المسابقة
    quizState.active = false;
    quizState.isEventMode = false;
    
    // إخفاء مناطق التطبيق الأخرى وعرض منطقة الترحيب
    hide('login-area'); hide('auth-loading'); hide('quiz-proper'); hide('results-area');
    show('welcome-area'); show('user-profile-container');
    
    initDropdowns(); // تهيئة قوائم اختيار القسم والموضوع
    
    // تحديث حالة زر المؤقت بناءً على حالة quizState.timerEnabled
    const toggleBtn = getEl('toggle-timer-btn');
    if(quizState.timerEnabled) {
        toggleBtn.classList.add('text-amber-400');
        toggleBtn.classList.remove('text-slate-500');
    } else {
        toggleBtn.classList.remove('text-amber-400');
        toggleBtn.classList.add('text-slate-500');
    }
    
    // تشغيل فحص رسائل المطور بعد فترة قصيرة
    setTimeout(checkWhatsNew, 1500);
}



function initDropdowns() {
    const btnCat = document.getElementById('btn-category-trigger');
    const btnTop = document.getElementById('btn-topic-trigger');
    if(btnCat) btnCat.onclick = () => openSelectionModal('category');
    if(btnTop) btnTop.onclick = () => {
        if (!btnTop.disabled) openSelectionModal('topic');
        else toast("يرجى اختيار القسم الرئيسي أولاً", "error");
    };
}

function openSelectionModal(mode) {
    currentSelectionMode = mode;
    const modal = document.getElementById('selection-modal');
    const title = document.getElementById('selection-title');
    const list = document.getElementById('selection-list-container');
    list.innerHTML = ''; 
    modal.classList.add('active'); 
    if (mode === 'category') {
        title.textContent = "اختر القسم الرئيسي";
        renderSelectionItem("عشوائي شامل", "random", list);
        Object.keys(topicsData).forEach(catKey => {
            renderSelectionItem(catKey, catKey, list);
        });
    } else if (mode === 'topic') {
        title.textContent = "اختر الموضوع الفرعي";
        const selectedCat = document.getElementById('category-select').value;
        if (selectedCat && topicsData[selectedCat]) {
            topicsData[selectedCat].forEach(topic => {
                renderSelectionItem(topic, topic, list);
            });
        }
    }
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
    quizState.difficulty = "موحد"; 
    const qs = [...userProfile.wrongQuestionsBank];
    shuffleArray(qs);
    quizState.questions = qs.slice(0, 20);
    startQuiz();
});

bind('quit-quiz-btn', 'click', () => {
    if(confirm("هل تريد الخروج من الاختبار؟ ستفقد النقاط الحالية.")) {
        navToHome();
    }
});

bind('toggle-timer-btn', 'click', () => {
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

function startQuiz() {
    hide('main-header');
    if(wisdomInterval) { clearInterval(wisdomInterval); wisdomInterval = null; }
     if (typeof quizState.isEventMode === 'undefined') quizState.isEventMode = false;
    quizState.idx = 0; quizState.score = 0; quizState.correctCount = 0; quizState.active = true; 
    quizState.history = []; quizState.streak = 0; quizState.lives = 3; 
    quizState.timerEnabled = false;
    quizState.enrichmentEnabled = true;
    helpers = { fifty: false, hint: false, skip: false };
    quizState.usedHelpers = false; 
    quizState.fastAnswers = 0; 
    hide('welcome-area'); show('quiz-proper');
    getEl('quiz-topic-display').textContent = quizState.contextTopic || 'مسابقة متنوعة';
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
    getEl('question-counter-text').textContent = `${quizState.idx+1}/${quizState.questions.length}`;
    getEl('live-score-text').textContent = quizState.score;
    const dots = getEl('progress-dots'); dots.innerHTML = '';
    for(let i=0; i<quizState.questions.length; i++) {
        let cls = "w-2 h-2 rounded-full bg-slate-700";
        if(i < quizState.idx) cls = "w-2 h-2 rounded-full bg-amber-500";
        else if(i === quizState.idx) cls = "w-2 h-2 rounded-full bg-white scale-125";
        dots.innerHTML += `<div class="${cls}"></div>`;
    }
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
        if(quizState.streak > userProfile.stats.maxStreak) { userProfile.stats.maxStreak = quizState.streak; } 
        
        // 🔥🔥 التعديل يبدأ هنا 🔥🔥
        let pointsAdded = 0;
        let multiplierText = "";

        if (quizState.isEventMode) {
            // 1. منطق نقاط المسابقة الخاصة (ثابتة بدون مضاعفات ستريك)
            pointsAdded = quizState.eventPoints;
            multiplierText = "مسابقة 🏆";
        } else {
            // 2. المنطق العادي القديم
            const basePoints = 2; 
            let multiplier = 1;
            if (quizState.streak >= 15) { multiplier = 4; multiplierText = "x4 ⚡️"; } 
            else if (quizState.streak >= 10) { multiplier = 3; multiplierText = "x3 🔥"; } 
            else if (quizState.streak >= 5) { multiplier = 2; multiplierText = "x2 🚀"; } 
            else if (quizState.streak >= 3) { multiplier = 1.5; multiplierText = "x1.5"; }
            pointsAdded = Math.floor(basePoints * multiplier);
        }
        // 🔥🔥 التعديل ينتهي هنا 🔥🔥

        quizState.score += pointsAdded; 
        quizState.correctCount++;
        // ... (باقي الكود كما هو)

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
        if(q.explanation && quizState.enrichmentEnabled && Math.random() > -1) {
            setTimeout(() => showEnrichment(q.explanation), transitionDelay);
            return; 
        }
        setTimeout(nextQuestion, transitionDelay);
    } else {
        quizState.fastAnswers = 0; 
        if(btn) { btn.classList.remove('opacity-60'); btn.classList.add('btn-incorrect'); }
        if(q.correctAnswer >= 0 && q.correctAnswer < btns.length) {
            btns[q.correctAnswer].classList.remove('opacity-60'); 
            btns[q.correctAnswer].classList.add('btn-correct');
        } 
        if (quizState.streak >= 10) { quizState.streak = 5; toast("تم تفعيل حماية الستريك! انخفض إلى 5 بدلاً من 0", "info"); } 
        else if (quizState.streak >= 5) { quizState.streak = 2; } 
        else { quizState.streak = 0; }
        
        quizState.lives--;
        renderLives();
        playSound('lose');
        getEl('quiz-proper').classList.add('shake'); setTimeout(()=>getEl('quiz-proper').classList.remove('shake'),500);
        if(qBankIdx === -1) userProfile.wrongQuestionsBank.push(q);
        
        if (quizState.lives <= 0) {
            getEl('feedback-text').textContent = "نفدت المحاولات! 💔"; 
            getEl('feedback-text').className = "text-center mt-2 font-bold h-6 text-red-500";
            setTimeout(showReviveModal, transitionDelay); 
            return; 
        } 

        getEl('feedback-text').textContent = "إجابة خاطئة (+0)"; 
        getEl('feedback-text').className = "text-center mt-2 font-bold h-6 text-red-400";
        updateStreakUI();
        quizState.history.push({ q: q.question, options: q.options, correct: q.correctAnswer, user: idx, isCorrect, topic: q.topic || quizState.contextTopic, fast: (isCorrect && answerTime <= 5000) });
        setTimeout(nextQuestion, transitionDelay);
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
    const message = `🕌 من وحي أهل البيت (ع) 🌟\n` + `لقد حصلت على ${score} نقطة في ${quizState.contextTopic}!\n` + `✅ الإجابات الصحيحة: ${correct}/${total} (${accuracy}%)\n` + `هل يمكنك تحدي رقمي؟\n` + `#مسابقة_أهل_البيت #ثقافة_شيعية`;
    if (navigator.share) {
        navigator.share({ title: 'تحدي المعرفة - من وحي أهل البيت (ع)', text: message }).then(() => toast('تمت مشاركة النتيجة بنجاح!'));
    } else {
        navigator.clipboard.writeText(message).then(() => { toast('تم نسخ النتيجة إلى الحافظة! شاركها مع أصدقائك.'); });
    }
});

async function endQuiz() {
    hide('quiz-proper'); show('results-area');
    
    // عرض البيانات في البطاقة
    getEl('card-score').textContent = quizState.score;
    getEl('card-username').textContent = userProfile.username;
    getEl('card-difficulty').textContent = quizState.difficulty;
    
    const accuracy = (quizState.correctCount / quizState.questions.length) * 100;
    const today = new Date().toISOString().slice(0, 10);
    
    getEl('card-correct-count').textContent = `✅ ${quizState.correctCount}`;
    getEl('card-wrong-count').textContent = `❌ ${quizState.questions.length - quizState.correctCount}`;
    
    // رسالة النتيجة
    let msg = "حاول مرة أخرى";
    if(accuracy === 100) { msg = "أداء أسطوري! درجة كاملة"; playSound('applause'); launchConfetti(); }
    else if(accuracy >= 80) msg = "أداء ممتاز!";
    else if(accuracy >= 50) msg = "جيد جداً";
    getEl('final-message').textContent = msg;

    // حساب الإحصائيات الجديدة
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

    // معالجة الأوسمة (Badges)
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

    // ... (شروط الأوسمة الأخرى مختصرة هنا لأنها موجودة في الكود الأصلي، تأكد من بقائها) ...
    // لقد قمت بتبسيط الكود هنا للعرض، لكن الكود الذي ستنسخه يجب أن يحتوي كل شروط الأوسمة
    // سأضع لك أهم الأسطر للتأكد من الإصلاح:

    if(newStats.quizzesPlayed >= 10 && !userProfile.badges.includes('scholar')) newBadges.push('scholar');
    // ... (باقي شروط الأوسمة كما هي في ملفك) ...
    
    // إدارة الأسئلة التي تمت رؤيتها وبنك الأخطاء
    const playedIds = quizState.questions.filter(q => q.id).map(q => q.id);
    let updatedSeenQuestions = new Set([...(userProfile.seenQuestions || []), ...playedIds]);
    let seenArray = Array.from(updatedSeenQuestions);
    if (seenArray.length > 1000) seenArray = seenArray.slice(seenArray.length - 1000);
    
    let updatedWrongQuestionsBank = userProfile.wrongQuestionsBank;
    if (updatedWrongQuestionsBank.length > 15) updatedWrongQuestionsBank = updatedWrongQuestionsBank.slice(updatedWrongQuestionsBank.length - 15);
    
    userProfile.seenQuestions = seenArray;
    userProfile.wrongQuestionsBank = updatedWrongQuestionsBank;

    // 🔥🔥 هنا الإصلاح: تعريف المتغير مرة واحدة فقط 🔥🔥
    const firestoreUpdates = {
        highScore: newHigh, stats: newStats, wrongQuestionsBank: updatedWrongQuestionsBank, 
        seenQuestions: seenArray, badges: newBadges.length > 0 ? arrayUnion(...newBadges) : userProfile.badges,
        'stats.quizzesPlayed': newStats.quizzesPlayed, 'stats.totalCorrect': newStats.totalCorrect, 'stats.totalQuestions': newStats.totalQuestions,
        'stats.bestRoundScore': newStats.bestRoundScore, 'stats.lastPlayedDates': newStats.lastPlayedDates, 'stats.totalHardQuizzes': newStats.totalHardQuizzes,
        'stats.noHelperQuizzesCount': newStats.noHelperQuizzesCount, 'stats.maxStreak': newStats.maxStreak, 'stats.fastAnswerCount': newStats.fastAnswerCount
    };

    // 🔥 تسجيل المسابقة الخاصة إذا وجدت
    if (quizState.isEventMode && quizState.eventId) {
        firestoreUpdates.playedEvents = arrayUnion(quizState.eventId);
        userProfile.playedEvents.push(quizState.eventId); 
        quizState.isEventMode = false; 
    }

    Object.keys(newStats.topicCorrect).forEach(topicKey => { firestoreUpdates[`stats.topicCorrect.${topicKey}`] = newStats.topicCorrect[topicKey]; });
    
    // حفظ واحد نهائي
    await updateDoc(doc(db, "users", effectiveUserId), firestoreUpdates);
    
    // تحديث الواجهة المحلية
    userProfile.highScore = newHigh; 
    userProfile.stats = newStats;
    if(newBadges.length > 0) { 
        userProfile.badges.push(...newBadges); 
        toast(`مبروك! حصلت على أوسمة جديدة: ${newBadges.map(b=>badgesMap[b]?.name).join(', ')}`); 
    }
    
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
        const statusIcon = h.isCorrect ? '✅' : '❌';
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
    getEl('helper-fifty-fifty').classList.toggle('opacity-50', helpers.fifty);
    getEl('helper-hint').classList.toggle('opacity-50', helpers.hint);
    getEl('helper-skip').classList.toggle('opacity-50', helpers.skip);
}

bind('helper-fifty-fifty', 'click', () => {
    if(helpers.fifty || !quizState.active) return;
    const cost = 4; 
    if(quizState.score < cost) { toast(`رصيدك غير كافٍ! تحتاج ${cost} نقطة.`, "error"); return; }
    quizState.score -= cost;
    getEl('live-score-text').textContent = quizState.score;
    helpers.fifty = true;
    quizState.usedHelpers = true; 
    const q = quizState.questions[quizState.idx];
    const opts = document.querySelectorAll('.option-btn');
    let removed = 0;
    [0,1,2,3].sort(()=>Math.random()-0.5).forEach(i => { 
        if(i !== q.correctAnswer && removed < 2) { opts[i].classList.add('option-hidden'); removed++; } 
    });
    updateHelpersUI();
    toast(`تم خصم ${cost} نقطة (50/50)`, "info");
});

bind('helper-hint', 'click', () => {
    if(helpers.hint || !quizState.active) return;
    const cost = 3;
    if(quizState.score < cost) { toast(`رصيدك غير كافٍ! تحتاج ${cost} نقطة.`, "error"); return; }
    quizState.score -= cost;
    getEl('live-score-text').textContent = quizState.score;
    helpers.hint = true;
    quizState.usedHelpers = true; 
    const q = quizState.questions[quizState.idx];
    const opts = document.querySelectorAll('.option-btn');
    let removed = 0;
    [0,1,2,3].forEach(i => { 
        if(i !== q.correctAnswer && removed < 1) { opts[i].classList.add('option-hidden'); removed++; } 
    });
    updateHelpersUI();
    toast(`تم خصم ${cost} نقطة (تلميح)`, "info");
});

bind('toggle-enrichment-btn', 'click', () => {
    quizState.enrichmentEnabled = !quizState.enrichmentEnabled;
    updateEnrichmentUI();
    
    if(quizState.enrichmentEnabled) {
        toast("تم تفعيل المعلومات الإثرائية");
    } else {
        toast("تم إيقاف المعلومات الإثرائية");
    }
});

bind('helper-skip', 'click', () => {
    if(helpers.skip || !quizState.active) return; 
    const cost = 1;
    if(quizState.score < cost) { toast(`رصيدك غير كافٍ! تحتاج ${cost} نقطة.`, "error"); return; }
    quizState.score -= cost;
    getEl('live-score-text').textContent = quizState.score;
    helpers.skip = true; 
    quizState.usedHelpers = true; 
    updateHelpersUI(); 
    toast(`تم خصم ${cost} نقطة (تخطي)`, "info");
    nextQuestion();
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
            if (r === 1) medalIcon = '<span class="text-2xl filter drop-shadow-md">🥇</span>'; 
            else if (r === 2) medalIcon = '<span class="text-2xl filter drop-shadow-md">🥈</span>';
            else if (r === 3) medalIcon = '<span class="text-2xl filter drop-shadow-md">🥉</span>';
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

const handleLogout = async () => { 
    if(confirm("هل تريد تسجيل الخروج؟")) {
        try {
            await signOut(auth); // أمر الخروج من سيرفر Firebase
            localStorage.removeItem('ahlulbaytQuiz_UserId_v2.7'); 
            location.reload(); 
        } catch(e) {
            console.error("Logout Error:", e);
            toast("حدث خطأ أثناء الخروج", "error");
        }
    }
};

// دالة جديدة كلياً لمعالجة الدخول عبر Google
async function handleGoogleLogin() {
    const provider = new GoogleAuthProvider();
    
    try {
        // 1. فتح نافذة Google المنبثقة
        const result = await signInWithPopup(auth, provider);
        const user = result.user; // بيانات المستخدم القادمة من جوجل
        
        // 2. التحقق: هل هذا المستخدم لديه ملف سابق في قاعدة بياناتنا؟
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            // --- سيناريو: مستخدم مسجل سابقاً ---
            console.log("Existing Google user found");
            effectiveUserId = user.uid;
            await loadProfile(effectiveUserId);
            navToHome();
            toast(`أهلاً بك مجدداً ${userProfile.username}`);
        } else {
            // --- سيناريو: مستخدم جديد كلياً ---
            console.log("New Google user, creating profile...");
            
            // أخذ الاسم الأول من جوجل، أو تسميته "User" إذا لم يوجد
            let baseName = user.displayName ? user.displayName.split(' ')[0] : "User";
            let finalName = baseName;
            
            // فحص سريع: هل الاسم محجوز؟ إذا نعم، نضيف له رقماً عشوائياً
            const q = query(collection(db, "users"), where("username", "==", finalName));
            const snap = await getDocs(q);
            
            if (!snap.empty) {
                // الاسم مكرر -> نضيف رقماً عشوائياً (مثال: Ali_482)
                finalName = baseName + "_" + Math.floor(1000 + Math.random() * 9000);
            }

            effectiveUserId = user.uid;
            
  const data = { 
    username: finalName, 
    highScore: 0, 
    createdAt: serverTimestamp(), 
    avatar: 'account_circle', 
    customAvatar: user.photoURL, 
    badges: ['beginner'], favorites: [],
    seenQuestions: [], 
    playedEvents: [], // <--- هام جداً: إضافة هذا السطر
    stats: { quizzesPlayed: 0, totalCorrect: 0, totalQuestions: 0, bestRoundScore: 0, topicCorrect: {}, lastPlayedDates: [], totalHardQuizzes: 0, noHelperQuizzesCount: 0, maxStreak: 0, fastAnswerCount: 0 }, 
    wrongQuestionsBank: []
};

            
            await setDoc(doc(db, "users", effectiveUserId), data);
            await loadProfile(effectiveUserId);
            navToHome();
            toast(`تم إنشاء الحساب باسم ${finalName}`);
        }
    } catch (e) {
        console.error("Google Login Error:", e);
        toast("تم إلغاء الدخول أو حدث خطأ", "error");
    }
}

// دالة لربط الحساب الحالي بحساب جوجل
async function linkGoogleAccount() {
    // 1. التحقق: هل المستخدم مسجل دخول أصلاً؟
    if (!auth.currentUser) {
        toast("يجب تسجيل الدخول أولاً", "error");
        return;
    }

    const provider = new GoogleAuthProvider();
    getEl('link-google-btn').disabled = true;

    try {
        // 2. محاولة الربط
        const result = await linkWithPopup(auth.currentUser, provider);
        
        // 3. نجاح الربط
        const user = result.user;
        
        // (اختياري) تحديث الصورة الشخصية إذا لم يكن لديه صورة
        if (!userProfile.customAvatar && user.photoURL) {
            await updateDoc(doc(db, "users", effectiveUserId), {
                customAvatar: user.photoURL
            });
            userProfile.customAvatar = user.photoURL;
            updateProfileUI();
        }

        toast("✅ تم ربط حسابك بـ Google بنجاح!");
        
        // إخفاء الزر أو تغيير نصه ليعرف المستخدم أنه انتهى
        const btn = getEl('link-google-btn');
        btn.innerHTML = `<span class="material-symbols-rounded text-green-600">check_circle</span> <span>تم الربط</span>`;
        btn.classList.add('bg-green-100', 'text-green-800');

    } catch (error) {
        console.error("Link Error:", error);
        getEl('link-google-btn').disabled = false;

        if (error.code === 'auth/credential-already-in-use') {
            // هذا الخطأ يحدث إذا كنت قد دخلت بحساب جوجل هذا سابقاً بشكل منفصل
            toast("هذا الإيميل مرتبط بحساب آخر بالفعل!", "error");
        } else {
            toast("فشل عملية الربط", "error");
        }
    }
}


bind('logout-btn', 'click', handleLogout);
bind('logout-btn-menu', 'click', handleLogout);

bind('clear-cache-btn', 'click', () => { if(confirm('هل أنت متأكد؟ سيتم تسجيل الخروج ومسح البيانات المحلية.')) { localStorage.clear(); location.reload(); } });
bind('nav-about', 'click', () => openModal('about-modal'));

// استبدل كود فتح الملف الشخصي القديم بهذا الجديد
bind('user-profile-btn', 'click', () => {
    openModal('user-modal'); 
    
    // تعبئة البيانات الأساسية
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

    // ============================================================
    // 👇 الكود الجديد: التحقق من حالة ربط جوجل وتغيير شكل الزر 👇
    // ============================================================
    const linkBtn = getEl('link-google-btn');
    // نفحص هل يوجد مزود خدمة جوجل في بيانات المستخدم الحالية
    const isLinked = auth.currentUser.providerData.some(p => p.providerId === 'google.com');

    if (isLinked) {
        // حالة: الحساب مرتبط بالفعل
        linkBtn.disabled = true; // تعطيل الضغط
        linkBtn.className = "w-full bg-green-100 border border-green-300 text-green-800 font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 cursor-default shadow-sm opacity-80";
        linkBtn.innerHTML = `<span class="material-symbols-rounded text-green-600">check_circle</span> <span>تم ربط الحساب بـ Google</span>`;
    } else {
        // حالة: الحساب غير مرتبط (إعادة الزر لحالته الطبيعية)
        linkBtn.disabled = false;
        linkBtn.className = "w-full bg-white text-slate-800 font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 hover:bg-slate-200 transition shadow-sm";
        // نعيد أيقونة جوجل الأصلية
        linkBtn.innerHTML = `
            <svg class="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            <span>ربط الحساب بـ Google</span>
        `;
    }
    // ============================================================

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

// ==========================================
//  نظام رسائل المطور (What's New) 📢
// ==========================================
async function checkWhatsNew() {
    try {
        // 1. الاتصال بقاعدة البيانات لجلب الرسالة
        const docRef = doc(db, "system", "whats_new");
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();

            // 2. التحقق مما إذا كانت الرسالة مفعلة وبها نص
            if (!data.isActive || !data.message) return;

            // 3. مقارنة التوقيت: هل هذه الرسالة جديدة بالنسبة للمستخدم؟
            // نستخدم وقت التحديث (updatedAt) كمعرف فريد للرسالة
            const serverTime = data.updatedAt ? data.updatedAt.toMillis() : 0;
            const localTime = parseInt(localStorage.getItem('last_seen_news_time') || '0');

            // إذا كان وقت الرسالة في السيرفر أحدث من الوقت المخزن محلياً
            if (serverTime > localTime) {
                // عرض الرسالة
                const contentEl = getEl('news-content');
                // تحويل فواصل الأسطر لتعمل في HTML (احتياطاً، رغم استخدام whitespace-pre-line)
                contentEl.textContent = data.message; 
                
                const modal = getEl('news-modal');
                modal.classList.add('active');

                // عند ضغط زر الإغلاق، نقوم بحفظ التوقيت الجديد حتى لا تظهر مرة أخرى
                getEl('close-news-btn').onclick = () => {
                    localStorage.setItem('last_seen_news_time', serverTime);
                    modal.classList.remove('active');
                    // تشغيل صوت بسيط عند الإغلاق
                    playSound('win'); 
                };
            }
        }
    } catch (e) {
        console.error("News fetch error:", e);
    }
}

// ربط زر جوجل بالدالة الخاصة به
bind('google-login-btn', 'click', handleGoogleLogin);
bind('link-google-btn', 'click', linkGoogleAccount);

// ==========================================
// 🚀 نظام المسابقات الحية (Live Events Logic) - محسن
// ==========================================

// 1. مراقبة وجود مسابقة نشطة
function initEventListener() {
    onSnapshot(doc(db, "system", "active_event"), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            // إصلاح 1: التأكد من تحميل البروفايل قبل معالجة الحدث
            if (userProfile) {
                handleEventUpdate(data);
            } else {
                // إعادة المحاولة بعد ثانية إذا لم يكن البروفايل جاهزاً
                setTimeout(() => handleEventUpdate(data), 1000);
            }
        } else {
            hide('event-modal');
            if (eventTimerInterval) clearInterval(eventTimerInterval);
        }
    });
}

// 2. معالجة بيانات المسابقة
function handleEventUpdate(data) {
    // حماية إضافية في حال كان البروفايل لا يزال غير موجود
    if (!userProfile) return;

    activeEventData = data;
    
    // حماية من خطأ تحويل التاريخ إذا كان الحقل فارغاً
    if (!data.endTime) return;
    
    const now = new Date();
    const endTime = data.endTime.toDate(); 

    const hasPlayed = userProfile.playedEvents && userProfile.playedEvents.includes(data.id);
    const isExpired = now >= endTime;

    // الشرط: المسابقة فعالة + لم تنتهِ + المستخدم لم يلعبها + المستخدم ليس في وسط لعبة حالياً
    if (data.isActive && !isExpired && !hasPlayed && !quizState.active) {
        showEventModal(data, endTime);
    } else {
        hide('event-modal');
        if (eventTimerInterval) clearInterval(eventTimerInterval);
    }
}

// 3. إظهار النافذة وتشغيل العداد
function showEventModal(data, endTime) {
    const modal = getEl('event-modal');
    modal.classList.add('active');
    
    getEl('event-modal-title').textContent = data.title;
    getEl('event-points-display').textContent = data.pointsPerQ;
    
    if (eventTimerInterval) clearInterval(eventTimerInterval);
    
    const updateTimer = () => {
        const now = new Date();
        const diff = endTime - now;
        
        if (diff <= 0) {
            clearInterval(eventTimerInterval);
            hide('event-modal');
            return;
        }
        
        const h = Math.floor((diff / (1000 * 60 * 60)));
        const m = Math.floor((diff / (1000 * 60)) % 60);
        const s = Math.floor((diff / 1000) % 60);
        
        getEl('timer-hours').textContent = h < 10 ? '0'+h : h;
        getEl('timer-minutes').textContent = m < 10 ? '0'+m : m;
        getEl('timer-seconds').textContent = s < 10 ? '0'+s : s;
    };
    
    updateTimer();
    eventTimerInterval = setInterval(updateTimer, 1000);
}

// 4. زر الدخول للمسابقة
bind('btn-enter-event', 'click', () => {
    if (!activeEventData) return;
    
    quizState.difficulty = 'مسابقة خاصة';
    quizState.contextTopic = activeEventData.title;
    
    // نسخ الأسئلة لعدم التعديل على الأصل
    const eventQs = [...activeEventData.questions];
    shuffleArray(eventQs);
    quizState.questions = eventQs;
    
    quizState.isEventMode = true;
    quizState.eventId = activeEventData.id;
    
    // إصلاح 2: تحويل النقاط إلى رقم لضمان الجمع الصحيح
    quizState.eventPoints = parseInt(activeEventData.pointsPerQ) || 10; 
    
    hide('event-modal');
    if (eventTimerInterval) clearInterval(eventTimerInterval);
    
    startQuiz(); 
    toast("حظاً موفقاً! ركز جيداً 🚀");
});

// إصلاح 3: إيقاف المؤقت عند الإغلاق اليدوي لتوفير الذاكرة
bind('btn-close-event', 'click', () => {
    hide('event-modal');
    if (eventTimerInterval) clearInterval(eventTimerInterval);
});

// تشغيل المستمع
initEventListener();
