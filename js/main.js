import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, query, where, getDocs, serverTimestamp, orderBy, limit, arrayUnion, increment, enableIndexedDbPersistence, deleteField } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getDatabase, ref, set, onDisconnect, onValue, serverTimestamp as rtdbTimestamp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";
import { audioLibrary, AUDIO_BASE_URL } from './DataMp3.js';
import { pdfLibrary, PDF_BASE_URL } from './DataPdf.js';
import { topicsData, infallibles, badgesData, badgesMap, sectionFilesMap } from './data.js';
import { renderAchievementsView } from './achievements.js';
import SmartAudioPlayer from './audio-player.js';
import RewardsManager, { REWARDS, QUIZ_CONFIG, SHOP_PRICES, HELPER_COSTS, REVIVE_PRICES, FRAMES_DATA } from './rewards-manager.js';
import SmartPdfViewer from './pdf-viewer.js';
try {
    localStorage.removeItem('ai_api_key');
    localStorage.removeItem('ai_model');
} catch (e) {
}
window.normalizeTextForMatch = normalizeTextForMatch;
// تنسيق النص للمقارنة - غير المنطق هنا لتغيير طريقة معالجة النصوص العربية
function normalizeTextForMatch(text) {
    if (!text) return "";    
    return text
        .replace(/\([^\)]*\)/g, "") 
        .replace(/(آ|إ|أ)/g, "ا")
        .replace(/ة/g, "ه")
        .replace(/ى/g, "ي")
        .replace(/ؤ/g, "و")
        .replace(/ئ/g, "ي")        
        .replace(/[\u064B-\u065F]/g, "")        
        .replace(/[^\u0621-\u064A]/g, ""); 
}
// البحث عن معرف المحتوى - غير الكود هنا لتغيير طريقة مطابقة العناوين
function findContentId(selectedTopic, library) {
    if (!selectedTopic || !library) return null;
    if (!isNaN(selectedTopic) && parseInt(selectedTopic) > 0) {
        return parseInt(selectedTopic);
    }
    if (library[selectedTopic]) return library[selectedTopic];
    const userSkeleton = normalizeTextForMatch(selectedTopic);
    for (const [key, id] of Object.entries(library)) {
        const librarySkeleton = normalizeTextForMatch(key);
        if (librarySkeleton === userSkeleton) {
            console.log(`✅ تم التطابق (هيكل): [${selectedTopic}] == [${key}]`);
            return id;
        }
        if (librarySkeleton.length > 3 && userSkeleton.length > 3) {
            if (librarySkeleton.includes(userSkeleton) || userSkeleton.includes(librarySkeleton)) {
                console.log(`✅ تم التطابق (احتواء): [${selectedTopic}] <-> [${key}]`);
                return id;
            }
        }
    }
    console.warn(`❌ لم يتم العثور على محتوى. الهيكل المطلوب: [${userSkeleton}]`);
    return null;
}
window.rewardsManager = new RewardsManager(async (rewardData) => {
    if (!effectiveUserId) return;
    try {
        const updates = {
            score: increment(rewardData.points)
        };
        if (rewardData.statKey) {
            updates[rewardData.statKey] = increment(1);
        }
        await updateDoc(doc(db, "users", effectiveUserId), updates);
        if (window.toast) toast(rewardData.msg, "success");
        if (typeof updateProfileUI === 'function') updateProfileUI();
    } catch (e) {
        console.error("فشل عملية المكافأة:", e);
    }
});
window.audioPlayer = new SmartAudioPlayer(() => {
window.rewardsManager.trigger('AUDIO_LISTEN');});
let currentLearnAudioId = null;
let currentLearnPdfId = null;
let currentLearnTopic = "";
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
const pdfViewer = new SmartPdfViewer(db, () => effectiveUserId);
const rtdb = getDatabase(app); 
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        console.log('Persistence failed: Multiple tabs open');
    } else if (err.code == 'unimplemented') {
        console.log('Persistence is not available');
    }
});
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
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        const savedId = localStorage.getItem('ahlulbaytQuiz_UserId_v2.7');
        if (savedId) {
            effectiveUserId = savedId;
            await loadProfile(effectiveUserId);
             setupPresenceSystem(); 
            hide('auth-loading');
            hide('login-area');
            navToHome();
        } else {
            hide('auth-loading');
            show('login-area');
            show('login-view');
        }
    } else {
        signInAnonymously(auth).catch((error) => {
            console.error("Anonymous auth failed", error);
            getEl('auth-loading').innerHTML = `<p class="text-red-500">فشل الاتصال بالسيرفر. تأكد من الإنترنت.</p>`;
        });
    }
});
const framesData = FRAMES_DATA;
// نظام التواجد (أونلاين) - غير الإعدادات هنا للتحكم في حالة المستخدم
function setupPresenceSystem() {
    if (!currentUser || !effectiveUserId) return;
    const statusRef = ref(rtdb, `status/${effectiveUserId}`);
    const isOnlineRef = ref(rtdb, '.info/connected');
    onValue(isOnlineRef, (snapshot) => {
        if (snapshot.val() === false) {
            return;
        }
        onDisconnect(statusRef).set({
            state: 'offline',
            last_changed: rtdbTimestamp(),
            username: userProfile.username
        }).then(() => {
            set(statusRef, {
                state: 'online',
                last_changed: rtdbTimestamp(),
                username: userProfile.username
            });
        });
    });
}
// جلب عنصر - دالة مساعدة للوصول لعناصر HTML بواسطة ID
const getEl = (id) => document.getElementById(id);
// إظهار عنصر - دالة مساعدة لإظهار العناصر المخفية
const show = (id) => getEl(id)?.classList.remove('hidden');
// إخفاء عنصر - دالة مساعدة لإخفاء العناصر من الواجهة
const hide = (id) => getEl(id)?.classList.add('hidden');
// إظهار التنبيهات - غير الألوان أو المدة هنا لتغيير شكل رسائل النجاح والخطأ
const toast = (msg, type='success') => { const t=getEl('toast-notification'); t.textContent=msg; t.className = type==='error'?'bg-red-900 border-red-500':'bg-green-900 border-green-500'; t.classList.add('show'); t.classList.remove('hidden'); setTimeout(()=>{t.classList.remove('show');t.classList.add('hidden')},5000); };
// إنشاء صوت - غير التردد أو النوع هنا لتغيير نغمات التطبيق
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
// فتح نافذة المهام - غير هنا لتغيير شكل أو محتوى نافذة المهام
function openQuestModal() {
    const modal = document.getElementById('quest-modal');
    modal.classList.remove('quest-hidden');
    setTimeout(() => {
        modal.classList.add('active');
    }, 10);
    renderQuestList();
}
// التحكم في وظيفة closeQuestModal - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function closeQuestModal() {
    const modal = document.getElementById('quest-modal');
    modal.classList.remove('active');
    setTimeout(() => {
        modal.classList.add('quest-hidden');
    }, 300);
}
// التحكم في وظيفة executeQuestAction - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
async function executeQuestAction(taskId) {
    closeQuestModal();
    switch(taskId) {
        case 1: // المعصومين
            if(document.getElementById('category-select')) {
                const catKey = "المعصومون (عليهم السلام)"; 
                document.getElementById('category-select').value = catKey;
                let subTopics = [];
                if (typeof topicsData !== 'undefined' && topicsData[catKey]) {
                    subTopics = topicsData[catKey];
                }
                if (subTopics.length > 0) {
                    const randomTopic = subTopics[Math.floor(Math.random() * subTopics.length)];
                    document.getElementById('topic-select').value = randomTopic;
                    const txtTop = document.getElementById('txt-topic-display');
                    if(txtTop) txtTop.textContent = randomTopic;
                } else {
                    document.getElementById('topic-select').value = ''; 
                }
                const txtCat = document.getElementById('txt-category-display');
                if(txtCat) txtCat.textContent = "المعصومين (ع)";
                const startBtn = document.getElementById('ai-generate-btn');
                if(startBtn) startBtn.click();
            }
            break;
        case 4: // المهدوية
            if(document.getElementById('category-select')) {
                const catKey = "الثقافة المهدوية";
                document.getElementById('category-select').value = catKey;
                let subTopics = [];
                if (typeof topicsData !== 'undefined' && topicsData[catKey]) {
                    subTopics = topicsData[catKey];
                }
                if (subTopics.length > 0) {
                    const randomTopic = subTopics[Math.floor(Math.random() * subTopics.length)];
                    document.getElementById('topic-select').value = randomTopic;
                    const txtTop = document.getElementById('txt-topic-display');
                    if(txtTop) txtTop.textContent = randomTopic;
                } else {
                    document.getElementById('topic-select').value = '';
                }
                const txtCat = document.getElementById('txt-category-display');
                if(txtCat) txtCat.textContent = "الثقافة المهدوية";
                const startBtn = document.getElementById('ai-generate-btn');
                if(startBtn) startBtn.click();
            }
            break;
        case 2: // المساعدات -> عشوائي شامل
            if(document.getElementById('category-select')) {
                document.getElementById('category-select').value = 'random';
                document.getElementById('topic-select').value = ''; 
                const txtCat = document.getElementById('txt-category-display');
                if(txtCat) txtCat.textContent = "عشوائي شامل";
                const txtTop = document.getElementById('txt-topic-display');
                if(txtTop) txtTop.textContent = "-- اختر الموضوع --"; 
                const startBtn = document.getElementById('ai-generate-btn');
                if(startBtn) startBtn.click();
            }
            break;
        case 3: // الماراثون
            const marathonBtn = document.getElementById('btn-marathon-start');
            if(marathonBtn && !marathonBtn.disabled) {
                marathonBtn.click();
            } else {
                toast("ماراثون النور غير متاح حالياً", "info");
            }
            break;
        case 5: // المتجر
            openBag();
            setTimeout(() => {
                const shopTab = document.getElementById('tab-shop');
                if(shopTab) switchBagTab('shop');
            }, 100);
            break;
        default:
            toast("انتقل للقسم المخصص لإنجاز المهمة");
    }
}
// التحكم في وظيفة renderQuestList - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function renderQuestList() {
    const listContainer = document.getElementById('quest-list-container');
    if (!listContainer) return;
    listContainer.innerHTML = '';
    listContainer.className = 'flex flex-col gap-1 py-1'; 
    if (!userProfile.dailyQuests || !userProfile.dailyQuests.tasks) return;
    const template = document.getElementById('quest-item-template');
    let allCompleted = true;
    userProfile.dailyQuests.tasks.forEach(task => {
        const isCompleted = task.current >= task.target;
        if (!isCompleted) allCompleted = false;
        const clone = template.content.cloneNode(true);
        const rootItem = clone.querySelector('.quest-item');
        const descEl = clone.querySelector('.quest-desc');
        const progressTextEl = clone.querySelector('.quest-progress-text');
        const progressBar = clone.querySelector('.quest-progress-bar');
        const actionContainer = clone.querySelector('.quest-action');
        const iconEl = clone.querySelector('.quest-icon');
        descEl.textContent = task.desc;
        progressTextEl.textContent = `${task.current}/${task.target}`;
        const percent = Math.min(100, (task.current / task.target) * 100);
        let colorClass = 'liquid-red';
        if (percent >= 100) colorClass = 'liquid-green';
        else if (percent >= 60) colorClass = 'liquid-cyan';
        else if (percent >= 30) colorClass = 'liquid-gold';
        progressBar.className = `quest-progress-bar liquid-fill ${colorClass}`;
        if(task.id===1) iconEl.textContent='mosque';
        else if(task.id===2) iconEl.textContent='lightbulb';
        else if(task.id===3) iconEl.textContent='local_fire_department';
        else if(task.id===4) iconEl.textContent='history_edu';
        else if(task.id===5) iconEl.textContent='shopping_bag';
        if (task.claimed) {
            actionContainer.innerHTML = `<div class="flex flex-col items-center leading-none"><span class="material-symbols-rounded text-green-500 text-lg mb-0.5 shadow-green-500/50 drop-shadow-lg">check_circle</span><span class="text-[8px] text-green-400 font-bold">منجز</span></div>`;
            progressBar.style.width = '100%';
            rootItem.classList.add('opacity-60', 'grayscale-[0.5]');
        } else if (isCompleted) {
            actionContainer.innerHTML = `
                <button class="w-8 h-8 rounded-full bg-amber-400 hover:bg-amber-300 text-black shadow-[0_0_10px_rgba(251,191,36,0.6)] flex items-center justify-center animate-bounce"
                    onclick="event.stopPropagation(); claimSingleReward(${task.id})">
                    <span class="material-symbols-rounded text-lg">redeem</span>
                </button>`;
            setTimeout(() => { progressBar.style.width = '100%'; }, 50);
        } else {
            rootItem.onclick = (e) => { if(e.target.tagName !== 'BUTTON') executeQuestAction(task.id); };
            actionContainer.innerHTML = `
    <span class="material-symbols-rounded text-lg bg-gradient-to-t from-cyan-400 to-blue-500 bg-clip-text text-transparent animate-pulse group-hover:-translate-x-1 transition-all duration-300">
        chevron_left
    </span>`;
            setTimeout(() => { progressBar.style.width = `${percent}%`; }, 100);
        }
        listContainer.appendChild(clone);
    });
    const grandPrizeArea = document.getElementById('grand-prize-area');
    if (grandPrizeArea) {
        if (allCompleted && !userProfile.dailyQuests.grandPrizeClaimed) grandPrizeArea.classList.remove('hidden');
        else grandPrizeArea.classList.add('hidden');
    }
}
document.addEventListener('DOMContentLoaded', () => {
    const openBtn = document.getElementById('btn-open-quests');
    const closeBtn = document.getElementById('close-quest-btn');
    const grandBtn = document.getElementById('claim-grand-prize-btn');
    if(openBtn) openBtn.addEventListener('click', openQuestModal);
    if(closeBtn) closeBtn.addEventListener('click', closeQuestModal);
    if(grandBtn) grandBtn.addEventListener('click', claimGrandPrize);
});
// التحكم في وظيفة claimSingleReward - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
async function claimSingleReward(taskId) {
    const task = userProfile.dailyQuests.tasks.find(t => t.id === taskId);
    if (!task) return;
    if (task.current < task.target) {
        toast("المهمة لم تكتمل بعد!", "error");
        return;
    }
    if (task.claimed) {
        toast("تم استلام هذه الجائزة مسبقاً", "info");
        return;
    }
    const REWARD_AMOUNT = 100;
    task.claimed = true;
    userProfile.highScore += REWARD_AMOUNT;
    try {
        await updateDoc(doc(db, "users", effectiveUserId), {
            "dailyQuests.tasks": userProfile.dailyQuests.tasks,
            highScore: userProfile.highScore
        });
        playSound('monetization_on');
        toast(`🎉 تم استلام ${REWARD_AMOUNT} نقطة!`);
        renderQuestList();
        updateProfileUI();
    } catch (e) {
        console.error("Reward Claim Error", e);
        toast("خطأ في الاتصال، حاول مجدداً", "error");
        task.claimed = false;
        userProfile.highScore -= REWARD_AMOUNT;
    }
}
// التحكم في وظيفة claimGrandPrize - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
async function claimGrandPrize() {
    const allDone = userProfile.dailyQuests.tasks.every(t => t.current >= t.target);
    if (!allDone) {
        toast("يجب إكمال جميع المهام أولاً!", "error");
        return;
    }
    if (userProfile.dailyQuests.grandPrizeClaimed) {
        toast("لقد استلمت الجائزة الكبرى لهذا اليوم!", "info");
        return;
    }
    const BONUS_CORRECT = 100;
    const BONUS_LIVES = 3;
    const BONUS_HINT = 5;
    const wKey = getCurrentWeekKey();
    let wStats = userProfile.weeklyStats || { key: wKey, correct: 0 };
    if (wStats.key !== wKey) wStats = { key: wKey, correct: 0 };
    wStats.correct += BONUS_CORRECT;
    const mKey = getCurrentMonthKey();
    let mStats = userProfile.monthlyStats || { key: mKey, correct: 0 };
    if (mStats.key !== mKey) mStats = { key: mKey, correct: 0 };
    mStats.correct += BONUS_CORRECT;
    userProfile.dailyQuests.grandPrizeClaimed = true;
    userProfile.stats.totalCorrect = (userProfile.stats.totalCorrect || 0) + BONUS_CORRECT;
    userProfile.weeklyStats = wStats;
    userProfile.monthlyStats = mStats;
    userProfile.inventory.lives += BONUS_LIVES;
    userProfile.inventory.helpers.hint += BONUS_HINT;
    try {
        await updateDoc(doc(db, "users", effectiveUserId), {
            "dailyQuests.grandPrizeClaimed": true,
            "stats.totalCorrect": increment(BONUS_CORRECT),
            weeklyStats: wStats,
            monthlyStats: mStats,
            "inventory.lives": userProfile.inventory.lives,
            "inventory.helpers.hint": userProfile.inventory.helpers.hint
        });
        launchConfetti();
        playSound('applause');
        launchConfetti();
        playSound('applause');
        const rewardDetails = `تم إضافة: ${BONUS_CORRECT} إجابة صحيحة، ${BONUS_LIVES} قلوب، و ${BONUS_HINT} تلميح لرصيدك!`;
        toast(` ${rewardDetails}`, "success");
        addLocalNotification('مكافئة اكمال المهام اليومية✨ ', rewardDetails, 'military_tech');
        renderQuestList();
        updateProfileUI();
    } catch (e) {
        console.error("Grand Prize Error", e);
        toast("خطأ في استلام الجائزة", "error");
        userProfile.dailyQuests.grandPrizeClaimed = false;
        userProfile.stats.totalCorrect -= BONUS_CORRECT;
    }
}
// التحكم في وظيفة updateEnrichmentUI - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
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
// التحكم في وظيفة playSound - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function playSound(type) { 
    if(isMuted) return; 
    try{ 
        if(type==='win') createOscillator(523, 'sine', 0.1, 0.4); 
        else if(type==='lose') createOscillator(130, 'triangle', 0.2, 0.3); 
        else if(type==='applause') { createOscillator(600, 'square', 0.05, 0.2); createOscillator(800, 'sawtooth', 0.08, 0.2); }
        else if(type==='streak') createOscillator(261, 'sine', 0.15, 0.5); 
    }catch(e){ isMuted = true; getEl('mute-toggle').checked = false; }
}
// التحكم في وظيفة handleLogin - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
async function handleLogin(){
    const u=getEl('login-username-input').value.trim();
    const p=getEl('login-password-input').value.trim();
    const err=getEl('login-error-message');
    const btn=getEl('login-btn');
    if(!u||!p)return err.textContent="أدخل البيانات";
    const oldHtml=btn.innerHTML;
    btn.disabled=true;
    btn.innerHTML='<span class="material-symbols-rounded animate-spin">settings</span> جاري التحقق...';
    try{
        const q=query(collection(db,"users"),where("username","==",u));
        const snap=await getDocs(q);
        if(snap.empty)throw new Error("مستخدم غير موجود");
        const d=snap.docs[0];
        if(d.data().password===p){
            effectiveUserId=d.id;
            localStorage.setItem('ahlulbaytQuiz_UserId_v2.7',effectiveUserId);
            await loadProfile(effectiveUserId);
            setupPresenceSystem();
            navToHome();
            toast(`أهلاً بك ${u}`);
        }else{
            throw new Error("كلمة المرور خطأ");
        }
    }catch(e){
        err.textContent=e.message||"خطأ اتصال";
        btn.disabled=false;
        btn.innerHTML=oldHtml;
    }
}
// التحكم في وظيفة handleReg - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
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
         setupPresenceSystem();
        navToHome();
        toast("تم إنشاء الحساب");
    } catch(e) { console.error(e); err.textContent = "خطأ"; getEl('register-btn').disabled = false; }
}
// التحكم في وظيفة fetchSystemCounts - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
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
// التحكم في وظيفة updateQuestProgress - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function updateQuestProgress(questId, amount = 1) {
    if (!userProfile.dailyQuests || !userProfile.dailyQuests.tasks) return;
    const taskIndex = userProfile.dailyQuests.tasks.findIndex(t => t.id === questId);
    if (taskIndex === -1) return;
    const task = userProfile.dailyQuests.tasks[taskIndex];
    if (task.current >= task.target) return;
    task.current += amount;
    if (task.current > task.target) task.current = task.target;
    if (effectiveUserId) {
        updateDoc(doc(db, "users", effectiveUserId), { 
            dailyQuests: userProfile.dailyQuests 
        }).catch(err => console.log("Quest Update Error", err));
    }
    updateProfileUI(); 
}
// التحكم في وظيفة initDailyQuests - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function initDailyQuests() {
    const today = new Date().toLocaleDateString('en-CA');
    if (!userProfile.dailyQuests || userProfile.dailyQuests.date !== today) {
        userProfile.dailyQuests = {
            date: today,
            grandPrizeClaimed: false,
            tasks: [
                { id: 1, current: 0, target: 50, claimed: false, desc: "حل 50 سؤال في قسم المعصومين" },
                { id: 2, current: 0, target: 5, claimed: false, desc: "استخدم 5 وسائل مساعدة" },
                { id: 3, current: 0, target: 10, claimed: false, desc: "أكمل 10 أسئلة في تحدي النور" },
                { id: 4, current: 0, target: 20, claimed: false, desc: "حل 20 سؤال عن الثقافة المهدوية" },
                { id: 5, current: 0, target: 1, claimed: false, desc: "اشترِ أي عنصر من المتجر" }
            ]
        };
        if(effectiveUserId) {
            updateDoc(doc(db, "users", effectiveUserId), { dailyQuests: userProfile.dailyQuests })
            .catch(err => console.log("Quest Init Error", err));
        }
    }
}
// تحميل ملف المستخدم - غير هنا لتغيير البيانات التي يتم جلبها عند الدخول
async function loadProfile(uid) {
    try {
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
        initDailyQuests();
        updateProfileUI();
    } catch(e) { console.error("Error loading profile:", e); }
}
// التحكم في وظيفة getAvatarHTML - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function getAvatarHTML(imgUrl, frameId, sizeClass = "w-10 h-10") {
    const frameObj = framesData.find(f => f.id === frameId) || framesData[0];
    const frameClass = frameObj.cssClass;
    let imgContent;
    if (imgUrl) {
        imgContent = `<img src="${imgUrl}" class="w-full h-full object-cover rounded-full">`;
    } else {
        imgContent = `<div class="w-full h-full rounded-full bg-slate-900 flex items-center justify-center border border-slate-600"><span class="material-symbols-rounded text-slate-200" style="font-size: 1.2em;">account_circle</span></div>`;
    }
    return `
        <div class="avatar-wrapper ${sizeClass}">
            ${imgContent}
            <div class="avatar-frame-overlay ${frameClass}"></div>
        </div>
    `;
}
// تحديث واجهة الملف الشخصي - غير هنا لتغيير العناصر المعروضة في البروفايل
function updateProfileUI() {
    const nameEl = getEl('username-display');
    if (nameEl) nameEl.textContent = userProfile.username;
    const scoreEl = getEl('header-score');
    if (scoreEl) {
        const currentDisplayed = parseInt(scoreEl.textContent.replace(/[^\d]/g, '').replace(/[\u0660-\u0669]/g, d => "0123456789"[d.charCodeAt(0) - 1632])) || 0;
        const targetScore = userProfile.highScore || 0;
        if(currentDisplayed !== targetScore) {
            animateValue(scoreEl, currentDisplayed, targetScore, 2000);
        } else {
            scoreEl.textContent = formatNumberAr(targetScore, true);
        }
    }
    const btn = getEl('user-profile-btn');
    if (btn) {
        btn.innerHTML = ''; 
        const currentFrame = userProfile.equippedFrame || 'default';
        const avatarHtml = getAvatarHTML(userProfile.customAvatar, currentFrame, "w-full h-full");
        btn.innerHTML = avatarHtml;
    }
    if(userProfile.wrongQuestionsBank && userProfile.wrongQuestionsBank.length > 0) {
        show('review-mistakes-btn');
        const reviewText = getEl('review-mistakes-text');
        if(reviewText) reviewText.textContent = `مراجعة أخطائي (${userProfile.wrongQuestionsBank.length})`;
    } else {
        hide('review-mistakes-btn');
    }
    const questContainer = document.getElementById('daily-quest-container');
    const questBadge = document.getElementById('quest-notification-badge');
    if (questContainer && userProfile.dailyQuests) {
        if (!userProfile.dailyQuests.grandPrizeClaimed) {
            questContainer.classList.remove('hidden');
            const remainingTasks = userProfile.dailyQuests.tasks.filter(t => t.current < t.target).length;
            if (remainingTasks > 0) {
                questBadge.style.display = 'flex';
                questBadge.textContent = remainingTasks;
                questBadge.classList.add('pulse-red');
            } else {
                questBadge.style.display = 'flex';
                questBadge.textContent = "🎁";
                questBadge.classList.add('pulse-red');
            }
        } else {
            questContainer.classList.add('hidden');
        }
    }
}
// الانتقال للرئيسية - غير هنا لتغيير الصفحة التي يراها المستخدم أولاً
function navToHome() {
    manageAudioSystem('stop_quiz');
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
    show('bottom-nav');
    quizState.active = false;
    hide('login-area'); hide('auth-loading'); hide('quiz-proper'); hide('results-area');
    hide('achievements-view'); hide('leaderboard-view');
    show('welcome-area');
    initDropdowns();
    setTimeout(checkWhatsNew, 1500); 
    checkMarathonStatus();
    checkAndShowDailyReward(); 
}
// التحكم في وظيفة openSelectionModal - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
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
    }
}
// التحكم في وظيفة initDropdowns - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
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
// التحكم في وظيفة renderSelectionItem - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function renderSelectionItem(text,value,container){const tpl=document.getElementById('selection-item-template');const clone=tpl.content.cloneNode(true);const div=clone.querySelector('.selection-item');const txtEl=clone.querySelector('.item-text');const verIcon=clone.querySelector('.verified-icon');const progSec=clone.querySelector('.progress-section');const progTxt=clone.querySelector('.progress-text');const progBar=clone.querySelector('.progress-bar');const shine=clone.querySelector('.shine-effect');txtEl.textContent=text;div.onclick=()=>handleSelection(text,value);if(currentSelectionMode==='category'||currentSelectionMode==='topic'){let current=0,max=0;if(currentSelectionMode==='topic'){current=(userProfile.stats&&userProfile.stats.topicCorrect&&userProfile.stats.topicCorrect[text])||0;max=(dbTopicCounts&&dbTopicCounts[text])||0}else if(currentSelectionMode==='category'&&value!=='random'){const sub=topicsData[text]||[];let realTotal=0;sub.forEach(s=>{realTotal+=((dbTopicCounts&&dbTopicCounts[s])||0);current+=((userProfile.stats&&userProfile.stats.topicCorrect&&userProfile.stats.topicCorrect[s])||0)});max=realTotal}if(value!=='random'&&max>0){progSec.classList.remove('hidden');const pct=Math.min(100,Math.floor((current/max)*100));progTxt.textContent=`${formatNumberAr(max)} / ${formatNumberAr(current)}`;progBar.style.width=`${pct}%`;if(pct>=100){progBar.classList.remove('bg-amber-500');progBar.classList.add('bg-green-500','shadow-[0_0_5px_rgba(34,197,94,0.5)]');progTxt.classList.remove('text-amber-500');progTxt.classList.add('text-green-400','font-bold');verIcon.classList.remove('hidden');shine.classList.remove('hidden')}else if(pct<30){progBar.classList.remove('bg-amber-500');progBar.classList.add('bg-slate-600')}}}container.appendChild(clone)}
// التحكم في وظيفة handleSelection - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
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
// التحكم في وظيفة handleImageUpload - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
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
            ctx.drawImage(img, 0, 0, width, height);
            let dataUrl = canvas.toDataURL('image/webp', 0.3);
            if (dataUrl.indexOf('image/webp') === -1) {
                dataUrl = canvas.toDataURL('image/jpeg', 0.3);
            }
            getEl('profile-img-preview').src = dataUrl;
            show('profile-img-preview');
            hide('profile-icon-preview');
            show('delete-custom-avatar');
            userProfile.tempCustomAvatar = dataUrl; 
            console.log(`New size: ${Math.round(dataUrl.length / 1024)} KB`);
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}
    const cat = getEl('category-select').value;
    const count = parseInt(getEl('ai-question-count').value);
    const topicValue = getEl('topic-select').value;
    let topic = cat === 'random' || !cat ? "عام" : (topicValue || cat);
    quizState.difficulty = 'موحد';
    quizState.mode = 'standard';
    quizState.contextTopic = topic;
let sealTimerInterval = null;
// التحكم في وظيفة handleSealedTopic - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
async function handleSealedTopic(topicName, allTopicQuestions) {
    const modal = document.getElementById('unlock-modal');
    if (!modal) return;
    const timerText = document.getElementById('unlock-timer');
    const payBtn = document.getElementById('btn-pay-unlock');
    if (sealTimerInterval) clearInterval(sealTimerInterval);
    payBtn.innerHTML = `
        <span class="flex items-center gap-2">
            <span class="material-symbols-rounded">key</span> فتح الآن
        </span>
        <span class="bg-black/20 px-3 py-1 rounded text-xs flex items-center gap-1">
            10,000 <span class="material-symbols-rounded text-[10px]">monetization_on</span>
        </span>
    `;
    modal.classList.remove('hidden');
    if (!userProfile.sealedTopics) userProfile.sealedTopics = {};
    let sealedTimestamp = userProfile.sealedTopics[topicName];
    const now = Date.now();
    const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
    if (!sealedTimestamp) {
        sealedTimestamp = now;
        userProfile.sealedTopics[topicName] = sealedTimestamp;
        updateDoc(doc(db, "users", effectiveUserId), {
            [`sealedTopics.${topicName}`]: sealedTimestamp
        }).catch(console.error);
    }
// التحكم في وظيفة pad - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
    const pad = (num) => num.toString().padStart(2, '0');
// التحكم في وظيفة updateCountdown - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
    const updateCountdown = async () => {
        const currentTime = Date.now();
        const timePassed = currentTime - sealedTimestamp;
        const timeLeft = TWO_WEEKS_MS - timePassed;
        if (timeLeft <= 0) {
            clearInterval(sealTimerInterval);
            timerText.textContent = "00:00:00:00";
            await unlockTopicLogic(topicName, allTopicQuestions, 0); 
            modal.classList.remove('active');
            setTimeout(() => modal.classList.add('hidden'), 300);
            return;
        }
        const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
        const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
        timerText.textContent = `${pad(days)}:${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
        timerText.style.direction = "ltr"; 
    };
    updateCountdown();
    sealTimerInterval = setInterval(updateCountdown, 1000);
    payBtn.onclick = () => {
        if (userProfile.highScore >= 10000) {
            modal.classList.remove('active');
            setTimeout(() => modal.classList.add('hidden'), 300);
            clearInterval(sealTimerInterval);
            window.showConfirm(
                "فك الختم",
                "هل تريد دفع 10,000 نقطة لإعادة فتح هذا الملف الآن؟",
                "lock_open",
                async () => {
                    await unlockTopicLogic(topicName, allTopicQuestions, SHOP_PRICES.UNLOCK_TOPIC);
                }
            );
        } else {
            toast("رصيدك غير كافٍ (تحتاج 10,000 نقطة)", "error");
            if(window.playSound) window.playSound('lose');
        }
    };
    const closeBtn = modal.querySelectorAll('button')[1]; 
    if (closeBtn) {
        closeBtn.onclick = () => {
            clearInterval(sealTimerInterval);
            modal.classList.remove('active');
            setTimeout(() => modal.classList.add('hidden'), 300);
        };
    }
    setTimeout(() => {
        modal.classList.add('active');
    }, 10);
    if(window.playSound) window.playSound('hint');
}
// التحكم في وظيفة unlockTopicLogic - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
async function unlockTopicLogic(topicName, allTopicQuestions, cost) {
    if (cost > 0) {
        userProfile.highScore -= cost;
    }
    const topicIds = allTopicQuestions.map(q => q.id);
    userProfile.seenQuestions = userProfile.seenQuestions.filter(id => !topicIds.includes(id));
    if (userProfile.sealedTopics) {
        delete userProfile.sealedTopics[topicName];
    }
    try {
        await updateDoc(doc(db, "users", effectiveUserId), {
            highScore: userProfile.highScore,
            seenQuestions: userProfile.seenQuestions,
            [`sealedTopics.${topicName}`]: deleteField()
        });
        updateProfileUI();
        if (cost > 0) {
            toast(`🔓 تم فتح "${topicName}" بنجاح!`, "success");
            if(window.playSound) window.playSound('win');
            document.getElementById('ai-generate-btn').click(); 
        } else {
            toast(`⏳ انتهت فترة الانتظار! تم فتح "${topicName}" مجاناً.`, "success");
            document.getElementById('ai-generate-btn').click();
        }
    } catch (e) {
        console.error(e);
        toast("حدث خطأ أثناء الفتح", "error");
        if (cost > 0) userProfile.highScore += cost;
    }
}
bind('ai-generate-btn', 'click', async () => {
    const cat = getEl('category-select').value;
    const count = parseInt(getEl('ai-question-count').value);
    const topicValue = getEl('topic-select').value;
    let topic = cat === 'random' || !cat ? "عام" : (topicValue || cat);
    quizState.difficulty = 'موحد';
    quizState.mode = 'standard';
    quizState.contextTopic = topic;
    const btn = getEl('ai-generate-btn');
    const originalBtnText = `<span class="text-lg">ابدأ التحدي</span> <span class="material-symbols-rounded">menu_book</span>`;
// التحكم في وظيفة resetButton - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
    const resetButton = () => {
        btn.disabled = false;
        btn.innerHTML = originalBtnText;
    };
    btn.disabled = true;
    if (navigator.onLine) {
        btn.innerHTML = `<span class="material-symbols-rounded animate-spin">autorenew</span> تجهيز...`;
    } else {
        btn.innerHTML = `<span class="material-symbols-rounded animate-spin">wifi_off</span> جاري البحث محلياً...`;
    }
    try {
        let allAvailableQuestions = [];
        if (cat === 'random' || !cat || topic === 'random') {
            const mainFiles = [
                "infallibles_all.json", "prophets.json", "personalities.json",
                "quran_nahj.json", "aqida_fiqh.json", "mahdi_culture.json",
                "history_battles.json", "dua_ziyarat.json"
            ];
            const fetchPromises = mainFiles.map(file => 
                fetch(`./Data/Noor/${file}`).then(res => res.ok ? res.json() : []).catch(() => [])
            );
            const results = await Promise.all(fetchPromises);
            allAvailableQuestions = results.flat();
            if (allAvailableQuestions.length === 0) {
                const backupRes = await fetch(`./Data/Noor/dataNooR.json`);
                if (backupRes.ok) allAvailableQuestions = await backupRes.json();
            }
        } else if (quizState.mode === 'marathon') {
            const response = await fetch(`./Data/Noor/dataNooR.json`);
            if (response.ok) allAvailableQuestions = await response.json();
        } else {
            const fileName = sectionFilesMap[topic] || sectionFilesMap['default'];
            const response = await fetch(`./Data/Noor/${fileName}`);
            if (response.ok) {
                const allQuestionsInFile = await response.json();
                allAvailableQuestions = allQuestionsInFile.filter(q => q.topic === topic);
            }
        }
        if (allAvailableQuestions.length === 0) {
            toast("عذراً، لا توجد أسئلة متاحة لهذا الموضوع حالياً.", "error");
            resetButton();
            return;
        }
        allAvailableQuestions = allAvailableQuestions.map(q => {
            if (!q.id) {
                let hash = 0;
                const str = q.question || "unknown";
                for (let i = 0; i < str.length; i++) {
                    hash = ((hash << 5) - hash) + str.charCodeAt(i);
                    hash |= 0;
                }
                q.id = `gen_id_${Math.abs(hash)}`;
            }
            q.id = String(q.id);
            return q;
        });
        const seenIds = (userProfile.seenQuestions || []).map(String);
        let freshQuestions = allAvailableQuestions.filter(q => !seenIds.includes(q.id));
        if (freshQuestions.length === 0) {
            toast("هذا الملف مختوم حاول مع موضوع اخر", "warning");
            resetButton();
            handleSealedTopic(topic, allAvailableQuestions);
            return;
        }
        shuffleArray(freshQuestions);
        if (freshQuestions.length >= count) {
            quizState.questions = freshQuestions.slice(0, count);
        } else {
            quizState.questions = freshQuestions;
            toast(`تبقى لديك ${freshQuestions.length} أسئلة جديدة فقط في هذا القسم!`, "info");
        }
        if (quizState.questions.length === 0) {
            toast("حدث خطأ غير متوقع في تجهيز الأسئلة.", "error");
            resetButton();
            return;
        }
        if (navigator.onLine && cat === 'random') {
            toast("✅ تم تحديث البيانات للعمل بدون إنترنت", "success");
        }
        resetButton();
        startQuiz();
    } catch (e) {
        console.error(e);
        if (e.message !== "No questions") {
            const errMsg = navigator.onLine ? "حدث خطأ في تحميل الأسئلة" : "أنت غير متصل ولا توجد أسئلة محفوظة";
            toast(errMsg, "error");
        }
        resetButton();
    }
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
        "هل تريد الانسحاب؟ سيتم احتساب النقاط والإجابات الصحيحة الحالية.",
        "save_as",
        async () => {
            if (quizState.score > 0 || quizState.correctCount > 0) {
                try {
                    const userRef = doc(db, "users", effectiveUserId);
                    const currentTopic = quizState.contextTopic;
                    const safeCorrect = quizState.correctCount || 0;
                    const updates = {
                        highScore: increment(quizState.score),
                        "stats.quizzesPlayed": increment(1),
                        "stats.totalCorrect": increment(safeCorrect),
                        "stats.totalQuestions": increment(quizState.idx)
                    };
                    if (currentTopic && currentTopic !== 'عام' && currentTopic !== 'مراجعة الأخطاء') {
                        updates[`stats.topicCorrect.${currentTopic}`] = increment(safeCorrect);
                    }
                    const wKey = getCurrentWeekKey();
                    let newWeekly = userProfile.weeklyStats || { key: wKey, correct: 0 };
                    if (newWeekly.key !== wKey) newWeekly = { key: wKey, correct: 0 };
                    newWeekly.correct += safeCorrect;
                    updates.weeklyStats = newWeekly;
                    const mKey = getCurrentMonthKey();
                    let newMonthly = userProfile.monthlyStats || { key: mKey, correct: 0 };
                    if (newMonthly.key !== mKey) newMonthly = { key: mKey, correct: 0 };
                    newMonthly.correct += safeCorrect;
                    updates.monthlyStats = newMonthly;
                    await updateDoc(userRef, updates);
                    userProfile.highScore = (Number(userProfile.highScore) || 0) + quizState.score;
                    if(userProfile.stats) {
                        userProfile.stats.totalCorrect = (userProfile.stats.totalCorrect || 0) + safeCorrect;
                        userProfile.stats.totalQuestions = (userProfile.stats.totalQuestions || 0) + quizState.idx;
                        if (currentTopic && currentTopic !== 'عام') {
                            userProfile.stats.topicCorrect[currentTopic] = (userProfile.stats.topicCorrect[currentTopic] || 0) + safeCorrect;
                        }
                    }
                    userProfile.weeklyStats = newWeekly;
                    userProfile.monthlyStats = newMonthly;
                    toast(`تم حفظ التقدم: ${quizState.score} نقطة و ${safeCorrect} إجابة صحيحة`, "success");
                } catch (e) {
                    console.error("Error saving partial score:", e);
                }
            }
            navToHome();
        }
    );
});
// التحكم في وظيفة renderLives - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function renderLives() {
    const el = getEl('lives-display');
    el.innerHTML = `
        <div class="flex items-center gap-1 transition-all duration-300">
            <span class="material-symbols-rounded text-red-500 text-2xl drop-shadow-sm ${quizState.lives <= 1 ? 'animate-pulse' : ''}">favorite</span>
            <span class="text-red-400 font-bold text-xl font-heading pt-1" dir="ltr">x${formatNumberAr(quizState.lives)}</span>
        </div>
    `;
    const vignette = getEl('low-health-vignette');
    if (vignette) {
        if (quizState.active && quizState.lives === 1) {
            vignette.classList.add('animate-danger-pulse');
            vignette.style.opacity = "1";
        } else {
            vignette.classList.remove('animate-danger-pulse');
            vignette.style.opacity = "0";
        }
    }
}
// التحكم في وظيفة startMarathon - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
async function startMarathon() {
    const btn = getEl('btn-marathon-confirm');
    if (userProfile.lastMarathonDate) {
        const lastPlayed = userProfile.lastMarathonDate.toMillis ? userProfile.lastMarathonDate.toMillis() : new Date(userProfile.lastMarathonDate).getTime();
        const now = Date.now();
        const diff = now - lastPlayed;
        const twentyFourHours = 1 * 60 * 60 * 1000;
        if (diff < twentyFourHours) {
            toast("⛔️ لا يمكنك لعب النور إلا مرة واحدة كل 24 ساعة.", "error");
            getEl('marathon-rules-modal').classList.remove('active');
            checkMarathonStatus();
            return;
        }
    }
    btn.disabled = true; 
    btn.innerHTML = `<span class="material-symbols-rounded animate-spin">autorenew</span> جاري التحقق...`;
    try {
        await updateDoc(doc(db, "users", effectiveUserId), {
            lastMarathonDate: serverTimestamp()
        });
        userProfile.lastMarathonDate = { toMillis: () => Date.now() };
        const cacheBuster = Date.now();
        const response = await fetch(`https://raw.githubusercontent.com/iqsd2020-ctrl/New/refs/heads/main/Data/Noor/dataNooR.json?v=${cacheBuster}`);
        if (!response.ok) throw new Error("فشل تحميل ملف أسئلة (أكمل النور)");
        let rawData = await response.json();
        const seenIds = userProfile.seenMarathonIds || [];
        let freshQs = [];
        let usedQs = [];
        rawData.forEach((q, index) => {
            if (q.question && Array.isArray(q.options) && typeof q.correctAnswer === 'number') {
                const questionObj = {
                    id: q.id || `noor_idx_${index}`,
                    question: q.question,
                    options: q.options,
                    correctAnswer: q.correctAnswer,
                    topic: q.topic || "(أكمل النور)",
                    explanation: q.explanation || ""
                };
                if (seenIds.includes(questionObj.id)) {
                    usedQs.push(questionObj);
                } else {
                    freshQs.push(questionObj);
                }
            }
        });
        shuffleArray(freshQs);
        shuffleArray(usedQs);
        if (freshQs.length > 0) {
            quizState.questions = freshQs;
            toast(`🚀 انطلاق! متبقي ${freshQs.length} سؤال لختم هذا الملف.`, "info");
        } else {
            quizState.questions = usedQs;
            toast("🌟 رائع! أنت ختمت هذا الملف. بدأت جولة مراجعة شاملة.", "success");
        }
        if (quizState.questions.length === 0) {
            toast("عذراً، لا توجد أسئلة في الملف!", "error");
            throw new Error("Empty questions list");
        }
        quizState.mode = 'marathon'; 
        quizState.contextTopic = "(أكمل النور)";
        getEl('marathon-rules-modal').classList.remove('active'); 
        startQuiz();
    } catch(e) {
        console.error(e);
        toast("حدث خطأ أثناء الاتصال بالسيرفر", "error");
    } finally {
        btn.disabled = false; 
        btn.innerHTML = `بدء التحدي الآن!`;
    }
}
// التحكم في وظيفة startQuiz - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function startQuiz() {
    window.history.pushState({ view: 'playing' }, "", "");
    manageAudioSystem('start_quiz');
    hide('bottom-nav');
    quizState.idx = 0; quizState.score = 0; quizState.correctCount = 0; quizState.active = true; 
    quizState.history = []; quizState.streak = 0; 
    const extraLives = (userProfile.inventory && userProfile.inventory.lives) ? userProfile.inventory.lives : 0;
    quizState.lives = 3 + extraLives;
    helpers = { fifty: false, hint: false, skip: false };
    quizState.usedHelpers = false; 
    quizState.hasUsedHelperInSession = false; 
    quizState.fastAnswers = 0; 
    quizState.enrichmentEnabled = true;
    quizState.marathonCorrectStreak = 0; 
    hide('welcome-area'); show('quiz-proper');
    getEl('quiz-topic-display').textContent = quizState.contextTopic || 'مسابقة متنوعة';
    getEl('ai-question-count').disabled = false;
    getEl('ai-generate-btn').disabled = false;
    getEl('btn-marathon-start').disabled = false;
    updateHelpersUI();
    updateStreakUI();
    updateEnrichmentUI(); 
    renderLives();
    renderQuestion();
}
// التحكم في وظيفة renderQuestion - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function renderQuestion() {
    quizState.processingAnswer = false;
    quizState.usedHelpers = false; 
    updateHelpersUI(); 
    quizState.active = true; 
    const q = quizState.questions[quizState.idx];
    getEl('quiz-topic-display').textContent = q.topic || quizState.contextTopic;
    typeWriter('question-text', q.question);
    if (quizState.mode === 'marathon') {
        getEl('question-counter-text').textContent = `${quizState.idx+1}`;
        const dots = getEl('progress-dots'); 
        dots.innerHTML = '<span class="text-xs text-slate-500 font-mono tracking-widest">🪙 (أكمل النور)</span>';
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
     const box = getEl('options-container');
    box.innerHTML = ''; 
    if (quizState.mode === 'marathon') {
        box.style.display = 'grid';
        box.style.gridTemplateColumns = 'repeat(2, 1fr)';
        box.style.gap = '10px';
        box.classList.remove('space-y-1', 'space-y-2', 'space-y-3');
    } else {
        box.style.display = 'block';
        box.style.gridTemplateColumns = 'none';
        box.style.gap = '0';
        box.classList.add('space-y-1');
    }
    const template = document.getElementById('option-template');
    q.options.forEach((o, i) => {
        const clone = template.content.cloneNode(true);
        const btn = clone.querySelector('button');
        const charEl = btn.querySelector('.option-char');
        const textEl = btn.querySelector('.option-text');
        charEl.textContent = formatNumberAr(i + 1);
        textEl.textContent = o;
        if (quizState.mode === 'marathon') {
            btn.classList.remove('flex', 'items-center', 'gap-4', 'text-right', 'p-3');
            btn.classList.add('flex', 'flex-col', 'items-center', 'justify-center', 'text-center', 'p-2');
            btn.style.setProperty('height', '135px', 'important');      
            btn.style.setProperty('min-height', '135px', 'important');
            charEl.classList.remove('w-10', 'h-10');
            charEl.classList.add('w-8', 'h-8', 'mb-2', 'text-sm');
            textEl.classList.add('text-sm');
        }
        btn.onclick = () => selectAnswer(i, btn);
        btn.classList.add('grid-pop');
        btn.style.animationDelay = `${i * 0.1}s`; 
        box.appendChild(clone);
    });
    getEl('feedback-text').textContent = '';
    quizState.startTime = Date.now(); 
}
// التحكم في وظيفة nextQuestion - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function nextQuestion() {
    quizState.idx++;
    if(quizState.idx < quizState.questions.length) {
        renderQuestion();
    } else {
        endQuiz();
    }
}
// التحكم في وظيفة updateStreakUI - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function updateStreakUI() {
    const icon = getEl('streak-icon');
    const txt = getEl('streak-count');
    if (quizState.mode !== 'marathon') {
        icon.classList.remove('active');
        icon.classList.add('opacity-0');
        txt.classList.add('opacity-0');
        return; 
    }
    const s = quizState.streak;
    txt.textContent = 'x' + formatNumberAr(s); 
    icon.classList.remove('text-orange-500', 'text-yellow-400', 'text-red-500', 'text-purple-500', 'animate-pulse');
    txt.classList.remove('text-orange-400', 'text-yellow-300', 'text-red-400', 'text-purple-400');
    if(s > 1) {
        icon.classList.remove('opacity-0');
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
// التحكم في وظيفة showEnrichment - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function showEnrichment(text) {
    if (userProfile && userProfile.stats) {
        if (!userProfile.stats.enrichmentCount) userProfile.stats.enrichmentCount = 0;
        userProfile.stats.enrichmentCount++;
        if (!userProfile.stats.explanationsViewed) userProfile.stats.explanationsViewed = 0;
        userProfile.stats.explanationsViewed++;
        if (typeof effectiveUserId !== 'undefined' && effectiveUserId) {
            updateDoc(doc(db, "users", effectiveUserId), {
                "stats.enrichmentCount": userProfile.stats.enrichmentCount,
                "stats.explanationsViewed": userProfile.stats.explanationsViewed
            }).catch(console.error);
        }
    }
    const contentEl = document.getElementById('enrichment-content');
    if(contentEl) contentEl.textContent = text;
    const modal = document.getElementById('enrichment-modal');
    if(modal) {
        modal.classList.remove('hidden');
        requestAnimationFrame(() => modal.classList.add('active'));
        if(typeof playSound === 'function') playSound('hint');
// التحكم في وظيفة closeHandler - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
        const closeHandler = () => {
            modal.classList.remove('active');
            setTimeout(() => modal.classList.add('hidden'), 300);
            if(typeof nextQuestion === 'function') nextQuestion(); 
        };
        setTimeout(() => {
            modal.addEventListener('click', closeHandler, { once: true });
        }, 500);
    }
}
window.showEnrichment = showEnrichment;
// التحكم في وظيفة toggleEnrichFav - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
async function toggleEnrichFav(btn) {
    window.event.stopPropagation();
    const contentText = getEl('enrichment-content').textContent;
    const icon = btn.querySelector('span');
    const isActive = btn.classList.contains('active');
    if (!isActive) {
        const enrichObj = {
            question: contentText,
            options: ["معلومة إثرائية"],
            correctAnswer: 0,
            type: 'enrichment',
            savedAt: Date.now()
        };
        userProfile.favorites.push(enrichObj);
        btn.classList.add('active');
        icon.textContent = 'favorite';
        toast("تم حفظ المعلومة في المفضلة ❤️");
    } else {
        const index = userProfile.favorites.findIndex(f => f.question === contentText && f.type === 'enrichment');
        if (index > -1) {
            userProfile.favorites.splice(index, 1);
        }
        btn.classList.remove('active');
        icon.textContent = 'favorite_border';
        toast("تمت الإزالة من المفضلة");
    }
    if (effectiveUserId) {
        try {
            await updateDoc(doc(db, "users", effectiveUserId), {
                favorites: userProfile.favorites
            });
        } catch(e) {
            console.error("خطأ في حفظ المفضلة:", e);
            toast("تعذر الحفظ في السيرفر (مشكلة اتصال)", "error");
        }
    }
}
// التحكم في وظيفة selectAnswer - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function selectAnswer(idx, btn) {
    if(!quizState.active || quizState.processingAnswer) return;
    quizState.processingAnswer = true; 
    const answerTime = Date.now() - quizState.startTime;
    const q = quizState.questions[quizState.idx];
    const isCorrect = idx === q.correctAnswer;
    const btns = document.querySelectorAll('.option-btn');
    btns.forEach(b => {
        b.classList.add('pointer-events-none');
        if(b !== btn) b.classList.add('opacity-50'); 
    });
    const qBankIdx = userProfile.wrongQuestionsBank.findIndex(x => x.question === q.question);
    if (quizState.mode === 'marathon') {
        if (!quizState.tempMarathonIds) quizState.tempMarathonIds = [];
        if (q.id) quizState.tempMarathonIds.push(q.id);
        if (quizState.tempMarathonIds.length >= 5) {
            const batchIds = [...quizState.tempMarathonIds];
            quizState.tempMarathonIds = []; 
            updateDoc(doc(db, "users", effectiveUserId), {
                seenMarathonIds: arrayUnion(...batchIds)
            }).catch(e => console.error("Auto-save failed:", e));
            if(!userProfile.seenMarathonIds) userProfile.seenMarathonIds = [];
            userProfile.seenMarathonIds = [...new Set([...userProfile.seenMarathonIds, ...batchIds])];
        }
    }
    if(isCorrect) {
        if (answerTime <= QUIZ_CONFIG.FAST_ANSWER_THRESHOLD) { quizState.fastAnswers++; }
        if (quizState.mode === 'marathon') userProfile.stats.marathonCorrectTotal = (userProfile.stats.marathonCorrectTotal || 0) + 1;
        if (quizState.contextTopic === "مراجعة الأخطاء") userProfile.stats.reviewedMistakesCount = (userProfile.stats.reviewedMistakesCount || 0) + 1;
let basePoints = QUIZ_CONFIG.CORRECT_ANSWER_POINTS;
        let multiplier = 1;
        let multiplierText = "";
        if (quizState.mode === 'marathon') {
            quizState.streak++;
            if(quizState.streak > userProfile.stats.maxStreak) { userProfile.stats.maxStreak = quizState.streak; }
            quizState.marathonCorrectStreak = (quizState.marathonCorrectStreak || 0) + 1;
            if(quizState.marathonCorrectStreak === QUIZ_CONFIG.LIVES_REWARD_STREAK) {
                userProfile.inventory.lives++;
                updateDoc(doc(db, "users", effectiveUserId), { "inventory.lives": userProfile.inventory.lives });
                toast("🎉 إنجاز رائع! حصلت على قلب إضافي", "success");
                quizState.lives++;
                renderLives();
                quizState.marathonCorrectStreak = 0;
            }
            for (const m of QUIZ_CONFIG.STREAK_MULTIPLIERS) {
                if (quizState.streak >= m.threshold) {
                    multiplier = m.multiplier;
                    multiplierText = m.text;
                    break;
                }
            }
            if(quizState.streak >= 5) playSound('streak'); else playSound('win');
        } else {
            quizState.streak = 0;
            playSound('win');
        }
        let pointsAdded = Math.floor(basePoints * multiplier);
        if(btn) {
            btn.className = 'w-full flex items-center justify-start text-right p-4 rounded-xl border-2 border-emerald-500 bg-emerald-900/80 transition-all duration-300 group relative overflow-hidden gap-3 shadow-[0_0_15px_rgba(16,185,129,0.3)]';
            if(btn.firstElementChild) {
                 btn.firstElementChild.className = 'inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-600 text-white shrink-0 transition-colors duration-300 font-bold';
            }
            if(btn.children[1]) {
                 btn.children[1].className = 'text-white font-bold flex-1 relative z-10 transition-colors duration-300';
            }
            showFloatingFeedback(btn, `+${pointsAdded}`, 'text-emerald-400');
        }
        quizState.score += pointsAdded;
        quizState.correctCount++;
        if (quizState.mode === 'marathon') updateQuestProgress(3, 1);
        const questTopic = q.topic || quizState.contextTopic;
        if (questTopic && (questTopic.includes('المعصومين') || questTopic.includes('أهل البيت') || questTopic.includes('الإمام') || questTopic.includes('النبي'))) updateQuestProgress(1, 1);
        if (questTopic && (questTopic.includes('مهدي') || questTopic.includes('حجة') || questTopic.includes('منتظر') || questTopic.includes('قائم') || questTopic.includes('الظهور') || questTopic.includes('السفراء') || questTopic.includes('الغيبة') || questTopic.includes('دولة العدل'))) updateQuestProgress(4, 1);
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
            btn.className = 'w-full flex items-center justify-start text-right p-4 rounded-xl border-2 border-red-500 bg-red-900/80 transition-all duration-300 group relative overflow-hidden gap-3 shadow-[0_0_15px_rgba(239,68,68,0.3)]';
            if(btn.firstElementChild) {
                 btn.firstElementChild.className = 'inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-600 text-white shrink-0 transition-colors duration-300 font-bold';
            }
            if(btn.children[1]) {
                 btn.children[1].className = 'text-white font-bold flex-1 relative z-10 transition-colors duration-300';
            }
            const deductDisplay = (quizState.score >= 2) ? 2 : quizState.score;
            showFloatingFeedback(btn, `-${deductDisplay}`, 'text-red-400');
        }
        if(q.correctAnswer >= 0 && q.correctAnswer < btns.length) {
            const correctBtn = btns[q.correctAnswer];
            correctBtn.classList.remove('opacity-50', 'pointer-events-none');
            correctBtn.className = 'w-full flex items-center justify-start text-right p-4 rounded-xl border-2 border-emerald-500 bg-emerald-900/80 transition-all duration-300 group relative overflow-hidden gap-3 shadow-[0_0_15px_rgba(16,185,129,0.3)]';
            if(correctBtn.firstElementChild) {
                 correctBtn.firstElementChild.className = 'inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-600 text-white shrink-0 font-bold';
            }
            if(correctBtn.children[1]) {
                 correctBtn.children[1].className = 'text-white font-bold flex-1 relative z-10';
            }
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
        const deductionTarget = QUIZ_CONFIG.WRONG_ANSWER_DEDUCTION;
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
    if (!userProfile.stats.shareCount) userProfile.stats.shareCount = 0;
    userProfile.stats.shareCount++;
    if (effectiveUserId) {
        updateDoc(doc(db, "users", effectiveUserId), {
            "stats.shareCount": userProfile.stats.shareCount
        }).catch(console.error);
    }
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
// التحكم في وظيفة getCurrentWeekKey - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function getCurrentWeekKey() {
    const d = new Date();
    const day = d.getDay();
    const diff = (day + 2) % 7; 
    const lastFriday = new Date(d);
    lastFriday.setDate(d.getDate() - diff);
    const year = lastFriday.getFullYear();
    const month = String(lastFriday.getMonth() + 1).padStart(2, '0');
    const dayOfMonth = String(lastFriday.getDate()).padStart(2, '0');
    return `${year}-${month}-${dayOfMonth}`;
}
// التحكم في وظيفة endQuiz - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
async function endQuiz() {
    hide('quiz-proper'); 
    show('results-area');
    const safeCorrectCount = Number(quizState.correctCount) || 0;
    const safeTotalQuestions = Number(quizState.questions.length) || 0;
    const accuracy = safeTotalQuestions > 0 ? Math.round((safeCorrectCount / safeTotalQuestions) * 100) : 0;
    animateValue(getEl('card-score'), 0, quizState.score, 500);
    getEl('card-username').textContent = userProfile.username;
    getEl('card-difficulty').textContent = quizState.difficulty;
    getEl('card-correct-count').innerHTML = `<span class="material-symbols-rounded text-green-400 text-sm align-middle">check_circle</span> ${formatNumberAr(safeCorrectCount)}`;
    getEl('card-wrong-count').innerHTML = `<span class="material-symbols-rounded text-red-400 text-sm align-middle">cancel</span> ${formatNumberAr(safeTotalQuestions - safeCorrectCount)}`;
    let msg = "حاول مرة أخرى";
    if(accuracy === 100) { 
        msg = "أداء مبهر! درجة كاملة"; 
        playSound('applause'); 
    } else if(accuracy >= 80) msg = "أداء ممتاز!";
    else if(accuracy >= 50) msg = "جيد جداً";
    getEl('final-message').textContent = msg;
    const stats = userProfile.stats || {};
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
    const isAfternoon = (currentHour >= 15 && currentHour < 18);
    const isPerfect = safeCorrectCount === safeTotalQuestions && safeTotalQuestions > 0;
    if (quizState.mode === 'marathon') {
        const currentMarathonScore = quizState.score;
        const maxMarathon = stats.maxMarathonScore || 0;
        if (currentMarathonScore > maxMarathon) {
            stats.maxMarathonScore = currentMarathonScore;
        }
    }
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
        explanationsViewed: stats.explanationsViewed || 0,
        marathonCorrectTotal: stats.marathonCorrectTotal || 0,
        reviewedMistakesCount: stats.reviewedMistakesCount || 0,
        nightPlayCount: (stats.nightPlayCount || 0) + (isNight ? 1 : 0),
        morningPlayCount: (stats.morningPlayCount || 0) + (isMorning ? 1 : 0),
        afternoonPlayCount: (stats.afternoonPlayCount || 0) + (isAfternoon ? 1 : 0),
        fridayPlayCount: (stats.fridayPlayCount || 0) + (isFriday ? 1 : 0),
        perfectRounds: (stats.perfectRounds || 0) + (isPerfect ? 1 : 0),
        itemsBought: stats.itemsBought || 0,
        survivorWins: (stats.survivorWins || 0) + (quizState.lives === 1 && safeCorrectCount > 0 ? 1 : 0),
        strategicWins: (stats.strategicWins || 0) + (quizState.hasUsedHelperInSession && safeCorrectCount > 0 ? 1 : 0),
        maxMarathonScore: stats.maxMarathonScore || 0
    };
    const currentTopic = quizState.contextTopic;
    if (currentTopic && currentTopic !== 'عام' && currentTopic !== 'مراجعة الأخطاء') {
        const oldTopicScore = Number(newStats.topicCorrect[currentTopic]) || 0;
        newStats.topicCorrect[currentTopic] = oldTopicScore + safeCorrectCount;
    }
    const currentWeekKey = getCurrentWeekKey();
    let weeklyStats = userProfile.weeklyStats || { key: '', correct: 0 };
    if (weeklyStats.key !== currentWeekKey) { weeklyStats = { key: currentWeekKey, correct: 0 }; }
    weeklyStats.correct += safeCorrectCount;
    const currentMonthKey = getCurrentMonthKey();
    let monthlyStats = userProfile.monthlyStats || { key: '', correct: 0 };
    if (monthlyStats.key && monthlyStats.key !== currentMonthKey) {
        try {
            saveMonthlyWinner(monthlyStats.key);
        } catch(e) { console.error("Error saving monthly winner:", e); }
        monthlyStats = { key: currentMonthKey, correct: 0 };
    } else if (!monthlyStats.key) {
        monthlyStats.key = currentMonthKey;
    }
    monthlyStats.correct += safeCorrectCount;
    const playedIds = quizState.questions.filter(q => q.id).map(q => q.id);
    const oldSeen = Array.isArray(userProfile.seenQuestions) ? userProfile.seenQuestions : [];
    let updatedSeenQuestions = [...new Set([...oldSeen, ...playedIds])]; 
    if (updatedSeenQuestions.length > 2000) { updatedSeenQuestions = updatedSeenQuestions.slice(-1000); }
    let updatedWrongQuestionsBank = Array.isArray(userProfile.wrongQuestionsBank) ? userProfile.wrongQuestionsBank : [];
    if (updatedWrongQuestionsBank.length > 15) updatedWrongQuestionsBank = updatedWrongQuestionsBank.slice(-15);
    let updatedSeenMarathon = userProfile.seenMarathonIds || [];
    if (quizState.mode === 'marathon') {
        const playedMarathonIds = quizState.questions
            .slice(0, quizState.idx + 1)
            .map(q => q.id);
        updatedSeenMarathon = [...new Set([...updatedSeenMarathon, ...playedMarathonIds])];
    }
    const firestoreUpdates = {
        highScore: increment(quizState.score), 
        stats: newStats, 
        weeklyStats: weeklyStats,
        monthlyStats: monthlyStats,
        wrongQuestionsBank: updatedWrongQuestionsBank, 
        seenQuestions: updatedSeenQuestions,
        seenMarathonIds: updatedSeenMarathon
    };
    try {
        await updateDoc(doc(db, "users", effectiveUserId), firestoreUpdates);
        userProfile.highScore = (Number(userProfile.highScore) || 0) + quizState.score;
        userProfile.stats = newStats;
        userProfile.weeklyStats = weeklyStats;
        userProfile.monthlyStats = monthlyStats;
        userProfile.wrongQuestionsBank = updatedWrongQuestionsBank;
        userProfile.seenQuestions = updatedSeenQuestions;
        userProfile.seenMarathonIds = updatedSeenMarathon;
        updateProfileUI(); 
        setTimeout(async () => {
            const gotBadge = await checkAndUnlockBadges();
            if (!gotBadge) { showMotivator(); }
        }, 1000);
    } catch(e) {
        console.error("Error saving quiz results:", e);
        toast("تم حفظ النقاط محلياً مؤقتاً لضعف الاتصال", "info");
        userProfile.highScore = (Number(userProfile.highScore) || 0) + quizState.score;
        userProfile.weeklyStats = weeklyStats;
        userProfile.monthlyStats = monthlyStats;
        userProfile.seenMarathonIds = updatedSeenMarathon;
        updateProfileUI();
    }
    addLocalNotification('نهاية جولة', `أتممت جولة في "${quizState.contextTopic}". النتيجة: ${quizState.score} نقطة.`, 'sports_score');
    renderReviewArea();
}
// التحكم في وظيفة renderReviewArea - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function renderReviewArea(){const box=getEl('review-items-container');box.innerHTML='';show('review-area');getEl('review-area').querySelector('h3').textContent="مراجعة الاسئلة ذات الاجابة الخطأ";const tpl=document.getElementById('review-card-template');quizState.history.forEach((h,i)=>{const clone=tpl.content.cloneNode(true);const div=clone.querySelector('.review-item');const qEl=clone.querySelector('.rev-q');const optsBox=clone.querySelector('.rev-opts');const ansEl=clone.querySelector('.rev-ans');div.classList.add(h.isCorrect?'bg-green-900/20':'bg-red-900/20',h.isCorrect?'border-green-800':'border-red-800');qEl.innerHTML=`<span class="material-symbols-rounded ${h.isCorrect?'text-green-400':'text-red-500'} align-middle text-lg">${h.isCorrect?'check_circle':'cancel'}</span> ${formatNumberAr(i+1)}. ${h.q}`;h.options.forEach((o,idx)=>{const sp=document.createElement('span');let cls='block mr-2 text-slate-400';if(idx===h.correct)cls='block mr-2 text-green-400 font-bold';if(idx===h.user)cls=h.isCorrect?'block mr-2 text-green-300 font-bold underline':'block mr-2 text-red-400 line-through';sp.className=cls;sp.textContent=`- ${o}`;optsBox.appendChild(sp)});if(!h.isCorrect){ansEl.textContent=`الصحيح كان: ${h.options[h.correct]}`;ansEl.classList.remove('hidden')}box.appendChild(clone)})}
// التحكم في وظيفة updateHelpersUI - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function updateHelpersUI() {
    const helperIds = ['helper-fifty-fifty', 'helper-hint', 'helper-skip'];
    const isUsed = quizState.usedHelpers;
    helperIds.forEach(id => {
        const btn = getEl(id);
        btn.disabled = isUsed; 
        if (isUsed) {
            btn.classList.add('opacity-30', 'cursor-not-allowed', 'grayscale');
            btn.classList.remove('hover:text-amber-400');
        } else {
            btn.classList.remove('opacity-30', 'cursor-not-allowed', 'grayscale');
            btn.classList.add('hover:text-amber-400');
        }
        const typeKey = id.replace('helper-', '').replace('-fifty', '');
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
    getEl('helper-report').disabled = false;
}
// التحكم في وظيفة useHelper - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
async function useHelper(type, cost, actionCallback) {
    if(!quizState.active) return;
    if (quizState.usedHelpers) {
        toast("عذراً، يسمح بمساعدة واحدة فقط لكل سؤال!", "error");
        playSound('lose');
        return;
    }
    const hasInventory = userProfile.inventory.helpers[type] > 0;
    if (!hasInventory && quizState.score < cost) {
        toast(`رصيدك غير كافٍ! تحتاج ${cost} نقطة.`, "error");
        return;
    }
    quizState.usedHelpers = true;
    quizState.hasUsedHelperInSession = true;
    actionCallback(); 
    updateQuestProgress(2, 1);
    updateHelpersUI(); 
    if(hasInventory) {
        userProfile.inventory.helpers[type]--;
        toast(`تم استخدام ${type} من الحقيبة`);
        updateDoc(doc(db, "users", effectiveUserId), { [`inventory.helpers.${type}`]: userProfile.inventory.helpers[type] }).catch(console.error);
    } else {
        quizState.score -= cost;
        getEl('live-score-text').textContent = formatNumberAr(quizState.score);
        toast(`تم خصم ${cost} نقطة`);
    }
}
bind('helper-fifty-fifty', 'click', () => {
    useHelper('fifty', HELPER_COSTS.FIFTY, () => {
        const q = quizState.questions[quizState.idx];
        const opts = document.querySelectorAll('.option-btn');
        let removed = 0;
        [0,1,2,3].sort(()=>Math.random()-0.5).forEach(i => { 
            if(i !== q.correctAnswer && removed < 2) { opts[i].classList.add('option-hidden'); removed++; } 
        });
    });
});
bind('helper-hint', 'click', () => {
    useHelper('hint', HELPER_COSTS.HINT, () => {
        const q = quizState.questions[quizState.idx];
        const opts = document.querySelectorAll('.option-btn');
        let removed = 0;
        [0,1,2,3].forEach(i => { 
            if(i !== q.correctAnswer && removed < 1) { opts[i].classList.add('option-hidden'); removed++; } 
        });
    });
});
bind('helper-skip', 'click', () => {
    useHelper('skip', HELPER_COSTS.SKIP, () => {
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
// التحكم في وظيفة toggleMenu - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function toggleMenu(open) { 
    const m = getEl('side-menu'); 
    const o = getEl('side-menu-overlay'); 
    if(open) { 
        m.classList.add('open'); 
        o.classList.add('open');
        window.history.pushState({menuOpen: true}, ""); 
    } else { 
        m.classList.remove('open'); 
        o.classList.remove('open');
    } 
}
bind('menu-btn', 'click', () => toggleMenu(true));
// التحكم في وظيفة openModal - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
const openModal = (id) => { 
    toggleMenu(false); 
    if (id !== 'player-profile-modal') {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active')); 
    }
    const modal = getEl(id);
    if(modal) {
        modal.classList.add('active');
        window.history.pushState({modalOpen: id}, ""); 
    }
};
document.addEventListener('click', (e) => {
    const closeBtn = e.target.closest('.close-modal');
    if (closeBtn) {
        e.preventDefault();
        e.stopPropagation();
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
        toggleMenu(false);
        if(typeof playSound === 'function') playSound('click');
        if (window.history.state && (window.history.state.modalOpen || window.history.state.menuOpen)) {
            window.history.back();
        }
    }
});
window.addEventListener('popstate', () => {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    toggleMenu(false);
});
bind('nav-home', 'click', () => { toggleMenu(false); navToHome(); });
bind('nav-badges','click',()=>{openModal('badges-modal');const container=getEl('badges-list');container.className='badges-list-container';container.innerHTML='';const tpl=document.getElementById('badge-card-template');const sorted=sortBadgesSmartly();sorted.forEach(b=>{const p=getBadgeProgress(b);const clone=tpl.content.cloneNode(true);const card=clone.querySelector('.badge-card');const iconBox=clone.querySelector('.badge-icon-box');const img=clone.querySelector('.badge-img');const name=clone.querySelector('.badge-name');const tier=clone.querySelector('.badge-tier');const desc=clone.querySelector('.badge-desc');const progTxt=clone.querySelector('.badge-progress-text');const rewards=clone.querySelector('.badge-rewards');const bar=clone.querySelector('.badge-bar');let iconCls='text-slate-600 opacity-50',glow='',tTxt='',bCol='#ef4444';if(p.tier==='bronze'||(p.percent>0&&p.tier==='locked')){iconCls='text-red-500 drop-shadow-sm';tTxt='مستوى برونزي';bCol='#ef4444'}else if(p.tier==='silver'){iconCls='text-slate-100 drop-shadow-md';glow='shadow-[0_0_10px_rgba(255,255,255,0.3)]';tTxt='مستوى فضي';bCol='#f8fafc'}else if(p.tier==='gold'){iconCls='text-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.8)]';tTxt='مستوى ذهبي 👑';bCol='#fbbf24';card.classList.add('border-amber-500/50')}else if(p.tier==='diamond'){iconCls='text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.6)] animate-pulse';tTxt='مستوى ماسي 💎';bCol='#22d3ee'}else if(p.tier==='legendary'){iconCls='text-red-600 drop-shadow-[0_0_15px_rgba(239,68,68,0.8)] animate-pulse-slow';tTxt='مستوى أسطوري 🔥';bCol='#ef4444'}let rewHtml='';if(p.activeLevel.rewards&&!p.isMaxed){let rList=[];if(p.activeLevel.rewards.score)rList.push(`<span class="text-amber-400">${formatNumberAr(p.activeLevel.rewards.score)} <span class="material-symbols-rounded text-[9px]">monetization_on</span></span>`);if(p.activeLevel.rewards.lives)rList.push(`<span class="text-red-500">+${p.activeLevel.rewards.lives} <span class="material-symbols-rounded text-[9px]">favorite</span></span>`);if(p.activeLevel.rewards.hint)rList.push(`<span class="text-yellow-400">+${p.activeLevel.rewards.hint} <span class="material-symbols-rounded text-[9px]">lightbulb</span></span>`);rewHtml=`<div class="flex gap-2 text-[9px] font-bold bg-black/20 px-2 py-0.5 rounded-full">${rList.join('<span class="text-slate-600">|</span>')}</div>`}else if(p.isMaxed){rewHtml='<span class="text-[9px] text-green-400 font-bold">تم الختم</span>'}img.src=b.image;name.textContent=b.name;tier.textContent=tTxt||'غير مكتسب';tier.className+=` ${iconCls}`;desc.textContent=b.desc;progTxt.textContent=`${formatNumberAr(p.current)} / ${formatNumberAr(p.max)}`;rewards.innerHTML=rewHtml;bar.style.width=`${p.percent}%`;bar.style.background=bCol;if(glow)iconBox.classList.add(glow);iconBox.className+=` ${iconCls}`;let cCls=p.percent>0?'active-target':'locked';if(p.isMaxed)cCls='unlocked';if(p.tier==='diamond')cCls+=' diamond';if(p.tier==='legendary')cCls+=' legendary';card.classList.add(...cCls.split(' '));container.appendChild(clone)})});
let currentLeaderboardMode = 'monthly';
// التحكم في وظيفة loadLeaderboard - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
async function loadLeaderboard() {
    const container = getEl('leaderboard-list');
    const loading = getEl('leaderboard-loading');
    if (loading) loading.classList.remove('hidden');
    if (container) {
        container.classList.add('hidden');
        container.innerHTML = '';
    }
    renderSkeleton('leaderboard', 6);
    try {
        const currentMonthKey = getCurrentMonthKey();
        const lastMonthKey = getLastMonthKey();
        const winnerDoc = await getDoc(doc(db, "winners", lastMonthKey));
        let lastMonthWinner = null;
        if (winnerDoc.exists()) {
            const savedWinnerData = winnerDoc.data();
            try {
                if (savedWinnerData.userId) {
                    const liveUserDoc = await getDoc(doc(db, "users", savedWinnerData.userId));
                    if (liveUserDoc.exists()) {
                        const liveData = liveUserDoc.data();
                        lastMonthWinner = {
                            ...savedWinnerData,
                            username: liveData.username || savedWinnerData.username,
                            customAvatar: liveData.customAvatar,
                            equippedFrame: liveData.equippedFrame || 'default'
                        };
                    } else {
                        lastMonthWinner = savedWinnerData;
                    }
                } else {
                    lastMonthWinner = savedWinnerData;
                }
            } catch (err) {
                console.error("Error fetching live winner data:", err);
                lastMonthWinner = savedWinnerData;
            }
        }
        const q = query(collection(db, "users"), where("monthlyStats.key", "==", currentMonthKey), orderBy("monthlyStats.correct", "desc"), limit(20));
        const s = await getDocs(q);
        if (loading) loading.classList.add('hidden');
        if (container) container.classList.remove('hidden');
        container.innerHTML = '';
        if (lastMonthWinner) {
            renderLastMonthWinner(lastMonthWinner, container);
        }
        if (s.empty) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = "text-center text-slate-400 py-10 bg-slate-800/30 rounded-2xl border border-dashed border-slate-700 mt-4";
            emptyMsg.innerHTML = `
                <span class="material-symbols-rounded text-4xl block mb-2 opacity-20">emoji_events</span>
                <p>بداية شهر جديد!<br>كن أول المنافسين في القائمة.</p>
            `;
            container.appendChild(emptyMsg);
        } else {
            const statusUpdates = {};
            const statusRef = ref(rtdb, 'status');
            onValue(statusRef, (snapshot) => {
                 snapshot.forEach((child) => {
                     statusUpdates[child.key] = child.val();
                 });
                 renderLeaderboardList(s.docs, container, statusUpdates);
            }, { onlyOnce: true });
        }
    } catch(e) { 
        console.error("Leaderboard Error:", e);
        if (container) container.innerHTML = `<div class="text-center text-red-400 mt-4">خطأ في التحميل، تأكد من الاتصال</div>`;
    }
}
// التحكم في وظيفة renderLastMonthWinner - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function renderLastMonthWinner(winner, container) {
    const avatarHtml = getAvatarHTML(winner.customAvatar, winner.equippedFrame || 'default', "w-full h-full");
    const winnerHtml = `
        <div class="last-month-winner-card relative overflow-hidden rounded-xl border border-purple-500/50 bg-gradient-to-br from-indigo-950 via-purple-900/60 to-indigo-950 p-2 mb-4 shadow-[0_4px_15px_rgba(168,85,247,0.25)] animate-fade-in group">
            <div class="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(168,85,247,0.15),transparent_70%)]"></div>
            <div class="absolute -bottom-4 -left-4 rotate-12 opacity-10">
                <span class="material-symbols-rounded text-6xl text-purple-200">military_tech</span>
            </div>
            <div class="relative z-10 flex items-center gap-2">
                <div class="relative shrink-0">
                    <div class="w-12 h-12 rounded-full border border-purple-300/50 shadow-md flex items-center justify-center bg-black/40 ring-1 ring-amber-500/20">
                        ${avatarHtml}
                    </div>
                    <div class="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-b from-yellow-300 to-amber-600 rounded-full flex items-center justify-center shadow-sm z-20 border border-white/50">
                        <span class="material-symbols-rounded text-white text-[10px]">star</span>
                    </div>
                </div>
                <div class="flex-1 min-w-0 flex flex-col justify-center">
                    <div class="flex justify-between items-center mb-1 px-1">
                        <h3 class="text-xs font-bold text-white truncate font-heading leading-none drop-shadow-md">${winner.username}</h3>
                        <span class="text-[8px] font-bold text-purple-200 bg-purple-500/20 px-1.5 py-0.5 rounded border border-purple-500/30 uppercase tracking-wide">بطل الشهر الماضي</span>
                    </div>
                    <div class="relative flex items-center justify-center gap-1 bg-black/30 rounded py-0.5 border border-purple-500/20 w-full shadow-inner">
                        <span class="material-symbols-rounded text-amber-400 text-sm">workspace_premium</span>
                        <span class="text-lg font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-amber-500 font-mono leading-none pt-0.5">
                            ${formatNumberAr(winner.score)}
                        </span>
                        <span class="text-[8px] text-purple-200/60 self-end mb-0.5">نقطة</span>
                    </div>
                </div>
            </div>
            <div class="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-400/50 to-transparent"></div>
        </div>
    `;
    container.insertAdjacentHTML('afterbegin', winnerHtml);
}
// التحكم في وظيفة getLastMonthKey - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function getLastMonthKey() {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}
let leaderboardTimerInterval = null;
// التحكم في وظيفة startLeaderboardResetTimer - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function startLeaderboardResetTimer() {
    const timerContainer = document.getElementById('leaderboard-reset-timer');
    const timerDisplay = document.getElementById('reset-timer-display');
    if (!timerContainer || !timerDisplay) return;
    if (leaderboardTimerInterval) clearInterval(leaderboardTimerInterval);
// التحكم في وظيفة updateTimer - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
    const updateTimer = () => {
        const now = new Date();
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const diff = nextMonth - now;
        const oneWeekInMs = 7 * 24 * 60 * 60 * 1000;
        if (diff <= oneWeekInMs) {
            timerContainer.classList.remove('hidden');
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);
            timerDisplay.textContent = `${days}:${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        } else {
            timerContainer.classList.add('hidden');
        }
    };
    updateTimer();
    leaderboardTimerInterval = setInterval(updateTimer, 1000);
}
// التحكم في وظيفة renderLeaderboardList - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function renderLeaderboardList(docs, container, statusUpdates) {
    const template = document.getElementById('leaderboard-row-template');
    let r = 1;
    docs.forEach(doc => {
        const data = doc.data();
        const userId = doc.id;
        const correctCount = (data.monthlyStats && data.monthlyStats.correct) ? data.monthlyStats.correct : 0;
        const clone = template.content.cloneNode(true);
        const row = clone.querySelector('.leaderboard-row');
        const rankEl = clone.querySelector('.rank-icon');
        const avatarBox = clone.querySelector('.player-avatar-container');
        const nameEl = clone.querySelector('.player-name');
        const scoreEl = clone.querySelector('.player-score');
        const statusDot = clone.querySelector('.status-dot');
        const statusText = clone.querySelector('.status-text');
        nameEl.textContent = data.username;
        scoreEl.textContent = formatNumberAr(correctCount);
        const nameLen = (data.username || "").length;
        if (nameLen > 25) nameEl.classList.add('text-[10px]', 'leading-tight'); 
        else if (nameLen > 18) nameEl.classList.add('text-xs'); 
        else nameEl.classList.add('text-lg');
        row.style.cssText = ''; 
        row.className = `leaderboard-row flex justify-between items-center p-3 mb-3 rounded-xl border-2 transition transform hover:scale-[1.01] cursor-pointer group relative`;
row.style.setProperty('border-width', '0.3px', 'important');
        let medalHtml = `<span class="text-slate-500 font-mono font-bold text-sm w-6 text-center">#${formatNumberAr(r)}</span>`;
        if (r <= 3) {
            row.style.setProperty('background-image', 'linear-gradient(to right, #322d07, #000)', 'important');
            row.style.setProperty('background-color', 'transparent', 'important');
            if (r === 1) {
                medalHtml = '<span class="material-symbols-rounded text-amber-400">emoji_events</span>'; 
                row.style.setProperty('border-color', '#fbbf24', 'important');
                row.style.setProperty('box-shadow', '0 0 15px rgba(251, 191, 36, 0.3)', 'important');
            } 
            else if (r === 2) {
                medalHtml = '<span class="material-symbols-rounded text-slate-300">military_tech</span>';
                row.style.setProperty('border-color', '#cbd5e1', 'important');
                row.style.setProperty('box-shadow', '0 0 10px rgba(203, 213, 225, 0.3)', 'important');
            }
            else if (r === 3) {
                medalHtml = '<span class="material-symbols-rounded text-orange-700">military_tech</span>';
                row.style.setProperty('border-color', '#c2410c', 'important');
                row.style.setProperty('box-shadow', '0 0 10px rgba(194, 65, 12, 0.3)', 'important');
            }
        } else {
            row.style.setProperty('background-image', 'none', 'important');
            row.style.setProperty('background-color', '#0f172a', 'important'); 
            row.style.setProperty('border-color', '#1e293b', 'important');
        }
        rankEl.innerHTML = medalHtml;
        const pFrame = data.equippedFrame || 'default';
        avatarBox.innerHTML = getAvatarHTML(data.customAvatar, pFrame, "w-10 h-10");
        const userStatus = statusUpdates[userId];
        const isOnline = userStatus && userStatus.state === 'online';
        if (isOnline) {
            statusDot.className = "status-dot w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)] animate-pulse inline-block";
            statusText.className = "status-text text-[9px] text-green-400 font-bold leading-none pt-0.5";
            statusText.textContent = "نشط الآن";
        } else if (userStatus && userStatus.last_changed) {
            const timeDiff = Date.now() - userStatus.last_changed;
            let timeAgo = "منذ لحظات";
            if (timeDiff > 86400000) timeAgo = `منذ ${formatNumberAr(Math.floor(timeDiff / 86400000))} يوم`;
            else if (timeDiff > 3600000) timeAgo = `منذ ${formatNumberAr(Math.floor(timeDiff / 3600000))} ساعة`;
            else if (timeDiff > 60000) timeAgo = `منذ ${formatNumberAr(Math.floor(timeDiff / 60000))} دقيقة`;
            statusDot.className = "status-dot w-2 h-2 rounded-full bg-slate-500 opacity-50 inline-block";
            statusText.className = "status-text text-[9px] text-slate-500 opacity-80 leading-none pt-0.5";
            statusText.textContent = timeAgo;
        } else {
            statusDot.className = "status-dot w-2 h-2 rounded-full bg-slate-600 opacity-30 inline-block";
            statusText.className = "status-text text-[9px] text-slate-600 opacity-50 leading-none pt-0.5";
            statusText.textContent = "غير متاح";
        }
        row.onclick = () => showPlayerProfile(data);
        container.appendChild(clone);
        r++;
    });
}
// التحكم في وظيفة showPlayerProfile - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function showPlayerProfile(data){getEl('popup-player-name').textContent=data.username;getEl('popup-player-score').textContent=`${formatNumberAr(data.highScore)} نقطة`;if(data.customAvatar){getEl('popup-player-img').src=data.customAvatar;show('popup-player-img');hide('popup-player-icon')}else{hide('popup-player-img');show('popup-player-icon')}const bContainer=getEl('popup-player-badges');bContainer.innerHTML='';bContainer.className='grid grid-cols-3 gap-4 justify-items-center max-h-60 overflow-y-auto p-4 scrollbar-thin';let descBox=document.getElementById('profile-badge-desc-box');if(!descBox){descBox=document.createElement('div');descBox.id='profile-badge-desc-box';descBox.className='mt-4 p-3 bg-slate-900/50 rounded-lg border border-slate-700 text-center min-h-[4rem] flex items-center justify-center w-full';bContainer.parentNode.appendChild(descBox)}descBox.innerHTML='<p class="text-xs text-slate-500 animate-pulse">اضغط على أي وسام لمعرفة قصته</p>';if(data.badges&&data.badges.length>0){const bestBadges={};data.badges.forEach(bid=>{if(bid==='beginner')return;const[baseId,lvlPart]=bid.split('_lvl');const level=parseInt(lvlPart)||1;if(!bestBadges[baseId]||level>bestBadges[baseId].level){bestBadges[baseId]={id:bid,baseId:baseId,level:level}}});const finalBadges=Object.values(bestBadges);if(finalBadges.length===0){bContainer.innerHTML='<span class="col-span-3 text-xs text-slate-500 py-6">لم يحصل هذا اللاعب على أوسمة خاصة بعد.</span>'}else{const tpl=document.getElementById('mini-badge-template');finalBadges.forEach(item=>{const bObj=badgesMap[item.baseId];if(bObj){let tierName='برونزي',glowStyle='',tierColorHex='#b45309';if(item.level===2){tierName='فضي';glowStyle='box-shadow: 0 0 12px rgba(203, 213, 225, 0.6); border-color: #cbd5e1;';tierColorHex='#cbd5e1'}else if(item.level===3){tierName='ذهبي';glowStyle='box-shadow: 0 0 15px rgba(251, 191, 36, 0.8); border-color: #fbbf24;';tierColorHex='#fbbf24'}else if(item.level===4){tierName='ماسي';glowStyle='box-shadow: 0 0 15px rgba(34, 211, 238, 0.8); border-color: #22d3ee;';tierColorHex='#22d3ee'}else if(item.level===5){tierName='أسطوري';glowStyle='box-shadow: 0 0 20px rgba(239, 68, 68, 0.9); border-color: #ef4444; animation: pulse-slow 2s infinite;';tierColorHex='#ef4444'}else{glowStyle='box-shadow: 0 0 10px rgba(180, 83, 9, 0.4); border-color: #b45309;'}const clone=tpl.content.cloneNode(true);const ring=clone.querySelector('.badge-ring');const img=clone.querySelector('.badge-img');const name=clone.querySelector('.badge-name');const tier=clone.querySelector('.badge-tier');const root=clone.querySelector('.mini-badge');img.src=bObj.image;name.textContent=bObj.name;tier.textContent=`(${tierName})`;tier.style.color=tierColorHex;ring.style.cssText=glowStyle;root.onclick=()=>{const allRings=bContainer.querySelectorAll('.badge-ring');allRings.forEach(r=>r.style.transform='scale(1)');ring.style.transform='scale(1.15)';descBox.innerHTML=`<div class="fade-in"><strong class="text-amber-400 text-xs block mb-1 border-b border-amber-500/20 pb-1 mx-auto w-fit">${bObj.name}</strong><p class="text-xs text-slate-200 leading-relaxed"><span class="text-green-400 font-bold">"${bObj.desc}"</span></p></div>`;playSound('click')};bContainer.appendChild(clone)}})}}else{bContainer.innerHTML='<span class="col-span-3 text-xs text-slate-500 py-6">لا توجد أوسمة مكتسبة.</span>'}openModal('player-profile-modal')}
bind('nav-favs','click',()=>{openModal('fav-modal');const l=getEl('fav-list');l.innerHTML='';if(!userProfile.favorites||userProfile.favorites.length===0){l.innerHTML='<div class="flex flex-col items-center justify-center py-10 opacity-50"><span class="material-symbols-rounded text-4xl mb-2">favorite_border</span><p class="text-xs">لا توجد أسئلة مفضلة</p></div>';return}const tpl=document.getElementById('fav-item-template');userProfile.favorites.forEach((f,i)=>{const clone=tpl.content.cloneNode(true);clone.querySelector('.fav-q').textContent=f.question;clone.querySelector('.fav-a').textContent=`الإجابة: ${f.options[f.correctAnswer]}`;const btn=clone.querySelector('.fav-del-btn');btn.onclick=async()=>{userProfile.favorites.splice(i,1);try{await updateDoc(doc(db,"users",effectiveUserId),{favorites:userProfile.favorites});toast("تم الحذف");getEl('nav-favs').click()}catch(e){toast("خطأ","error")}};l.appendChild(clone)})});
bind('nav-mistakes', 'click', () => { toggleMenu(false); getEl('review-mistakes-btn').click(); });
bind('nav-settings', 'click', () => openModal('settings-modal'));
const savedFontSize = localStorage.getItem('app_font_size');
if (savedFontSize) {
    document.documentElement.style.setProperty('--base-size', savedFontSize + 'px');
    const slider = getEl('font-size-slider');
    const numDisplay = getEl('font-size-number');
    if (slider) slider.value = savedFontSize;
    if (numDisplay) numDisplay.textContent = savedFontSize;
}
bind('font-size-slider', 'input', (e) => {
    const newVal = e.target.value;
    document.documentElement.style.setProperty('--base-size', newVal + 'px');
    const numDisplay = getEl('font-size-number');
    if (numDisplay) numDisplay.textContent = newVal;
    localStorage.setItem('app_font_size', newVal);
});
// التحكم في وظيفة handleLogout - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
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
    let joinDateStr = "غير معروف";
    if (userProfile.createdAt) {
        const dateObj = userProfile.createdAt.toDate ? userProfile.createdAt.toDate() : new Date(userProfile.createdAt);
        joinDateStr = dateObj.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
    }
    getEl('profile-join-date').textContent = `انضم في: ${joinDateStr}`;
    const avatarContainer = document.querySelector('#user-modal .relative.w-24.h-24');
    const oldFrame = avatarContainer.querySelector('.avatar-frame-overlay');
    if (oldFrame) oldFrame.remove();
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
    const currentFrameId = userProfile.equippedFrame || 'default';
    if (currentFrameId !== 'default') {
        const frameObj = framesData.find(f => f.id === currentFrameId);
        if (frameObj) {
            const frameDiv = document.createElement('div');
            frameDiv.className = `avatar-frame-overlay ${frameObj.cssClass}`;
            frameDiv.style.pointerEvents = 'none'; 
            avatarContainer.appendChild(frameDiv);
        }
    }
    const stats = userProfile.stats || {};
    const totalQ = stats.totalQuestions || 0;
    const totalC = stats.totalCorrect || 0;
    const accuracy = totalQ > 0 ? Math.round((totalC / totalQ) * 100) : 0;
    getEl('profile-stat-score').textContent = formatNumberAr(userProfile.highScore);
    getEl('profile-stat-played').textContent = formatNumberAr(stats.quizzesPlayed || 0);
    getEl('profile-stat-correct').textContent = formatNumberAr(totalC);
    getEl('profile-stat-accuracy').textContent = `%${formatNumberAr(accuracy)}`;
    const badgesContainer = getEl('profile-badges-display');
    badgesContainer.innerHTML = '';
    badgesContainer.className = 'grid grid-cols-3 gap-4 justify-items-center bg-slate-900/50 p-4 rounded-xl border border-slate-800 min-h-[100px] max-h-[300px] overflow-y-auto';
    if (userProfile.badges && userProfile.badges.length > 0) {
        const bestBadges = {};
        userProfile.badges.forEach(bid => {
            if (bid === 'beginner') return;
            const [baseId, lvlPart] = bid.split('_lvl');
            const level = parseInt(lvlPart) || 1;
            if (!bestBadges[baseId] || level > bestBadges[baseId].level) {
                bestBadges[baseId] = { id: bid, baseId: baseId, level: level };
            }
        });
        const finalBadges = Object.values(bestBadges);
        if (finalBadges.length === 0) {
            badgesContainer.className = 'flex justify-center items-center bg-slate-900/50 p-4 rounded-xl border border-slate-800 min-h-[80px]';
            badgesContainer.innerHTML = '<span class="text-xs text-slate-500">لم تحصل على أوسمة خاصة بعد</span>';
        } else {
            finalBadges.forEach(item => {
                const bObj = badgesMap[item.baseId];
                if(bObj) {
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
                    const badgeDiv = document.createElement('div');
                    badgeDiv.className = 'flex flex-col items-center gap-2 group cursor-pointer';
                    badgeDiv.innerHTML = `
                        <div class="relative w-14 h-14 rounded-full border-2 bg-black transition transform group-hover:scale-110 duration-300" style="${glowStyle}">
                            <img src="${bObj.image}" class="w-full h-full object-cover rounded-full p-0.5">
                        </div>
                        <div class="text-center">
                            <span class="block text-[10px] text-white font-bold leading-tight">${bObj.name}</span>
                            <span class="block text-[9px] font-mono mt-0.5" style="color: ${tierColorHex}; opacity: 0.9">(${tierName})</span>
                        </div>
                    `;
                    badgesContainer.appendChild(badgeDiv);
                }
            });
        }
    } else {
        badgesContainer.className = 'flex justify-center items-center bg-slate-900/50 p-4 rounded-xl border border-slate-800 min-h-[80px]';
        badgesContainer.innerHTML = '<span class="text-xs text-slate-500">لا توجد أوسمة</span>';
    }
});
bind('save-user-btn', 'click', async () => { 
    const n = getEl('edit-username').value.trim();
    const updates = {};
    let change = false;
    if(n && n !== userProfile.username) { 
        updates.username = n; 
        userProfile.username = n; 
        change = true; 
    }
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
// التحكم في وظيفة getCurrentMonthKey - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function getCurrentMonthKey() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}
// التحكم في وظيفة saveMonthlyWinner - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
async function saveMonthlyWinner(monthKey) {
    try {
        const winnerDocRef = doc(db, "winners", monthKey);
        const winnerDocSnap = await getDoc(winnerDocRef);
        if (winnerDocSnap.exists()) {
            console.log(`🏆 فائز شهر ${monthKey} مسجل مسبقاً، لن يتم الاستبدال.`);
            return;
        }
        const q = query(collection(db, "users"), where("monthlyStats.key", "==", monthKey), orderBy("monthlyStats.correct", "desc"), limit(1));
        const s = await getDocs(q);
        if (!s.empty) {
            const winnerData = s.docs[0].data();
            const winnerId = s.docs[0].id;
            await setDoc(winnerDocRef, {
                userId: winnerId,
                username: winnerData.username || "لاعب مجهول",
                photoURL: winnerData.photoURL || "",
                score: winnerData.monthlyStats.correct,
                monthKey: monthKey,
                timestamp: serverTimestamp()
            });
            console.log(`🏆 تم حفظ فائز الشهر ${monthKey}: ${winnerData.username}`);
        }
    } catch(e) {
        console.error("Failed to save monthly winner:", e);
    }
}
let isBagSystemInitialized = false;
// التحكم في وظيفة openBag - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function openBag() {
    toggleMenu(false);
    if (!isBagSystemInitialized) {
        initBagSystem();
        isBagSystemInitialized = true;
    }
    updateBagState();
    openModal('bag-modal');
}
// التحكم في وظيفة initBagSystem - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function initBagSystem() {
    const invContainer = getEl('inventory-view');
    const existingList = getEl('inv-frames-grid-new');
    if (existingList) existingList.remove();
    const invGrid = document.createElement('div');
    invGrid.id = 'inv-frames-grid-new';
    invGrid.className = 'game-store-grid';
    const invHeader = document.createElement('h4');
    invHeader.className = "text-sm text-slate-400 mb-3 font-bold mt-4 border-t border-slate-700 pt-4";
    invHeader.textContent = "إطاراتي (اضغط للتجهيز)";
    invContainer.appendChild(invHeader);
    framesData.forEach(f => {
        const card = createGameItemCard(f, 'inventory');
        invGrid.appendChild(card);
    });
    invContainer.appendChild(invGrid);
    const shopContainer = getEl('shop-view');
    const existingShopGrid = getEl('shop-frames-grid-new');
    if (existingShopGrid) existingShopGrid.remove();
    const shopGrid = document.createElement('div');
    shopGrid.id = 'shop-frames-grid-new';
    shopGrid.className = 'game-store-grid';
    shopGrid.style.gridTemplateColumns = "repeat(2, 1fr)"; 
    const shopHeader = document.createElement('h4');
    shopHeader.className = "text-amber-400 text-sm font-bold mt-6 mb-3 flex items-center gap-1";
    shopHeader.innerHTML = `<span class="material-symbols-rounded">image</span> إطارات الأفاتار`;
    shopContainer.appendChild(shopHeader);
    framesData.forEach(f => {
        if (f.id === 'default') return;
        const card = createGameItemCard(f, 'shop');
        shopGrid.appendChild(card);
    });
    shopContainer.appendChild(shopGrid);
}
// التحكم في وظيفة createGameItemCard - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function createGameItemCard(fData,type){const tpl=document.getElementById('game-item-template');const clone=tpl.content.cloneNode(true);const btn=clone.querySelector('button');const prev=clone.querySelector('.item-preview');const name=clone.querySelector('.item-name');const act=clone.querySelector('.item-action');btn.id=`btn-${type}-${fData.id}`;prev.innerHTML=getAvatarHTML(userProfile.customAvatar,fData.id,"w-full h-full");name.textContent=fData.name;if(type==='shop'){act.innerHTML=`<span class="game-item-price text-[10px] bg-black/40 px-2 py-1 rounded text-amber-400 font-bold flex items-center gap-1 border border-white/5">${formatNumberAr(fData.price)} <span class="material-symbols-rounded text-[10px]">monetization_on</span></span>`}else{act.innerHTML='<div class="equip-badge hidden bg-green-500/20 p-1 rounded-full"><span class="material-symbols-rounded text-green-400 text-sm">check</span></div>'}btn.onclick=()=>{if(type==='inventory'){equipFrame(fData.id)}else{if(!btn.classList.contains('owned')){window.buyShopItem('frame',fData.price,fData.id)}}};return btn}
// التحكم في وظيفة updateBagState - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function updateBagState() {
    getEl('bag-user-score').textContent = formatNumberAr(userProfile.highScore);
    const inv = userProfile.inventory;
    getEl('inv-lives-count').textContent = formatNumberAr(inv.lives || 0);       
    getEl('inv-fifty-count').textContent = formatNumberAr(inv.helpers.fifty || 0); 
    getEl('inv-hint-count').textContent = formatNumberAr(inv.helpers.hint || 0);   
    getEl('inv-skip-count').textContent = formatNumberAr(inv.helpers.skip || 0);
    const ownedFrames = userProfile.inventory.frames || ['default'];
    const currentFrame = userProfile.equippedFrame;
    framesData.forEach(f => {
        const btn = document.getElementById(`btn-inventory-${f.id}`);
        if (!btn) return;
        if (ownedFrames.includes(f.id)) {
            btn.classList.remove('game-item-hidden');
        } else {
            btn.classList.add('game-item-hidden');
        }
        if (f.id === currentFrame) {
            btn.classList.add('equipped');
        } else {
            btn.classList.remove('equipped');
        }
        const avatarContainer = btn.querySelector('.avatar-wrapper');
        if(avatarContainer) {
             avatarContainer.outerHTML = getAvatarHTML(userProfile.customAvatar, f.id, "w-10 h-10");
        }
    });
    framesData.forEach(f => {
        if (f.id === 'default') return;
        const btn = document.getElementById(`btn-shop-${f.id}`);
        if (!btn) return;
        if (ownedFrames.includes(f.id)) {
            btn.classList.add('owned');
            const priceTag = btn.querySelector('.game-item-price');
            if(priceTag) {
                priceTag.style.background = 'transparent';
                priceTag.style.color = '#10b981';
                priceTag.textContent = 'مملوك';
            }
        } else {
            btn.classList.remove('owned');
        }
    });
}
// التحكم في وظيفة switchBagTab - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
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
// التحكم في وظيفة equipFrame - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
async function equipFrame(frameId) {
    userProfile.equippedFrame = frameId;
    updateProfileUI();
     updateBagState();  
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
            if (type === 'frame') { 
                if(!userProfile.inventory.frames) userProfile.inventory.frames = [];
                userProfile.inventory.frames.push(id);
                toast("تم شراء الإطار بنجاح! ");
            } else if(type === 'life') {
                userProfile.inventory.lives++;
                toast("تم شراء قلب إضافي ");
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
            updateQuestProgress(5, 1);
               try {
                await updateDoc(doc(db, "users", effectiveUserId), {
                    highScore: userProfile.highScore,
                    inventory: userProfile.inventory,
                    "stats.itemsBought": userProfile.stats.itemsBought
                });
                playSound('win');
                updateBagState(); 
                updateProfileUI(); 
                let itemName = type === 'frame' ? 'إطار أفاتار' : 'عنصر';
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
bind('tab-inventory', 'click', () => switchBagTab('inventory'));
bind('tab-shop', 'click', () => switchBagTab('shop'));
window.showConfirm = function(title, msg, icon, yesCallback) {
    const modal = document.getElementById('confirm-modal');
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-msg').textContent = msg;
    document.getElementById('confirm-icon').textContent = icon || 'help';
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
// التحكم في وظيفة bind - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function bind(id, ev, fn) { const el = getEl(id); if(el) el.addEventListener(ev, fn); }
// التحكم في وظيفة shuffleArray - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function shuffleArray(array) { for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; } }
// التحكم في وظيفة launchConfetti - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function launchConfetti() { const canvas = getEl('confetti-canvas'); const ctx = canvas.getContext('2d'); canvas.width = window.innerWidth; canvas.height = window.innerHeight; let particles = []; for(let i=0; i<100; i++) particles.push({x:Math.random()*canvas.width, y:Math.random()*canvas.height-canvas.height, c:['#fbbf24','#f59e0b','#ffffff'][Math.floor(Math.random()*3)], s:Math.random()*5+2, v:Math.random()*5+2}); function draw() { ctx.clearRect(0,0,canvas.width,canvas.height); particles.forEach(p => { ctx.fillStyle=p.c; ctx.beginPath(); ctx.arc(p.x,p.y,p.s,0,Math.PI*2); ctx.fill(); p.y+=p.v; if(p.y>canvas.height) p.y=-10; }); requestAnimationFrame(draw); } draw(); setTimeout(()=>canvas.width=0, 5000); }
bind('login-btn', 'click', handleLogin);
bind('register-btn', 'click', handleReg);
bind('show-register-btn', 'click', () => { hide('login-view'); show('register-view'); getEl('login-error-message').textContent=''; });
bind('show-login-btn', 'click', () => { hide('register-view'); show('login-view'); getEl('register-error-message').textContent=''; });
bind('btn-marathon-start', 'click', () => { 
    if (userProfile.wrongQuestionsBank && userProfile.wrongQuestionsBank.length > 0) {
        openModal('force-review-modal');
        return;
    }
    document.getElementById('marathon-rules-modal').classList.add('active'); 
});
bind('btn-marathon-confirm', 'click', startMarathon);
// التحكم في وظيفة showReviveModal - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function showReviveModal() {
    let modal = document.getElementById('revive-modal');
    if (modal) modal.remove();
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
                    ${formatNumberAr(userProfile.highScore)} <span class="material-symbols-rounded text-sm">monetization_on</span>
                </span>
            </div>
            <div class="space-y-3">
                <button onclick="window.buyLives(REVIVE_PRICES[0].amount, REVIVE_PRICES[0].cost)" class="w-full bg-slate-700 hover:bg-slate-600 border border-slate-600 p-3 rounded-xl flex justify-between items-center group transition">
                    <div class="flex items-center gap-2"><span class="material-symbols-rounded text-red-500">favorite</span><span class="text-white font-bold">${formatNumberAr(1)} قلب</span></div>
                    <span class="text-amber-400 font-bold text-sm bg-black/20 px-2 py-1 rounded">${formatNumberAr(50)} نقطة</span>
                </button>
                <button onclick="window.buyLives(REVIVE_PRICES[1].amount, REVIVE_PRICES[1].cost)" class="w-full bg-slate-700 hover:bg-slate-600 border border-slate-600 p-3 rounded-xl flex justify-between items-center group transition">
                    <div class="flex items-center gap-2"><div class="flex"><span class="material-symbols-rounded text-red-500">favorite</span><span class="material-symbols-rounded text-red-500 -mr-2">favorite</span></div><span class="text-white font-bold">${formatNumberAr(2)} قلب</span></div>
                    <span class="text-amber-400 font-bold text-sm bg-black/20 px-2 py-1 rounded">${formatNumberAr(90)} نقطة <span class="text-[10px] text-green-400">(وفر ${formatNumberAr(10)})</span></span>
                </button>
                <button onclick="window.buyLives(REVIVE_PRICES[2].amount, REVIVE_PRICES[2].cost)" class="w-full bg-slate-700 hover:bg-slate-600 border border-slate-600 p-3 rounded-xl flex justify-between items-center group transition">
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
// التحكم في وظيفة checkMarathonStatus - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function checkMarathonStatus() {
    const btn = getEl('btn-marathon-start');
    if (marathonInterval) clearInterval(marathonInterval);
    if (!userProfile || !userProfile.lastMarathonDate) {
        btn.disabled = false;
        btn.classList.remove('opacity-50', 'cursor-not-allowed');
btn.innerHTML = `<span class="text-lg">أكمل النور</span> <span class="material-symbols-rounded">local_fire_department</span>`;
        return;
    }
    const lastPlayed = userProfile.lastMarathonDate.toMillis ? userProfile.lastMarathonDate.toMillis() : new Date(userProfile.lastMarathonDate).getTime();
    const now = Date.now();
    const twentyFourHours = 1 * 60 * 60 * 1000;
    const diff = now - lastPlayed;
    if (diff < twentyFourHours) {
        btn.disabled = true;
        btn.classList.add('cursor-not-allowed');
// التحكم في وظيفة updateTimer - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
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
// التحكم في وظيفة pad - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
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
        btn.innerHTML = `<span class="text-lg">(أكمل النور)</span> <span class="material-symbols-rounded">directions_run</span>`;
    }
}
// التحكم في وظيفة checkWhatsNew - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
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
bind('btn-force-review-confirm', 'click', () => {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    getEl('review-mistakes-btn').click();
});
// التحكم في وظيفة formatNumberAr - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function formatNumberAr(num, compact = false) {
    if (num === null || num === undefined || isNaN(num)) return '٠';
    const map = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
// التحكم في وظيفة toAr - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
    const toAr = (n) => n.toString().replace(/\d/g, d => map[d]).replace(/,/g, '،');
    if (compact) {
        if (num >= 1000000) {
            return toAr((num / 1000000).toFixed(1)) + " مليون";
        }
        if (num >= 1000) {
            return toAr((num / 1000).toFixed(1)) + " ألف"; 
        }
    }
    return toAr(Number(num).toLocaleString('en-US'));
}
// التحكم في وظيفة sanitizeUserData - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function sanitizeUserData(data) {
    let wasFixed = false;
    const cleanData = { ...data };
    if (typeof cleanData.highScore !== 'number' || isNaN(cleanData.highScore)) {
        cleanData.highScore = 0;
        wasFixed = true;
    }
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
        if (!Array.isArray(cleanData.inventory.frames)) {
            cleanData.inventory.frames = ['default']; 
            wasFixed = true;
        }
    } 
    if (!cleanData.equippedFrame) {
        cleanData.equippedFrame = 'default';
        wasFixed = true;
    }
    if (!Array.isArray(cleanData.badges)) { cleanData.badges = ['beginner']; wasFixed = true; }
    if (!Array.isArray(cleanData.favorites)) { cleanData.favorites = []; wasFixed = true; }
    if (!Array.isArray(cleanData.seenQuestions)) { cleanData.seenQuestions = []; wasFixed = true; }
    if (!Array.isArray(cleanData.seenMarathonIds)) { cleanData.seenMarathonIds = []; wasFixed = true; }
    if (!Array.isArray(cleanData.wrongQuestionsBank)) { cleanData.wrongQuestionsBank = []; wasFixed = true; }
    return { cleanData, wasFixed };
}
const NOTIF_KEY = 'ahlulbayt_local_notifs_v1';
// التحكم في وظيفة addLocalNotification - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function addLocalNotification(title, body, icon='info') {
    let list = JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]');
    const newNotif = {
        id: Date.now(),
        title: title,
        body: body,
        icon: icon,
        time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        date: new Date().toLocaleDateString('ar-EG'),
        read: false
    };
    list.unshift(newNotif);
    if (list.length > 30) list = list.slice(0, 30);
    localStorage.setItem(NOTIF_KEY, JSON.stringify(list));
    updateNotifUI();
    playSound('click');
}
// التحكم في وظيفة updateNotifUI - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function updateNotifUI(){const list=JSON.parse(localStorage.getItem(NOTIF_KEY)||'[]');const badge=document.getElementById('notif-badge');const container=document.getElementById('notif-list');const unread=list.filter(n=>!n.read).length;if(unread>0){badge.classList.remove('hidden');badge.classList.add('pulse-red')}else{badge.classList.add('hidden');badge.classList.remove('pulse-red')}container.innerHTML='';if(list.length===0){container.innerHTML='<p class="text-center text-slate-500 text-xs py-6">لا توجد إشعارات</p>';return}const tpl=document.getElementById('notif-template');list.forEach(n=>{const clone=tpl.content.cloneNode(true);const item=clone.querySelector('.notif-item');const icon=clone.querySelector('.notif-icon');clone.querySelector('.notif-title').textContent=n.title;clone.querySelector('.notif-body').textContent=n.body;clone.querySelector('.notif-date').textContent=`${n.date} - ${n.time}`;icon.textContent=n.icon;let c='text-slate-400';if(n.icon==='emoji_events')c='text-amber-400';else if(n.icon==='monetization_on')c='text-green-400';else if(n.icon==='lock_reset')c='text-red-400';icon.classList.add(c);if(n.read){item.classList.add('opacity-70','border-transparent')}else{item.classList.add('bg-slate-800/30','border-amber-500')}container.appendChild(clone)})}
bind('notif-btn', 'click', (e) => {
    e.stopPropagation();
    const dropdown = document.getElementById('notif-dropdown');
    const isHidden = dropdown.classList.contains('hidden');
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    if (isHidden) {
        dropdown.classList.remove('hidden');
        updateNotifUI();
        let list = JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]');
        if (list.some(n => !n.read)) {
            list.forEach(n => n.read = true);
            localStorage.setItem(NOTIF_KEY, JSON.stringify(list));
            document.getElementById('notif-badge').classList.add('hidden');
            document.getElementById('notif-badge').classList.remove('pulse-red');
        }
    } else {
        dropdown.classList.add('hidden');
    }
});
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
document.addEventListener('DOMContentLoaded', () => {
    updateNotifUI();
});
// التحكم في وظيفة getBadgeProgress - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function getBadgeProgress(badge) {
    const stats = userProfile.stats || {};
    let currentScore = 0;
    if (badge.type === 'topic') {
        if (stats.topicCorrect) {
            const categorySubTopics = topicsData[badge.topicKey] || [];
            Object.keys(stats.topicCorrect).forEach(playedTopic => {
                const pTopic = playedTopic.trim();
                const bKey = badge.topicKey.trim();
                const isDirectMatch = pTopic === bKey || pTopic.includes(bKey) || bKey.includes(pTopic);
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
    let activeLevel = badge.levels[0]; 
    let currentTierColor = 'locked';   
    let nextTierLabel = badge.levels[0].label;
    for (let i = 0; i < badge.levels.length; i++) {
        const level = badge.levels[i];
        if (currentScore >= level.target) {
            if (i === badge.levels.length - 1) {
                activeLevel = level;
                currentTierColor = level.color;
                nextTierLabel = 'مكتمل';
            } else {
                activeLevel = badge.levels[i + 1];
                currentTierColor = level.color; 
                nextTierLabel = badge.levels[i + 1].label;
            }
        } else {
            activeLevel = level;
            if (i > 0) currentTierColor = badge.levels[i-1].color;
            nextTierLabel = level.label;
            break; 
        }
    }
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
// التحكم في وظيفة sortBadgesSmartly - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function sortBadgesSmartly() {
    return badgesData.sort((a, b) => {
        const progA = getBadgeProgress(a);
        const progB = getBadgeProgress(b);
        const finishedA = progA.isMaxed;
        const finishedB = progB.isMaxed;
        if (finishedA && !finishedB) return 1;
        if (!finishedA && finishedB) return -1;
        return progB.percent - progA.percent; 
    });
}
// التحكم في وظيفة checkAndUnlockBadges - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
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
            addLocalNotification('إنجاز جديد 🏆', `مبروك! حصلت على وسام "${bName}" - ${lName}`, 'emoji_events');
            window.rewardQueue.push(unlock);
        });
        await updateDoc(doc(db, "users", effectiveUserId), {
            badges: userProfile.badges,
            highScore: userProfile.highScore,
            inventory: userProfile.inventory
        });
        updateProfileUI();
        processRewardQueue();
        return true;
    }
    return false;
}
// التحكم في وظيفة processRewardQueue - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function processRewardQueue() {
    if (window.rewardQueue.length === 0) return;
    const nextReward = window.rewardQueue.shift();
    showRewardModal(nextReward.badge, nextReward.level);
    playSound('applause');
}
// التحكم في وظيفة showRewardModal - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
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
// التحكم في وظيفة showMotivator - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function showMotivator() {
    const candidates = badgesData.filter(b => {
        const prog = getBadgeProgress(b);
        return !prog.isMaxed && b.type !== 'streak';
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
    if (quizState.active) {
        window.history.pushState({ view: 'playing' }, "", "");
        window.showConfirm(
            "مغادرة المسابقة",
            "هل تريد الانسحاب؟ سيتم احتساب النقاط والإجابات الصحيحة الحالية.",
            "logout",
            async () => {
                quizState.active = false; 
                if (quizState.score > 0 || quizState.correctCount > 0) {
                    try {
                        const userRef = doc(db, "users", effectiveUserId);
                        const currentTopic = quizState.contextTopic;
                        const safeCorrect = quizState.correctCount || 0;
                        const updates = {
                            highScore: increment(quizState.score),
                            "stats.quizzesPlayed": increment(1),
                            "stats.totalCorrect": increment(safeCorrect),
                            "stats.totalQuestions": increment(quizState.idx)
                        };
                        if (currentTopic && currentTopic !== 'عام' && currentTopic !== 'مراجعة الأخطاء') {
                            updates[`stats.topicCorrect.${currentTopic}`] = increment(safeCorrect);
                        }
                        const wKey = getCurrentWeekKey();
                        let newWeekly = userProfile.weeklyStats || { key: wKey, correct: 0 };
                        if (newWeekly.key !== wKey) newWeekly = { key: wKey, correct: 0 };
                        newWeekly.correct += safeCorrect;
                        updates.weeklyStats = newWeekly;
                        const mKey = getCurrentMonthKey();
                        let newMonthly = userProfile.monthlyStats || { key: mKey, correct: 0 };
                        if (newMonthly.key !== mKey) newMonthly = { key: mKey, correct: 0 };
                        newMonthly.correct += safeCorrect;
                        updates.monthlyStats = newMonthly;
                        await updateDoc(userRef, updates);
                        userProfile.highScore = (Number(userProfile.highScore) || 0) + quizState.score;
                        if(userProfile.stats) {
                            userProfile.stats.totalCorrect = (userProfile.stats.totalCorrect || 0) + safeCorrect;
                            if (currentTopic && currentTopic !== 'عام') {
                                userProfile.stats.topicCorrect[currentTopic] = (userProfile.stats.topicCorrect[currentTopic] || 0) + safeCorrect;
                            }
                        }
                        userProfile.weeklyStats = newWeekly;
                        userProfile.monthlyStats = newMonthly;
                        toast(`تم حفظ ${quizState.score} نقطة و ${safeCorrect} إجابة`, "success");
                    } catch (e) { console.error(e); }
                }
                navToHome();
            }
        );
    }
document.addEventListener('click', (e) => {
    const isOverlay = e.target.classList.contains('modal-overlay');
    const isSideMenuOverlay = (e.target.id === 'side-menu-overlay');
    if (isOverlay || isSideMenuOverlay) {
        if (e.target.id === 'force-review-modal' || e.target.id === 'auth-loading' || e.target.id === 'revive-modal') {
            if(window.playSound) window.playSound('lose');
            const box = e.target.querySelector('.modal-box');
            if(box) { box.classList.add('shake'); setTimeout(()=>box.classList.remove('shake'), 500); }
            return;
        }
        if(isOverlay) e.target.classList.remove('active');
        if(isSideMenuOverlay) toggleMenu(false);
    }
});
// التحكم في وظيفة animateValue - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function animateValue(obj, start, end, duration) {
    if(!obj) return;
    if(start === end) { obj.textContent = formatNumberAr(end); return; }
    let startTimestamp = null;
// التحكم في وظيفة step - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const currentVal = Math.floor(progress * (end - start) + start);
        obj.textContent = formatNumberAr(currentVal);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.textContent = formatNumberAr(end);
        }
    };
    window.requestAnimationFrame(step);
}
// التحكم في وظيفة renderSkeleton - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function renderSkeleton(type, count=5) {
    let html = '';
    if (type === 'leaderboard') {
        const container = getEl('leaderboard-list');
        if(!container) return;
        container.innerHTML = '';
        container.classList.remove('hidden');
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
        getEl('question-text').innerHTML = '<div class="skeleton sk-line long mx-auto mb-2"></div><div class="skeleton sk-line short mx-auto"></div>';
                const box = getEl('options-container');
    box.innerHTML = ''; 
    if (quizState.mode === 'marathon') {
        box.classList.add('options-grid-mode');
        box.classList.remove('space-y-1', 'space-y-2', 'space-y-3'); 
    } else {
        box.classList.remove('options-grid-mode');
        box.classList.add('space-y-1'); 
    }
    box.innerHTML = '';
        for(let i=0; i<4; i++) {
            box.innerHTML += `<div class="skeleton sk-btn"></div>`;
        }
    }
}
let introPlayed = false;
// التحكم في وظيفة manageAudioSystem - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function manageAudioSystem(action) {
    if (isMuted) return;
    const intro = document.getElementById('audio-intro');
    const quizAudio = document.getElementById('audio-quiz');
    if (action === 'start_intro') {
        if (!introPlayed && intro) {
            intro.play().catch(e => console.log("Waiting for interaction"));
            introPlayed = true;
        }
    } 
    else if (action === 'start_quiz') {
        if (intro) { intro.pause(); intro.currentTime = 0; }
        if (quizAudio) quizAudio.play().catch(console.error);
    } 
    else if (action === 'stop_quiz') {
        if (quizAudio) { quizAudio.pause(); quizAudio.currentTime = 0; }
    }
}
// التحكم في وظيفة firstClickHandler - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
document.addEventListener('click', function firstClickHandler() {
    manageAudioSystem('start_intro');
    document.removeEventListener('click', firstClickHandler);
});
const muteToggleBtn = document.getElementById('mute-toggle');
if(muteToggleBtn) {
    muteToggleBtn.onchange = () => { 
        isMuted = !muteToggleBtn.checked; 
        const intro = document.getElementById('audio-intro');
        const quizAudio = document.getElementById('audio-quiz');
        if(isMuted) {
            if(intro) intro.pause();
            if(quizAudio) quizAudio.pause();
        } else {
            if (quizState.active) {
                if(quizAudio) quizAudio.play();
            } 
        }
    };
}
document.addEventListener('click', (e) => {
    const ripple = document.createElement('div');
    ripple.className = 'touch-ripple';
    ripple.style.left = `${e.pageX}px`;
    ripple.style.top = `${e.pageY}px`;
    document.body.appendChild(ripple);
    setTimeout(() => {
        ripple.remove();
    }, 600);
});
// التحكم في وظيفة typeWriter - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
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
// التحكم في وظيفة showFloatingFeedback - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function showFloatingFeedback(element, text, colorClass) {
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = `float-feedback ${colorClass}`;
    el.textContent = text.replace(/\d/g, d => ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'][d]);
    el.style.left = `${rect.left + rect.width / 2 - 20}px`; 
    el.style.top = `${rect.top}px`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1200);
}
window.checkAndShowDailyReward = function() {
    if (!userProfile) return;
    const today = new Date().toLocaleDateString('en-CA');
    const lastClaimDate = userProfile.lastDailyRewardDate || "";
    if (lastClaimDate !== today) {
        setTimeout(() => {
            const modal = document.getElementById('daily-reward-modal');
            if(modal) {
                modal.classList.add('active');
                playSound('streak');
            }
        }, 1500);
    }
};
window.claimDailyReward = async function() {
    const today = new Date().toLocaleDateString('en-CA');
    const modal = document.getElementById('daily-reward-modal');
    const btn = modal.querySelector('button');
    btn.disabled = true;
    btn.textContent = "جاري الاستلام...";
    try {
        userProfile.highScore += 200;
        userProfile.inventory.lives = (userProfile.inventory.lives || 0) + 1;
        userProfile.lastDailyRewardDate = today;
        await updateDoc(doc(db, "users", effectiveUserId), {
            highScore: userProfile.highScore,
            "inventory.lives": userProfile.inventory.lives,
            lastDailyRewardDate: today
        });
        updateProfileUI();
        playSound('applause');
        launchConfetti();
        toast("تم استلام 200 نقطة وقلب إضافي! 🎁");
        addLocalNotification('مكافأة يومية', 'تم استلام الجائزة اليومية', 'card_giftcard');
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
        newPassInput.value = '';
    } catch(e) {
        console.error(e);
        toast("فشل التحديث", "error");
    } finally {
        btn.disabled = false;
        btn.textContent = "تحديث";
    }
});
bind('nav-contact', 'click', () => {
    toggleMenu(false);
    openModal('contact-modal');
    if(userProfile) {
        getEl('contact-username').value = userProfile.username;
    }
    getEl('contact-msg-body').value = '';
    getEl('contact-title').value = '';
    getEl('contact-note').value = '';
    getEl('contact-feedback').textContent = '';
});
bind('btn-send-contact', 'click', async () => {
    const msgBody = getEl('contact-msg-body').value.trim();
    const title = getEl('contact-title').value.trim();
    const note = getEl('contact-note').value.trim();
    const feedback = getEl('contact-feedback');
    const btn = getEl('btn-send-contact');
    if (!msgBody || !title) {
        feedback.textContent = "يرجى كتابة نص الرسالة والعنوان";
        feedback.className = "text-center text-xs mt-3 h-4 text-red-400 font-bold";
        return;
    }
    btn.disabled = true;
    const oldBtnContent = btn.innerHTML;
    btn.innerHTML = '<span class="material-symbols-rounded animate-spin">autorenew</span> جاري الإرسال...';
    const fakeReportData = {
        questionId: "CONTACT_MSG",
        topic: `📩 رسالة: ${title}`,
        questionText: `${msgBody}\n\n📝 ملاحظة إضافية:\n${note || 'لا يوجد'}`,
        reportedByUserId: effectiveUserId,
        reportedByUsername: userProfile.username,
        timestamp: serverTimestamp()
    };
    try {
        await setDoc(doc(collection(db, "reports")), fakeReportData);
        toast("✅ تم إرسال رسالتك للمطور بنجاح!");
        playSound('win');
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    } catch (e) {
        console.error("Error sending contact msg:", e);
        feedback.textContent = "فشل الإرسال، تأكد من الاتصال بالإنترنت";
        feedback.className = "text-center text-xs mt-3 h-4 text-red-400 font-bold";
    } finally {
        btn.disabled = false;
        btn.innerHTML = oldBtnContent;
    }
});
// التحكم في وظيفة updateOnlineStatus - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function updateOnlineStatus() {
    const banner = document.getElementById('offline-banner');
    if (!banner) return;
    if (navigator.onLine) {
        banner.classList.remove('show-offline');
        banner.classList.add('hidden');
    } else {
        banner.classList.remove('hidden');
        setTimeout(() => {
            banner.classList.add('show-offline');
        }, 10);
        if(typeof toast === 'function') toast("انقطع الاتصال بالإنترنت ", "error");
    }
}
window.addEventListener('online', () => {
    updateOnlineStatus();
    if(typeof toast === 'function') toast("عاد الاتصال! تمت المزامنة ", "success");
});
window.addEventListener('offline', updateOnlineStatus);
document.addEventListener('DOMContentLoaded', updateOnlineStatus);
bind('bottom-leaderboard-btn', 'click', () => {
    if(typeof toggleMenu === 'function') toggleMenu(false);
    hide('welcome-area');
    hide('quiz-proper');
    hide('results-area');
    hide('login-area');
    hide('auth-loading');
    hide('achievements-view');
    hide('bottom-nav');
    show('leaderboard-view');
    loadLeaderboard();
    startLeaderboardResetTimer();
    window.history.pushState({ view: 'leaderboard' }, "", "");
});
bind('btn-back-leaderboard', 'click', () => {
    hide('leaderboard-view');
    navToHome(); 
});
bind('bottom-bag-btn', 'click', () => {
    toggleMenu(false);
    openBag();
});
window.claimSingleReward = claimSingleReward;
window.claimGrandPrize = claimGrandPrize;
window.buyShopItem = buyShopItem;
// التحكم في وظيفة checkContentAvailability - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function checkContentAvailability(topicName) {
    if (!topicName || topicName === "عام" || topicName === "random") return null;
    const audioId = findContentId(topicName, audioLibrary);
    const pdfId = findContentId(topicName, pdfLibrary);
    const hasAudio = (audioId !== null && audioId !== undefined && audioId !== "");
    const hasPdf = (pdfId !== null && pdfId !== undefined && pdfId !== "");
    if (hasAudio || hasPdf) {
        return { 
            audioId: hasAudio ? audioId : null, 
            pdfId: hasPdf ? pdfId : null 
        };
    }
    return null;
}
// التحكم في وظيفة handleLearnClick - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function handleLearnClick(e) {
    e.preventDefault();
    const categorySelect = document.getElementById('category-select');
    const topicSelect = document.getElementById('topic-select');
    const category = categorySelect ? categorySelect.value : "";
    const topicVal = topicSelect ? topicSelect.value : "";
    if (!category || category === 'random' || !topicVal) {
        toast("اختر القسم والموضوع اولا", "error");
        return;
    }
    const finalTopic = topicVal; 
    const content = checkContentAvailability(finalTopic);
    if (content) {
        const modal = document.getElementById('learn-mode-modal');
        if (!modal) {
            console.error("❌ خطأ: نافذة التعلم (ID: learn-mode-modal) غير موجودة في HTML");
            return;
        }
        openLearnModal(finalTopic, content.audioId, content.pdfId);
    } else {
        toast(`عذراً، محتوى "التعلم" لهذا الموضوع قيد التجهيز ⏳`, "info");
    }
}
// التحكم في وظيفة openLearnModal - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function openLearnModal(topic, audioId, pdfId) {
    const modal = document.getElementById('learn-mode-modal');
    const titleEl = document.getElementById('learn-topic-title');
    const btnListen = document.getElementById('btn-mode-listen');
    const btnRead = document.getElementById('btn-mode-read');
    if (!modal) return;
    if (titleEl) titleEl.textContent = topic;
    if (btnListen) {
        if (audioId !== null && audioId !== undefined) {
            btnListen.onclick = () => {
                modal.classList.add('hidden'); 
                modal.classList.remove('active');
                modal.style.display = 'none'; 
                audioPlayer.playTrack(String(audioId), topic); 
            };
            btnListen.classList.remove('opacity-50', 'cursor-not-allowed');
            btnListen.disabled = false;
        } else {
            btnListen.onclick = null;
            btnListen.classList.add('opacity-50', 'cursor-not-allowed');
            btnListen.disabled = true;
        }
    }
    if (btnRead) {
        if (pdfId !== null && pdfId !== undefined) {
            btnRead.onclick = () => {
                modal.classList.add('hidden'); 
                modal.classList.remove('active');
                modal.style.display = 'none'; 
                pdfViewer.loadDocument(String(pdfId), topic); 
            };
            btnRead.classList.remove('opacity-50', 'cursor-not-allowed');
            btnRead.disabled = false;
        } else {
            btnRead.onclick = null;
            btnRead.classList.add('opacity-50', 'cursor-not-allowed');
            btnRead.disabled = true;
        }
    }
    modal.classList.remove('hidden');
    modal.classList.add('active');
    modal.style.display = 'flex';
}
// التحكم في وظيفة handlePdfReward - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
async function handlePdfReward() {
    const btn = document.getElementById('pdf-finish-btn');
    const bookId = pdfViewer.currentPdfId; 
    const bookTitle = document.getElementById('pdf-topic-title').textContent || "كتاب";
    if (!btn || btn.disabled) return;
    if (pdfViewer.isRewardClaimed) {
        if(window.toast) window.toast("تم استلام المكافأة مسبقاً", "info");
        return;
    }
    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-rounded animate-spin">refresh</span> جاري التحقق...`;
    try {
        if (!effectiveUserId) {
            if(window.toast) window.toast("يجب تسجيل الدخول لاحتساب النقاط", "warning");
            btn.disabled = false;
            btn.innerHTML = "استلام المكافأة";
            return;
        }
        const historyRef = doc(db, "users", effectiveUserId, "read_history", bookId);
        const docSnap = await getDoc(historyRef);
        if (docSnap.exists()) {
            if(window.toast) window.toast("⚠️ لقد استلمت جائزة هذا الكتاب مسبقاً!", "error");
            pdfViewer.checkRewardStatus(bookId);
            return; 
        }
        const pointsToAdd = 50;
        const wKey = getCurrentWeekKey();
        let wStats = userProfile.weeklyStats || { key: wKey, correct: 0 };
        if (wStats.key !== wKey) wStats = { key: wKey, correct: 0 };
        wStats.correct += pointsToAdd;
        const mKey = getCurrentMonthKey();
        let mStats = userProfile.monthlyStats || { key: mKey, correct: 0 };
        if (mStats.key !== mKey) mStats = { key: mKey, correct: 0 };
        mStats.correct += pointsToAdd;
        await setDoc(historyRef, {
            title: bookTitle,
            claimedAt: serverTimestamp(),
            points: pointsToAdd,
            type: 'book_reward'
        });
        await updateDoc(doc(db, "users", effectiveUserId), {
            highScore: increment(pointsToAdd),
            "stats.totalReadings": increment(1),
            "stats.totalCorrect": increment(pointsToAdd),
            weeklyStats: wStats,
            monthlyStats: mStats
        });
        userProfile.highScore = (userProfile.highScore || 0) + pointsToAdd;
        userProfile.stats.totalCorrect = (userProfile.stats.totalCorrect || 0) + pointsToAdd;
        userProfile.weeklyStats = wStats;
        userProfile.monthlyStats = mStats;
        pdfViewer.isRewardClaimed = true; 
        if (typeof updateProfileUI === 'function') updateProfileUI();
        if(window.playSound) window.playSound('win');
        if(window.toast) window.toast(`🎉 ممتاز! أضيفت ${pointsToAdd} نقطه`, "success");
        btn.innerHTML = `<span>تم الاستلام</span><span class="material-symbols-rounded">check_circle</span>`;
        btn.classList.add('bg-slate-700', 'text-slate-400', 'cursor-not-allowed');
        setTimeout(() => {
            if(pdfViewer) pdfViewer.close();
        }, 1500);
    } catch (error) {
        console.error("Reward Error:", error);
        if(window.toast) window.toast("حدث خطأ في الاتصال", "error");
        btn.disabled = false;
        btn.innerHTML = "حاول مرة أخرى";
    }
}
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 جاري تهيئة نظام التعلم الذكي...");
    const learnBtn = document.getElementById('ai-learn-btn');
    if (learnBtn) {
        const newBtn = learnBtn.cloneNode(true);
        learnBtn.parentNode.replaceChild(newBtn, learnBtn);
        newBtn.addEventListener('click', handleLearnClick);
        console.log("✅ زر التعلم جاهز.");
    }
    const rewardBtn = document.getElementById('pdf-finish-btn');
    if (rewardBtn) {
        rewardBtn.onclick = handlePdfReward;
    }
    const closeLearnModalBtn = document.getElementById('close-learn-modal');
    if(closeLearnModalBtn) {
        closeLearnModalBtn.onclick = () => {
            document.getElementById('learn-mode-modal').classList.add('hidden');
        };
    }
});
window.toast = function(msg, type = 'info', forceSave = false) {
    let borderColor = 'border-slate-600'; 
    let barColor = 'bg-slate-600';
    let iconName = ''; 
    if (type === 'success') {
        borderColor = 'border-green-500';
        barColor = 'bg-green-500';
        iconName = 'check_circle';
    } else if (type === 'error') {
        borderColor = 'border-red-600';
        barColor = 'bg-red-600';
        iconName = 'warning';
    } else if (type === 'gold' || msg.includes('نقاط') || msg.includes('مكافأة')) {
        borderColor = 'border-amber-400';
        barColor = 'bg-amber-400';
        iconName = 'monetization_on';
        type = 'gold'; 
    }
    const box = document.createElement('div');
    box.className = `fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] 
                     bg-black text-white px-6 py-3 rounded-sm shadow-2xl 
                     flex flex-col items-center justify-center 
                     min-w-[200px] w-fit max-w-[85vw] 
                     border border-opacity-50 ${borderColor}`;
    box.innerHTML = `
        <span class="text-base font-bold text-center leading-relaxed tracking-wide break-words w-full" 
              style="font-family: 'Amiri', serif;">
            ${msg}
        </span>
        <div class="absolute bottom-0 left-0 h-[3px] w-full ${barColor} opacity-80" id="toast-progress"></div>
    `;
    document.body.appendChild(box);
    requestAnimationFrame(() => {
        box.animate([
            { transform: 'translate(-50%, 20px)', opacity: 0 },
            { transform: 'translate(-50%, 0)', opacity: 1 }
        ], { duration: 300, easing: 'ease-out', fill: 'forwards' });
        const bar = box.querySelector('#toast-progress');
        bar.style.transition = "width 3000ms linear";
        bar.style.width = "100%";
        requestAnimationFrame(() => {
            bar.style.width = "0%";
        });
    });
    const isGameplaySpam = (msg.includes('إجابة صحيحة') || msg.includes('إجابة خاطئة')) && !msg.includes('نقاط');
    if (forceSave || type === 'gold' || type === 'error' || (type === 'success' && !isGameplaySpam)) {
        if (typeof addLocalNotification === 'function') {
            addLocalNotification(
                type === 'error' ? 'تنبيه' : (type === 'gold' ? 'مكافأة' : 'إشعار'), 
                msg, 
                iconName || 'info'
            );
        }
    }
    setTimeout(() => {
        const fadeOut = box.animate([
            { transform: 'translate(-50%, 0)', opacity: 1 },
            { transform: 'translate(-50%, 20px)', opacity: 0 }
        ], { duration: 300, easing: 'ease-in', fill: 'forwards' });
        fadeOut.onfinish = () => box.remove();
    }, 3000);
};
// التحكم في وظيفة renderPdfLibrary - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function renderPdfLibrary(){const c=document.getElementById('pdf-list-container');if(!c)return;c.innerHTML='';const tpl=document.getElementById('book-item-template');pdfLibrary.forEach(b=>{const clone=tpl.content.cloneNode(true);const root=clone.querySelector('.book-card');const img=clone.querySelector('.book-img');const title=clone.querySelector('.book-title');img.src=b.cover;title.textContent=b.title;root.onclick=()=>{if(window.openPdfViewer)window.openPdfViewer(b.url,b.title);else window.open(b.url,'_blank')};c.appendChild(clone)})}
// التحكم في وظيفة renderAudioLibrary - قم بتعديل الكود هنا لتغيير سلوك هذه الدالة
function renderAudioLibrary(){const c=document.getElementById('audio-list-container');if(!c)return;c.innerHTML='';const tpl=document.getElementById('audio-item-template');audioLibrary.forEach((track,idx)=>{const clone=tpl.content.cloneNode(true);const item=clone.querySelector('.audio-item');const title=clone.querySelector('.audio-title');const icon=clone.querySelector('.audio-icon');const wave=clone.querySelector('.audio-wave');title.textContent=track.title;item.id=`audio-track-${idx}`;item.onclick=()=>{document.querySelectorAll('.audio-wave').forEach(w=>w.classList.add('opacity-0'));document.querySelectorAll('.audio-icon').forEach(i=>{i.textContent='play_arrow';i.classList.remove('text-amber-400')});if(window.currentAudioSrc===track.url&&!window.audioPlayer.paused){window.audioPlayer.pause();icon.textContent='play_arrow'}else{if(window.playAudio)window.playAudio(track.url);icon.textContent='pause';icon.classList.add('text-amber-400');wave.classList.remove('opacity-0');window.currentAudioSrc=track.url}};c.appendChild(clone)})}
bind('nav-achievements', 'click', () => {
    toggleMenu(false);
    hide('welcome-area');
    hide('quiz-proper');
    hide('results-area');
    hide('login-area');
    hide('auth-loading');
    show('achievements-view');
    window.history.pushState({ view: 'achievements' }, "", "");
});
bind('btn-back-achievements', 'click', () => {
    hide('achievements-view');
    navToHome(); 
});
bind('nav-achievements', 'click', () => {
    if(typeof toggleMenu === 'function') toggleMenu(false);
    hide('welcome-area');
    hide('quiz-proper');
    hide('results-area');
    hide('login-area');
    hide('auth-loading');
    hide('bottom-nav');
    show('achievements-view');
    renderAchievementsView(typeof userProfile !== 'undefined' ? userProfile : null);
    window.history.pushState({ view: 'achievements' }, "", "");
});
if (window.initNotificationSystem) {
    window.initNotificationSystem();
    if (window.showWelcomeNotification) {
        window.showWelcomeNotification();
    }
}
window.CHEAT_MANAGER = {
    clicks: 0,
    timer: null,
    attachListener: function(elementId) {
        const btn = document.getElementById(elementId);
        if (!btn) return;
        btn.addEventListener('click', (e) => {
            this.clicks++;
            if (this.timer) clearTimeout(this.timer);
            this.timer = setTimeout(() => { this.clicks = 0; }, 1000); 
            if (this.clicks === 7) { 
                this.showPanel();
                this.clicks = 0;
            }
        });
    },
    init: function() {
        this.attachListener('notif-btn');
        this.attachListener('live-score-text');
        const appTitle = document.querySelector('#welcome-area h1');
        if (appTitle) {
            appTitle.addEventListener('click', () => {
                this.clicks++;
                if (this.timer) clearTimeout(this.timer);
                this.timer = setTimeout(() => { this.clicks = 0; }, 1000); 
                if (this.clicks === 7) { this.showPanel(); this.clicks = 0; }
            });
        }
    },
    showPanel: function() {
        if (document.getElementById('dev-cheat-panel')) return;
        const div = document.createElement('div');
        div.id = 'dev-cheat-panel';
        div.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: rgba(15, 23, 42, 0.98); border: 2px solid #ef4444; border-radius: 15px;
            padding: 20px; z-index: 10000; width: 320px; text-align: center;
            box-shadow: 0 0 50px rgba(239, 68, 68, 0.3); backdrop-filter: blur(10px);
            max-height: 80vh; overflow-y: auto;
        `;
        div.innerHTML = `
            <h3 class="text-red-500 font-bold text-xl mb-4 flex items-center justify-center gap-2">
                <span class="material-symbols-rounded">admin_panel_settings</span> أدوات المطور
            </h3>
            <div class="flex flex-col gap-2">
                <button id="btn-update-counts" onclick="window.CHEAT_MANAGER.updateSystemCounts()" class="p-3 bg-slate-800 border border-amber-500 rounded text-amber-400 font-bold hover:bg-slate-700 transition flex items-center justify-center gap-2">
                    <span class="material-symbols-rounded">sync</span> تحديث عدادات الأسئلة
                </button>
                <div class="h-px bg-slate-700 my-2"></div>
                <button onclick="window.CHEAT_MANAGER.revealAnswer()" class="p-2 bg-slate-800 border border-slate-600 rounded text-blue-300 hover:bg-slate-700 transition">👁️ كشف الإجابة</button>
                <button onclick="window.CHEAT_MANAGER.resetMarathon()" class="p-2 bg-slate-800 border border-slate-600 rounded text-blue-400 hover:bg-slate-700 transition">⏱️ تصفير الماراثون</button>
                <button onclick="window.CHEAT_MANAGER.resetDailyQuests()" class="p-2 bg-slate-800 border border-slate-600 rounded text-green-400 hover:bg-slate-700 transition">📅 تصفير المهام</button>
                <button onclick="window.CHEAT_MANAGER.completeAllQuests()" class="p-2 bg-slate-800 border border-slate-600 rounded text-purple-400 hover:bg-slate-700 transition">✅ إكمال المهام</button>
                <button onclick="document.getElementById('dev-cheat-panel').remove()" class="mt-4 text-sm text-slate-500 hover:text-white border-t border-slate-700 pt-2 w-full">إغلاق</button>
            </div>
        `;
        document.body.appendChild(div);
        if (typeof playSound === 'function') playSound('win');
    },
    updateSystemCounts: async function() {
        const btn = document.getElementById('btn-update-counts');
        if(btn) {
            btn.disabled = true;
            btn.innerHTML = `<span class="material-symbols-rounded animate-spin">autorenew</span> جاري الحساب...`;
        }
        try {
            const files = [
                "infallibles_all.json",
                "prophets.json",
                "personalities.json",
                "quran_nahj.json",
                "aqida_fiqh.json",
                "mahdi_culture.json",
                "history_battles.json",
                "dua_ziyarat.json"
            ];
            const counts = {};
            let totalQuestions = 0;
            const fetchPromises = files.map(file => 
                fetch(`./Data/Noor/${file}`)
                    .then(res => res.ok ? res.json() : [])
                    .catch(err => { console.error(`Error loading ${file}`, err); return []; })
            );
            const results = await Promise.all(fetchPromises);
            results.flat().forEach(q => {
                if (q && q.topic) {
                    const topicName = q.topic.trim();
                    counts[topicName] = (counts[topicName] || 0) + 1;
                    totalQuestions++;
                }
            });
            await setDoc(doc(db, "system", "counts"), counts);
            dbTopicCounts = counts;
            if(typeof initDropdowns === 'function') initDropdowns();
            const msg = `✅ تم التحديث بنجاح!\nعدد المواضيع: ${Object.keys(counts).length}\nإجمالي الأسئلة: ${totalQuestions}`;
            alert(msg);
            toast("تم تحديث قاعدة البيانات بنجاح", "success");
            const panel = document.getElementById('dev-cheat-panel');
            if(panel) panel.remove();
        } catch (e) {
            console.error(e);
            alert("❌ حدث خطأ أثناء التحديث: " + e.message);
            if(btn) {
                btn.disabled = false;
                btn.innerHTML = "❌ فشل - حاول مرة أخرى";
            }
        }
    },
    revealAnswer: function() {
        if (typeof quizState === 'undefined' || !quizState.active) {
            toast("يجب أن تكون داخل سؤال لتكشف الإجابة!", "error");
            return;
        }
        const q = quizState.questions[quizState.idx];
        const btns = document.querySelectorAll('.option-btn');
        if (btns[q.correctAnswer]) {
            const btn = btns[q.correctAnswer];
            btn.style.border = "2px solid #ef4444";
            btn.style.background = "linear-gradient(to right, #7f1d1d, #450a0a)";
            btn.classList.add('animate-pulse');
            const panel = document.getElementById('dev-cheat-panel');
            if(panel) panel.remove();
            toast("👁️ تم كشف الإجابة", "success");
        }
    },
    resetMarathon: async function() {
        if (typeof effectiveUserId === 'undefined' || !effectiveUserId) return;
        try {
            await updateDoc(doc(db, "users", effectiveUserId), { lastMarathonDate: null });
            if(typeof userProfile !== 'undefined') userProfile.lastMarathonDate = null;
            if(typeof checkMarathonStatus === 'function') checkMarathonStatus();
            toast("🔓 تم تصفير وقت الماراثون!", "success");
        } catch(e) { console.error(e); toast("فشل التصفير", "error"); }
    },
    resetDailyQuests: async function() {
        if (typeof effectiveUserId === 'undefined' || !effectiveUserId) return;
        try {
            const oldDate = "2000-01-01";
            if(typeof userProfile !== 'undefined') userProfile.dailyQuests.date = oldDate; 
            await updateDoc(doc(db, "users", effectiveUserId), { "dailyQuests.date": oldDate });
            if(typeof initDailyQuests === 'function') initDailyQuests();
            if(typeof renderQuestList === 'function') renderQuestList();
            if(typeof updateProfileUI === 'function') updateProfileUI();
            toast("📅 تم تصفير المهام", "success");
        } catch(e) { console.error(e); toast("فشل تصفير المهام", "error"); }
    },
    completeAllQuests: async function() {
        if (typeof effectiveUserId === 'undefined' || !effectiveUserId || !userProfile.dailyQuests) return;
        try {
            userProfile.dailyQuests.tasks.forEach(t => { t.current = t.target; });
            await updateDoc(doc(db, "users", effectiveUserId), { "dailyQuests.tasks": userProfile.dailyQuests.tasks });
            if(typeof renderQuestList === 'function') renderQuestList();
            if(typeof updateProfileUI === 'function') updateProfileUI();
            toast("✅ تم إكمال المهام!", "success");
        } catch(e) { console.error(e); toast("فشل الإكمال", "error"); }
    }
};
document.addEventListener('DOMContentLoaded', () => window.CHEAT_MANAGER.init());
