import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, query, where, getDocs, serverTimestamp, orderBy, limit, arrayUnion, increment, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getDatabase, ref, set, onDisconnect, onValue, serverTimestamp as rtdbTimestamp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";
import { audioLibrary, AUDIO_BASE_URL } from './DataMp3.js';
import { pdfLibrary, PDF_BASE_URL } from './DataPdf.js';
import { topicsData, infallibles, badgesData, badgesMap } from './data.js';

// ==========================================
// 🛠️ أدوات الربط الذكي (نظام المطابقة بالتجريد - Abstract Match)
// ==========================================

/**
 * 1. دالة تنظيف وتجريد النصوص
 * الهدف: تحويل النص إلى "هيكل عظمي" نقي للمقارنة
 */
function normalizeTextForMatch(text) {
    if (!text) return "";
    
    return text
        // 1. حذف أي نص بين قوسين نهائياً (يزيل (ص)، (ع)، (عليه السلام)...)
        // هذا يحل مشكلة اختلاف كتابة الألقاب
        .replace(/\([^\)]*\)/g, "") 
        
        // 2. توحيد الحروف العربية المتشابهة
        .replace(/(آ|إ|أ)/g, "ا")
        .replace(/ة/g, "ه")
        .replace(/ى/g, "ي")
        .replace(/ؤ/g, "و")
        .replace(/ئ/g, "ي")
        
        // 3. حذف التشكيل (الفتحة، الضمة، إلخ)
        .replace(/[\u064B-\u065F]/g, "")
        
        // 4. 🔥 الإجراء الأهم: حذف كل شيء ليس حرفاً عربياً (مسافات، أرقام، رموز)
        .replace(/[^\u0621-\u064A]/g, ""); 
}

/**
 * 2. دالة البحث عن المعرف (ID)
 * تقارن الهيكل المجرد لاختيار المستخدم مع الهيكل المجرد للمكتبة
 */
function findContentId(selectedTopic, library) {
    if (!selectedTopic || !library) return null;

    // أ) دعم البحث الرقمي المباشر (للمستقبل أو إذا كانت القيم أرقاماً)
    if (!isNaN(selectedTopic) && parseInt(selectedTopic) > 0) {
        return parseInt(selectedTopic);
    }

    // ب) المحاولة السريعة (تطابق تام للنص كما هو)
    if (library[selectedTopic]) return library[selectedTopic];

    // ج) البحث العميق (تطابق الهيكل المجرد)
    // مثال: المستخدم اختار "سيرة النبي محمد (ص)" -> الهيكل: "سيرهالنبيمحمد"
    const userSkeleton = normalizeTextForMatch(selectedTopic);

    // الدوران على كل مفاتيح المكتبة
    for (const [key, id] of Object.entries(library)) {
        // مثال: المكتبة تحتوي "سيرة النبي محمد" -> الهيكل: "سيرهالنبيمحمد"
        const librarySkeleton = normalizeTextForMatch(key);
        
        // مقارنة الهيكل بالهيكل (تطابق تام بعد التجريد)
        if (librarySkeleton === userSkeleton) {
            console.log(`✅ تم التطابق (هيكل): [${selectedTopic}] == [${key}]`);
            return id;
        }

        // د) شبكة أمان: الاحتواء (للحالات الصعبة جداً)
        // إذا كان الهيكل أطول من 3 حروف، نتحقق إذا كان أحدهما جزءاً من الآخر
        if (librarySkeleton.length > 3 && userSkeleton.length > 3) {
            if (librarySkeleton.includes(userSkeleton) || userSkeleton.includes(librarySkeleton)) {
                console.log(`✅ تم التطابق (احتواء): [${selectedTopic}] <-> [${key}]`);
                return id;
            }
        }
    }

    // فشل البحث
    console.warn(`❌ لم يتم العثور على محتوى. الهيكل المطلوب: [${userSkeleton}]`);
    return null;
}
// ==========================================
// 🎵 كلاس المشغل الصوتي المتقدم (SmartAudioPlayer) - نسخة مصححة
// ==========================================

class SmartAudioPlayer {
    constructor() {
        this.audio = new Audio();
        this.isPlaying = false;
        this.currentId = null;
        
        // ✅ تصحيح المعرفات لتتطابق مع index.html
        this.elements = {
            modal: document.getElementById('audio-learning-modal'), // كان خطأ
            playBtn: document.getElementById('audio-play-pause-btn'), // كان خطأ
            icon: document.getElementById('audio-play-icon'),
            pauseIcon: document.getElementById('audio-pause-icon'), // إضافة أيقونة الإيقاف
            progressBar: document.getElementById('audio-progress-area'), // المنطقة القابلة للنقر
            progressFill: document.getElementById('audio-progress-fill'), // الشريط الملون
            currentTime: document.getElementById('audio-current-time'),
            duration: document.getElementById('audio-total-duration'), // كان خطأ
            title: document.getElementById('audio-topic-title') // كان خطأ
        };

        this._bindAudioEvents();
        this._bindControlEvents();
    }

    playTrack(id, title) {
        if (!id) {
            if(window.toast) window.toast("لا يوجد ملف صوتي لهذا العنوان", "error");
            return;
        }

        this.currentId = id;
        this.accumulatedTime = 0; 
        this.lastTime = 0; 
        
        const src = `${AUDIO_BASE_URL}${id}.mp3`;
        
        console.log(`🎵 جاري تحميل الصوت: ${src}`);
        
        this.audio.src = src;
        this.audio.load();
        
        if(this.elements.title) this.elements.title.textContent = title;
        
        if(this.elements.modal) {
            this.elements.modal.classList.remove('hidden');
            this.elements.modal.classList.add('active'); 
            this.elements.modal.style.display = 'flex';
        }

        this.audio.play()
            .then(() => {
                this.isPlaying = true;
                this._updatePlayIcon();
            })
            .catch(err => {
                console.error("Autoplay prevented:", err);
                this.isPlaying = false;
                this._updatePlayIcon();
            });
    }

    togglePlay() {
        if (this.audio.paused) {
            this.audio.play();
            this.isPlaying = true;
        } else {
            this.audio.pause();
            this.isPlaying = false;
        }
        this._updatePlayIcon();
    }

    skip(seconds) {
        this.audio.currentTime += seconds;
    }
    close() {
        this.audio.pause();
        this.audio.currentTime = 0;
        this.isPlaying = false;
        if(this.elements.modal) {
            this.elements.modal.classList.remove('active'); // إزالة تأثير الظهور
            this.elements.modal.classList.add('hidden');    // إخفاء العنصر
            this.elements.modal.style.display = 'none';
        }
    }

    _bindAudioEvents() {
        this.audio.addEventListener('timeupdate', () => {
            if (isNaN(this.audio.duration)) return;

            const currentTime = this.audio.currentTime;
            
            if (this.lastTime !== undefined) {
                const diff = currentTime - this.lastTime;
                if (diff > 0 && diff < 1.5) {
                    this.accumulatedTime = (this.accumulatedTime || 0) + diff;
                }
            }
            this.lastTime = currentTime;

            if (this.accumulatedTime >= 60) {
                this.accumulatedTime -= 60;
                
                if (effectiveUserId) {
                    const pointsToAdd = 10;
                    
                    const wKey = getCurrentWeekKey();
                    let wStats = userProfile.weeklyStats || { key: wKey, correct: 0 };
                    if (wStats.key !== wKey) wStats = { key: wKey, correct: 0 };
                    wStats.correct += pointsToAdd;

                    const mKey = getCurrentMonthKey();
                    let mStats = userProfile.monthlyStats || { key: mKey, correct: 0 };
                    if (mStats.key !== mKey) mStats = { key: mKey, correct: 0 };
                    mStats.correct += pointsToAdd;

                    updateDoc(doc(db, "users", effectiveUserId), {
                        highScore: increment(pointsToAdd),
                        "stats.totalListenTime": increment(60),
                        "stats.totalCorrect": increment(pointsToAdd),
                        weeklyStats: wStats,
                        monthlyStats: mStats
                    }).catch(console.error);

                    userProfile.highScore = (userProfile.highScore || 0) + pointsToAdd;
                    userProfile.stats.totalCorrect = (userProfile.stats.totalCorrect || 0) + pointsToAdd;
                    userProfile.weeklyStats = wStats;
                    userProfile.monthlyStats = mStats;

                    if (typeof updateProfileUI === 'function') updateProfileUI();
                    
                    if(window.toast) window.toast(`✨ أحسنت! كسبت ${pointsToAdd} نقاط (استماع دقيقة)`, "success");
                    if(window.playSound) window.playSound('monetization_on');
                }
            }

            const percent = (this.audio.currentTime / this.audio.duration) * 100;
            if(this.elements.progressFill) this.elements.progressFill.style.width = `${percent}%`;
            
            if(this.elements.currentTime) 
                this.elements.currentTime.textContent = this._formatTime(this.audio.currentTime);
            
            if(this.elements.duration)
                this.elements.duration.textContent = this._formatTime(this.audio.duration);
        });

        this.audio.addEventListener('ended', () => {
            this.isPlaying = false;
            this._updatePlayIcon();
            if(window.toast) window.toast("انتهى المقطع الصوتي", "success");
        });
        
        this.audio.addEventListener('loadedmetadata', () => {
             if(this.elements.duration)
                this.elements.duration.textContent = this._formatTime(this.audio.duration);
        });

        this.audio.addEventListener('error', (e) => {
            console.error("❌ Audio Error:", this.audio.error);
            this.close();
            if(window.toast) window.toast("تعذر تشغيل الملف الصوتي", "error");
        });
    }

    _bindControlEvents() {
        if(this.elements.playBtn) {
            this.elements.playBtn.onclick = (e) => {
                e.stopPropagation();
                this.togglePlay();
            };
        }

        // النقر على شريط التقدم
        if(this.elements.progressBar) {
            this.elements.progressBar.onclick = (e) => {
                const rect = this.elements.progressBar.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const width = rect.width;
                const percent = x / width;
                if (!isNaN(this.audio.duration)) {
                    this.audio.currentTime = percent * this.audio.duration;
                }
            };
        }

        // ✅ تصحيح أزرار التحكم (الأسماء في HTML تختلف عن الكود القديم)
        const btnForward = document.getElementById('audio-forward-btn'); // كان audio-forward-10
        const btnRewind = document.getElementById('audio-rewind-btn');   // كان audio-rewind-10
        const btnClose = document.getElementById('close-audio-btn');

        if(btnForward) btnForward.onclick = () => this.skip(10);
        if(btnRewind) btnRewind.onclick = () => this.skip(-10);
        if(btnClose) btnClose.onclick = () => this.close();
    }

    _updatePlayIcon() {
        // التبديل بين أيقونات التشغيل والإيقاف بناءً على HTML الموجود
        if (this.elements.icon && this.elements.pauseIcon) {
            if (this.isPlaying) {
                this.elements.icon.classList.add('hidden');
                this.elements.pauseIcon.classList.remove('hidden');
            } else {
                this.elements.icon.classList.remove('hidden');
                this.elements.pauseIcon.classList.add('hidden');
            }
        } else if (this.elements.icon) {
            // حل احتياطي للنص فقط
            this.elements.icon.textContent = this.isPlaying ? 'pause' : 'play_arrow';
        }
    }

    _formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return "00:00";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
}

// تهيئة المشغل (Singleton)
const audioPlayer = new SmartAudioPlayer();
// ==========================================
// 📚 كلاس قارئ الكتب المتطور (Pro Version)
// 🥇 حدود ذكية | 🥈 نقر مزدوج | 🥉 سحب محسن | ⭐ تحميل مسبق
// ==========================================

class SmartPdfViewer {
    constructor() {
        this.pdfDoc = null;
        this.pageNum = 1;
        this.pageRendering = false;
        this.pageNumPending = null;
        this.currentPdfId = null;
        
        // التخزين المؤقت للصفحة التالية (Preload)
        this.nextPagePromise = null;

        // متغيرات اللمس والتكبير
        this.scale = 1;
        this.lastScale = 1;
        this.posX = 0;
        this.posY = 0;
        this.lastPosX = 0;
        this.lastPosY = 0;
        this.isDragging = false;
        this.startDist = 0;
        
        // متغيرات السحب (Swipe) والنقر المزدوج
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.lastTapTime = 0; // للنقر المزدوج

        this.canvas = document.getElementById('the-canvas');
        this.zoomContainer = document.getElementById('zoom-container');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        
        // تحسين الانتقال السلس
        if (this.canvas) {
            this.canvas.style.transition = "opacity 0.2s ease-out"; // إزالة transform من الانتقال لتجنب التقطيع أثناء السحب
            this.canvas.style.opacity = "0";
        }
        if (this.zoomContainer) {
            this.zoomContainer.style.transformOrigin = "center center"; // التكبير من المنتصف
            this.zoomContainer.style.willChange = "transform";
        }

        this.elements = {
            modal: document.getElementById('pdf-viewer-modal'),
            loading: document.getElementById('pdf-loading'),
            pageNum: document.getElementById('page-num'),
            pageCount: document.getElementById('page-count'),
            progressBar: document.getElementById('pdf-progress-bar'),
            finishBtn: document.getElementById('pdf-finish-btn'),
            title: document.getElementById('pdf-topic-title'),
            autoBtn: document.getElementById('pdf-btn-auto-toggle'),
            autoIcon: document.getElementById('pdf-auto-icon'),
            bottomNext: document.getElementById('pdf-btn-next-bottom'),
            bottomPrev: document.getElementById('pdf-btn-prev-bottom')
        };

        this._bindEvents();
        this._bindGestures();
    }

    async loadDocument(id, title) {
        if (!id || typeof id !== 'string' || id.trim() === '') {
            console.warn("⚠️ محاولة فتح كتاب بمعرف غير صالح:", id);
            toast("عذراً، ملف الكتاب غير متوفر حالياً لهذا الموضوع", "error");
            return;
        }

        this.currentPdfId = id;
        this.pageNum = 1;
        this.stopAutoScroll();
        this.resetZoom();

        if (this.elements.modal) {
            this.elements.modal.classList.remove('hidden');
            this.elements.modal.classList.add('active');
            this.elements.modal.style.display = 'flex';
        }
        
        if(this.elements.loading) this.elements.loading.classList.remove('hidden');
        if(this.canvas) this.canvas.style.opacity = "0";
        if (this.elements.title) this.elements.title.textContent = title;
        this._toggleFinishButton(false);

        try {
            const url = `${PDF_BASE_URL}${id}.pdf`;
            console.log(`📄 جاري تحميل الكتاب: ${url}`);

            const loadingTask = pdfjsLib.getDocument(url);
            
            this.pdfDoc = await loadingTask.promise;
            
            if (this.elements.pageCount) this.elements.pageCount.textContent = this.pdfDoc.numPages;
            
            await this.renderPage(this.pageNum);
            
            if(this.elements.loading) this.elements.loading.classList.add('hidden');

        } catch (error) {
            console.error('❌ فشل تحميل ملف PDF:', error);
            
            this.close();

            let msg = "حدث خطأ أثناء تحميل الكتاب";
            if (error.name === 'MissingPDFException' || error.status === 404) {
                msg = "ملف الكتاب غير موجود على السيرفر (404)";
            } else if (error.name === 'InvalidPDFException') {
                msg = "ملف الكتاب تالف أو غير صالح";
            }
            
            toast(msg, "error");
        }
    }

    async renderPage(num) {
        this.pageRendering = true;
        
        // ومضة اختفاء سريعة
        if (this.canvas) this.canvas.style.opacity = "0";
        await new Promise(r => setTimeout(r, 80));

        try {
            // ⭐ 4) استخدام الصفحة المحملة مسبقاً إن وجدت
            let page;
            if (this.nextPagePromise && this.nextPageNum === num) {
                page = await this.nextPagePromise;
            } else {
                page = await this.pdfDoc.getPage(num);
            }
            
            // ... داخل دالة renderPage ...

            // 1. نحصل على أبعاد الحاوية المخصصة للورقة فقط (وليس الشاشة كاملة)
            const container = document.getElementById('pdf-canvas-container');
            
            // نستخدم clientWidth للحصول على العرض الداخلي (بدون الحواف)
            const containerWidth = container ? container.clientWidth : window.innerWidth;
            const containerHeight = container ? container.clientHeight : window.innerHeight;
            
            const viewportRaw = page.getViewport({ scale: 1 });
            
            // 2. حساب نسبة التكبير المناسبة
            const scaleX = containerWidth / viewportRaw.width;
            const scaleY = containerHeight / viewportRaw.height;
            
            let fitScale = Math.min(scaleX, scaleY);
 

            const outputScale = window.devicePixelRatio || 1;
            const viewport = page.getViewport({ scale: fitScale });

            // ... تكملة الكود (canvas.width = ...) كما هو ...


            this.canvas.width = Math.floor(viewport.width * outputScale);
            this.canvas.height = Math.floor(viewport.height * outputScale);
            this.canvas.style.width = Math.floor(viewport.width) + "px";
            this.canvas.style.height = Math.floor(viewport.height) + "px";

            // حفظ الأبعاد الأصلية للحاوية لاستخدامها في حساب الحدود لاحقاً
            this.baseWidth = viewport.width;
            this.baseHeight = viewport.height;
            this.containerWidth = containerWidth;
            this.containerHeight = containerHeight;

            const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

            await page.render({ canvasContext: this.ctx, transform, viewport }).promise;
            
            if (this.canvas) this.canvas.style.opacity = "1";
            
            this.resetZoom();
            this.pageRendering = false;

            // ⭐ 4) البدء بتحميل الصفحة التالية في الخلفية
            if (num < this.pdfDoc.numPages) {
                this.nextPageNum = num + 1;
                this.nextPagePromise = this.pdfDoc.getPage(this.nextPageNum);
            }

            if (this.pageNumPending !== null) {
                this.renderPage(this.pageNumPending);
                this.pageNumPending = null;
            }
        } catch (err) {
            this.pageRendering = false;
            console.error(err);
        }
        this._updateUI();
    }

    queueRenderPage(num) {
        if (this.pageRendering) this.pageNumPending = num;
        else this.renderPage(num);
    }

    prevPage() {
        if (this.pageNum <= 1) return;
        this.pageNum--;
        this.queueRenderPage(this.pageNum);
    }

    nextPage() {
        if (this.pageNum >= this.pdfDoc.numPages) {
            this.stopAutoScroll();
            return;
        }
        this.pageNum++;
        this.queueRenderPage(this.pageNum);
    }

    // --- 🎮 التحكم بالإيماءات (Gestures) ---
    _bindGestures() {
        const container = document.getElementById('pdf-canvas-container');
        if (!container) return;

        container.addEventListener('touchstart', (e) => this._handleTouchStart(e), { passive: false });
        container.addEventListener('touchmove', (e) => this._handleTouchMove(e), { passive: false });
        container.addEventListener('touchend', (e) => this._handleTouchEnd(e), { passive: false });
    }

    _handleTouchStart(e) {
        // 🥈 2) اكتشاف النقر المزدوج (Double Tap)
        if (e.touches.length === 1) {
            const currentTime = new Date().getTime();
            const tapLength = currentTime - this.lastTapTime;
            if (tapLength < 300 && tapLength > 0) {
                e.preventDefault(); // منع التكبير الافتراضي للمتصفح
                this._handleDoubleTap();
                return;
            }
            this.lastTapTime = currentTime;
        }

        if (e.touches.length === 2) {
            // بداية التكبير (Pinch)
            e.preventDefault();
            this.startDist = Math.hypot(
                e.touches[0].pageX - e.touches[1].pageX,
                e.touches[0].pageY - e.touches[1].pageY
            );
        } else if (e.touches.length === 1) {
            // بداية السحب (Pan/Swipe)
            this.isDragging = true;
            this.lastPosX = e.touches[0].pageX;
            this.lastPosY = e.touches[0].pageY;
            this.touchStartX = e.touches[0].pageX;
            this.touchStartY = e.touches[0].pageY;
        }
    }

    _handleDoubleTap() {
        if (this.scale > 1) {
            this.resetZoom(); // العودة للحجم الطبيعي
        } else {
            this.scale = 2.5; // تكبير ذكي
            this.posX = 0;
            this.posY = 0;
            this._updateTransform();
        }
    }

    _handleTouchMove(e) {
        if (e.touches.length === 2) {
            // منطق التكبير
            e.preventDefault();
            const dist = Math.hypot(
                e.touches[0].pageX - e.touches[1].pageX,
                e.touches[0].pageY - e.touches[1].pageY
            );
            
            const delta = dist / this.startDist;
            let newScale = this.lastScale * delta;
            newScale = Math.min(Math.max(1, newScale), 4); // حدود التكبير
            
            this.scale = newScale;
            this._updateTransform();

        } else if (e.touches.length === 1 && this.scale > 1 && this.isDragging) {
            // منطق التحريك (Pan) داخل الصورة المكبرة
            e.preventDefault();
            const currentX = e.touches[0].pageX;
            const currentY = e.touches[0].pageY;
            
            const deltaX = currentX - this.lastPosX;
            const deltaY = currentY - this.lastPosY;

            this.posX += deltaX;
            this.posY += deltaY;

            // 🥇 1) تطبيق الحدود الذكية (منع الخروج للفراغ الأسود)
            this._clampOffset();

            this.lastPosX = currentX;
            this.lastPosY = currentY;
            this._updateTransform();
        }
    }

    _handleTouchEnd(e) {
        if (e.touches.length < 2) {
            this.lastScale = this.scale;
        }
        
        // 🥉 3) منطق السحب المحسن (Swipe)
        // يعمل فقط إذا كان الحجم طبيعي (Scale = 1)
        if (this.scale === 1 && e.changedTouches.length === 1) {
            const touchEndX = e.changedTouches[0].pageX;
            const touchEndY = e.changedTouches[0].pageY;
            
            const diffX = this.touchStartX - touchEndX;
            const diffY = this.touchStartY - touchEndY;

            // الشرط: حركة أفقية قوية + حركة عمودية ضعيفة (لمنع التقليب أثناء التمرير العمودي)
            if (Math.abs(diffX) > 50 && Math.abs(diffY) < 30) {
                this.stopAutoScroll();
                if (diffX > 0) this.nextPage();
                else this.prevPage();
            }
        }
        
        this.isDragging = false;
        
        // إعادة التمركز إذا صغرت الصورة عن الحد الطبيعي
        if (this.scale < 1.1) {
            this.resetZoom();
        } else {
            // تأكيد الحدود مرة أخيرة عند رفع الإصبع
            this._clampOffset();
            this._updateTransform();
        }
    }

    // 🥇 دالة حساب الحدود الذكية (The Guard)
    _clampOffset() {
        // حساب العرض الحالي للصورة
        const currentWidth = this.baseWidth * this.scale;
        const currentHeight = this.baseHeight * this.scale;

        // حساب الفائض (كم خرجت الصورة عن الشاشة)
        // إذا كانت الصورة أكبر من الشاشة، نسمح بالحركة بمقدار الفائض فقط
        // إذا كانت أصغر، نجبر الموقع على 0 (المنتصف)
        
        let maxOffsetX = 0;
        let maxOffsetY = 0;

        if (currentWidth > this.containerWidth) {
            maxOffsetX = (currentWidth - this.containerWidth) / 2;
        }
        
        if (currentHeight > this.containerHeight) {
            maxOffsetY = (currentHeight - this.containerHeight) / 2;
        }

        // تقييد الحركة داخل هذا المجال
        this.posX = Math.min(Math.max(this.posX, -maxOffsetX), maxOffsetX);
        this.posY = Math.min(Math.max(this.posY, -maxOffsetY), maxOffsetY);
    }

    _updateTransform() {
        if (this.zoomContainer) {
            // نستخدم translate3d للأداء الأفضل
            this.zoomContainer.style.transform = `translate3d(${this.posX}px, ${this.posY}px, 0) scale(${this.scale})`;
        }
    }

    resetZoom() {
        this.scale = 1;
        this.lastScale = 1;
        this.posX = 0;
        this.posY = 0;
        this._updateTransform();
    }

    // --- الوظائف الأساسية الأخرى ---
    toggleAutoScroll() {
        if (this.isAutoScrolling) {
            this.stopAutoScroll();
            if(window.toast) window.toast("تم إيقاف التقليب التلقائي");
        } else {
            this.startAutoScroll();
            if(window.toast) window.toast("تم تفعيل التقليب التلقائي");
        }
    }

    startAutoScroll() {
        if(this.isAutoScrolling) return;
        this.isAutoScrolling = true;
        this.updateAutoIcon();
        this.autoScrollInterval = setInterval(() => {
            if (this.pageNum < this.pdfDoc.numPages) this.nextPage();
            else this.stopAutoScroll();
        }, 5000);
    }

    stopAutoScroll() {
        this.isAutoScrolling = false;
        if (this.autoScrollInterval) {
            clearInterval(this.autoScrollInterval);
            this.autoScrollInterval = null;
        }
        this.updateAutoIcon();
    }

    updateAutoIcon() {
        if (this.elements.autoIcon && this.elements.autoBtn) {
            this.elements.autoIcon.textContent = this.isAutoScrolling ? 'pause' : 'play_arrow';
            if(this.isAutoScrolling) {
                this.elements.autoBtn.classList.add('text-amber-500', 'border-amber-500', 'bg-amber-500/10');
                this.elements.autoBtn.classList.remove('text-slate-300', 'bg-slate-800', 'border-slate-600');
            } else {
                this.elements.autoBtn.classList.remove('text-amber-500', 'border-amber-500', 'bg-amber-500/10');
                this.elements.autoBtn.classList.add('text-slate-300', 'bg-slate-800', 'border-slate-600');
            }
        }
    }

        close() {
        this.stopAutoScroll();
        
        if (this.elements.modal) {
            this.elements.modal.classList.remove('active');            
            this.elements.modal.classList.add('hidden');
            this.elements.modal.style.display = 'none';
        }
        this.pdfDoc = null;
        if (this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }


    _updateUI() {
        if (this.elements.pageNum) this.elements.pageNum.textContent = this.pageNum;
        if (this.elements.progressBar && this.pdfDoc) {
            const percent = (this.pageNum / this.pdfDoc.numPages) * 100;
            this.elements.progressBar.style.width = `${percent}%`;
        }
        if (this.pdfDoc && this.pageNum === this.pdfDoc.numPages) this._toggleFinishButton(true);
        else this._toggleFinishButton(false);
    }

    _toggleFinishButton(show) {
        if (!this.elements.finishBtn) return;
        if (show) {
            this.elements.finishBtn.style.opacity = "1";
            this.elements.finishBtn.style.pointerEvents = "auto";
            this.elements.finishBtn.classList.remove('translate-y-4');
        } else {
            this.elements.finishBtn.style.opacity = "0";
            this.elements.finishBtn.style.pointerEvents = "none";
            this.elements.finishBtn.classList.add('translate-y-4');
        }
    }

        _bindEvents() {
        // 1. ربط زر الإغلاق العلوي (X)
        const btnClose = document.getElementById('close-pdf-btn');
        if (btnClose) {
            btnClose.onclick = (e) => {
                e.preventDefault(); // منع أي سلوك افتراضي
                this.close();
            };
        } else {
            console.warn("⚠️ زر إغلاق الكتاب (close-pdf-btn) غير موجود في HTML");
        }
        if(this.elements.bottomPrev) this.elements.bottomPrev.onclick = () => { this.stopAutoScroll(); this.prevPage(); };
        if(this.elements.bottomNext) this.elements.bottomNext.onclick = () => { this.stopAutoScroll(); this.nextPage(); };
        
        // 4. زر التشغيل التلقائي
        if(this.elements.autoBtn) this.elements.autoBtn.onclick = () => this.toggleAutoScroll();
    }
}

// تهيئة القارئ
const pdfViewer = new SmartPdfViewer();

// --- متغيرات نظام التعلم ---
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
const rtdb = getDatabase(app); 
// 👇 كود تفعيل قاعدة البيانات لتعمل بدون إنترنت
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
             setupPresenceSystem(); 
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

const framesData = [
    { id: 'default', name: 'بدون إطار', price: 0, cssClass: '' },
    
    // --- المجموعة الكلاسيكية (تم الاحتفاظ بها) ---
    { id: 'gold', name: 'الإطار الذهبي', price: 1500, cssClass: 'frame-gold' },
    { id: 'fire', name: 'الإطار المشتعل', price: 3000, cssClass: 'frame-fire' },
    { id: 'floral', name: 'إطار الربيع', price: 1000, cssClass: 'frame-floral' },
    { id: 'diamond', name: 'الإطار الماسي', price: 5000, cssClass: 'frame-diamond' },
    { id: 'neon', name: 'إطار النيون', price: 2500, cssClass: 'frame-neon' },
    { id: 'sun', name: 'شمس الولاية', price: 4000, cssClass: 'frame-sun' },
    { id: 'eagle', name: 'جناح النسر', price: 3500, cssClass: 'frame-eagle' },
    { id: 'star', name: 'نجمة الصباح', price: 2000, cssClass: 'frame-star' },
    { id: 'tech', name: 'السايبر الرقمي', price: 3000, cssClass: 'frame-tech' },
    { id: 'energy', name: 'طاقة البرق', price: 2800, cssClass: 'frame-energy' },
    { id: 'ruby', name: 'ياقوت أحمر', price: 2200, cssClass: 'frame-ruby' },
    { id: 'nature', name: 'غصن الزيتون', price: 1200, cssClass: 'frame-nature' },
    { id: 'hex', name: 'درع سداسي', price: 1800, cssClass: 'frame-hex' },
    { id: 'ghost', name: 'الطيف الأبيض', price: 4500, cssClass: 'frame-ghost' },

    // --- الإطارات التي تم إصلاحها (Fixes) ---
    { id: 'galaxy', name: 'مجرة الفلك', price: 6000, cssClass: 'frame-galaxy-fixed' }, // تم الإصلاح
    { id: 'dark_matter', name: 'المادة المظلمة', price: 7000, cssClass: 'frame-dark-matter-fixed' }, // تم الإصلاح
    { id: 'rgb', name: 'ألوان الطيف', price: 6500, cssClass: 'frame-rgb-fixed' }, // تم الإصلاح

    // --- مجموعة الروحانيات والنور (جديد) ---
    { id: 'nur_ala_nur', name: 'نور على نور', price: 5500, cssClass: 'frame-nur' },
    { id: 'angelic_wing', name: 'الجناح الملائكي', price: 4800, cssClass: 'frame-angelic' },
    { id: 'crescent_moon', name: 'هلال العيد', price: 3200, cssClass: 'frame-crescent' },
    { id: 'kufic_gold', name: 'زخرفة كوفية', price: 4200, cssClass: 'frame-kufic' },
    { id: 'heaven_gate', name: 'أبواب الجنان', price: 8000, cssClass: 'frame-heaven' },

    // --- مجموعة العناصر الطبيعية الخارقة (جديد) ---
    { id: 'blizzard', name: 'عاصفة الجليد', price: 3800, cssClass: 'frame-blizzard' },
    { id: 'thunder_storm', name: 'الصاعقة', price: 4500, cssClass: 'frame-thunder' },
    { id: 'ocean_depth', name: 'عمق المحيط', price: 3600, cssClass: 'frame-ocean' },
    { id: 'sand_storm', name: 'عاصفة الصحراء', price: 2900, cssClass: 'frame-sand' },
    { id: 'emerald_flow', name: 'الزمرد السائل', price: 5200, cssClass: 'frame-emerald' },

    // --- مجموعة السايبر والمستقبل (جديد) ---
    { id: 'glitch_art', name: 'الخلل الرقمي', price: 4000, cssClass: 'frame-glitch' },
    { id: 'scanner', name: 'الماسح الضوئي', price: 3300, cssClass: 'frame-scanner' },
    { id: 'hud_circle', name: 'النظام الذكي', price: 3700, cssClass: 'frame-hud' },
    { id: 'cyber_pulse', name: 'نبض السايبر', price: 3200, cssClass: 'frame-cyber-pulse' },
    { id: 'matrix', name: 'المصفوفة', price: 3500, cssClass: 'frame-matrix' },

    // --- مجموعة الجواهر والأحجار الكريمة (جديد) ---
    { id: 'amethyst', name: 'الجمشت البنفسجي', price: 4600, cssClass: 'frame-amethyst' },
    { id: 'sapphire_ring', name: 'خاتم الياقوت', price: 4900, cssClass: 'frame-sapphire' },
    { id: 'pearl_shell', name: 'اللؤلؤة المكنونة', price: 5500, cssClass: 'frame-pearl' },
    
    // --- مجموعة الأساطير والخيال (جديد) ---
    { id: 'phoenix', name: 'ريشة العنقاء', price: 9000, cssClass: 'frame-phoenix' },
    { id: 'dragon_breath', name: 'أنفاس التنين', price: 8500, cssClass: 'frame-dragon-breath' },
    { id: 'mystic_aura', name: 'الهالة الصوفية', price: 6200, cssClass: 'frame-mystic' },
    { id: 'time_portal', name: 'بوابة الزمن', price: 7500, cssClass: 'frame-time' },
    { id: 'infinity', name: 'إطار اللانهاية', price: 10000, cssClass: 'frame-infinity' }
];

// دالة تسجيل حالة التواجد في RTDB (مصححة)
function setupPresenceSystem() {
    if (!currentUser || !effectiveUserId) return;

    const statusRef = ref(rtdb, `status/${effectiveUserId}`);
    const isOnlineRef = ref(rtdb, '.info/connected');

    onValue(isOnlineRef, (snapshot) => {
        // إذا لم يكن متصلاً، لا نفعل شيئاً
        if (snapshot.val() === false) {
            return;
        }

        // 1. عندما يقطع المستخدم الاتصال (يغلق التطبيق)، اجعل حالته offline
        // هذا الأمر يُرسل للسيرفر الآن، ولكنه ينفذ لاحقاً عند انقطاع الاتصال
        onDisconnect(statusRef).set({
            state: 'offline',
            last_changed: rtdbTimestamp(),
            username: userProfile.username
        }).then(() => {
            // 2. مادام الاتصال موجوداً الآن، اجعل الحالة online
            set(statusRef, {
                state: 'online',
                last_changed: rtdbTimestamp(),
                username: userProfile.username
            });
        });
    });
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
// --- دوال واجهة المستخدم للمهام ---

// 1. فتح النافذة وتحديث البيانات
function openQuestModal() {
    const modal = document.getElementById('quest-modal');
    modal.classList.remove('quest-hidden');
    // تأخير بسيط لتفعيل الأنيميشن
    setTimeout(() => {
        modal.classList.add('active');
    }, 10);
    
    renderQuestList(); // تحديث القائمة عند الفتح
}

// 2. إغلاق النافذة
function closeQuestModal() {
    const modal = document.getElementById('quest-modal');
    modal.classList.remove('active');
    setTimeout(() => {
        modal.classList.add('quest-hidden');
    }, 300);
}

// ==========================================
// 📋 عرض قائمة المهام (تحديث الواجهة)
// ==========================================
function renderQuestList() {
    const listContainer = document.getElementById('quest-list-container');
    if (!listContainer) return;

    // تفريغ القائمة
    listContainer.innerHTML = '';

    // التحقق من وجود بيانات
    if (!userProfile.dailyQuests || !userProfile.dailyQuests.tasks) return;

    let allCompleted = true;

    userProfile.dailyQuests.tasks.forEach(task => {
        const isCompleted = task.current >= task.target;
        if (!isCompleted) allCompleted = false;

        // حساب نسبة التقدم للشريط
        const progressPercent = Math.min(100, (task.current / task.target) * 100);

        // تحديد حالة الزر (نشط، غير نشط، أو تم الاستلام)
        let actionBtnHTML = '';
        
        if (task.claimed) {
            // حالة 1: تم استلام الجائزة
            actionBtnHTML = `
                <button class="quest-claim-btn" style="background: #334155; cursor: default;" disabled>
                    <span class="material-symbols-rounded" style="font-size:14px; vertical-align:middle;">check</span> تم الاستلام
                </button>
            `;
        } else if (isCompleted) {
            // حالة 2: المهمة اكتملت والجائزة جاهزة للاستلام
            // لاحظ استخدام window.claimSingleReward هنا ضمنياً عبر onclick
            actionBtnHTML = `
                <button onclick="claimSingleReward(${task.id})" class="quest-claim-btn animate-bounce">
                    استلام 100 نقطة
                </button>
            `;
        } else {
            // حالة 3: المهمة قيد التنفيذ
            actionBtnHTML = `<span class="quest-progress-text">${task.current} / ${task.target}</span>`;
        }

        const taskHTML = `
            <div class="quest-item">
                <div class="quest-item-header">
                    <span>${task.desc}</span>
                    ${actionBtnHTML}
                </div>
                <div class="quest-progress-bg">
                    <div class="quest-progress-fill" style="width: ${progressPercent}%"></div>
                </div>
            </div>
        `;
        listContainer.innerHTML += taskHTML;
    });

    // التحكم في ظهور الجائزة الكبرى
    const grandPrizeArea = document.getElementById('grand-prize-area');
    if (grandPrizeArea) {
        if (allCompleted && !userProfile.dailyQuests.grandPrizeClaimed) {
            grandPrizeArea.classList.remove('quest-hidden');
            // تفعيل زر الجائزة الكبرى
            document.getElementById('claim-grand-prize-btn').onclick = window.claimGrandPrize;
        } else {
            grandPrizeArea.classList.add('quest-hidden');
        }
    }
}

// --- تفعيل الأزرار (Event Listeners) ---
// يجب التأكد من تحميل الصفحة قبل ربط العناصر
document.addEventListener('DOMContentLoaded', () => {
    
    const openBtn = document.getElementById('btn-open-quests');
    const closeBtn = document.getElementById('close-quest-btn');
    const grandBtn = document.getElementById('claim-grand-prize-btn');

    if(openBtn) openBtn.addEventListener('click', openQuestModal);
    if(closeBtn) closeBtn.addEventListener('click', closeQuestModal);
    
    // ربط زر الجائزة الكبرى
    if(grandBtn) grandBtn.addEventListener('click', claimGrandPrize);
});
// ==========================================
// 🎁 نظام المهام اليومية: دوال الاستلام (Logic)
// ==========================================

async function claimSingleReward(taskId) {
    // 1. العثور على المهمة
    const task = userProfile.dailyQuests.tasks.find(t => t.id === taskId);
    if (!task) return;

    // 2. التحقق من الأهلية
    if (task.current < task.target) {
        toast("المهمة لم تكتمل بعد!", "error");
        return;
    }
    if (task.claimed) {
        toast("تم استلام هذه الجائزة مسبقاً", "info");
        return;
    }

    // 3. التنفيذ (مكافأة 100 نقطة)
    const REWARD_AMOUNT = 100;
    
    // أ. تحديث محلي
    task.claimed = true;
    userProfile.highScore += REWARD_AMOUNT;

    // ب. حفظ في السيرفر
    try {
        await updateDoc(doc(db, "users", effectiveUserId), {
            "dailyQuests.tasks": userProfile.dailyQuests.tasks,
            highScore: userProfile.highScore
        });

        // ج. مؤثرات النجاح
        playSound('monetization_on'); // صوت النقود إذا وجد أو win
        toast(`🎉 تم استلام ${REWARD_AMOUNT} نقطة!`);
        
        // د. تحديث الواجهة
        renderQuestList();
        updateProfileUI(); // لتحديث عداد النقاط العلوي
        
    } catch (e) {
        console.error("Reward Claim Error", e);
        toast("خطأ في الاتصال، حاول مجدداً", "error");
        task.claimed = false; // تراجع في حال الخطأ
        userProfile.highScore -= REWARD_AMOUNT;
    }
}

async function claimGrandPrize() {
    // 1. التحقق من اكتمال جميع المهام
    const allDone = userProfile.dailyQuests.tasks.every(t => t.current >= t.target);
    if (!allDone) {
        toast("يجب إكمال جميع المهام أولاً!", "error");
        return;
    }
    if (userProfile.dailyQuests.grandPrizeClaimed) {
        toast("لقد استلمت الجائزة الكبرى لهذا اليوم!", "info");
        return;
    }

    // 2. محتويات الجائزة الكبرى
    const BONUS_SCORE = 1000;
    const BONUS_LIVES = 3;
    const BONUS_HINT = 1;

    // 3. التحديث المحلي
    userProfile.dailyQuests.grandPrizeClaimed = true;
    userProfile.highScore += BONUS_SCORE;
    userProfile.inventory.lives += BONUS_LIVES;
    userProfile.inventory.helpers.hint += BONUS_HINT;

    // 4. الحفظ في السيرفر
    try {
        await updateDoc(doc(db, "users", effectiveUserId), {
            "dailyQuests.grandPrizeClaimed": true,
            highScore: userProfile.highScore,
            "inventory.lives": userProfile.inventory.lives,
            "inventory.helpers.hint": userProfile.inventory.helpers.hint
        });

        // 5. الاحتفال
        launchConfetti(); // قصاصات ورقية
        playSound('applause'); // تصفيق
        
        // عرض نافذة الجائزة (نستخدم نافذة المكافآت الموجودة)
        // أو رسالة Toast مفصلة
        toast(`🎁 مبروك! حصلت على ${BONUS_SCORE} نقطة و ${BONUS_LIVES} قلوب وتلميح!`, "success");
        addLocalNotification('إنجاز يومي 🌟', 'تم استلام الجائزة الكبرى للمهام اليومية', 'military_tech');

        renderQuestList();
        updateProfileUI();

    } catch (e) {
        console.error("Grand Prize Error", e);
        toast("خطأ في استلام الجائزة", "error");
        userProfile.dailyQuests.grandPrizeClaimed = false;
    }
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
             setupPresenceSystem();
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
         setupPresenceSystem();
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
// --- دالة مركزية لتحديث تقدم المهام ---
function updateQuestProgress(questId, amount = 1) {
    // 1. التحقق من وجود بيانات المهام
    if (!userProfile.dailyQuests || !userProfile.dailyQuests.tasks) return;

    // 2. البحث عن المهمة المطلوبة
    const taskIndex = userProfile.dailyQuests.tasks.findIndex(t => t.id === questId);
    if (taskIndex === -1) return;

    const task = userProfile.dailyQuests.tasks[taskIndex];

    // 3. إذا كانت المهمة مكتملة مسبقاً، لا تفعل شيئاً
    if (task.current >= task.target) return;

    // 4. زيادة العداد
    task.current += amount;
    
    // منع العداد من تجاوز الهدف
    if (task.current > task.target) task.current = task.target;

    // 5. حفظ التحديث في السيرفر
    if (effectiveUserId) {
        updateDoc(doc(db, "users", effectiveUserId), { 
            dailyQuests: userProfile.dailyQuests 
        }).catch(err => console.log("Quest Update Error", err));
    }
    
    // 6. تحديث الواجهة (الشارة الحمراء على الزر)
    updateProfileUI(); 
}

// --- تهيئة نظام المهام اليومية ---
function initDailyQuests() {
    const today = new Date().toLocaleDateString('en-CA'); // تاريخ اليوم بصيغة ثابتة YYYY-MM-DD
    
    // 1. إذا لم يكن لدى المستخدم سجل مهام أصلاً، أو إذا كان التاريخ مختلفاً (يوم جديد)
    if (!userProfile.dailyQuests || userProfile.dailyQuests.date !== today) {
        userProfile.dailyQuests = {
            date: today,
            grandPrizeClaimed: false, // هل استلم الجائزة الكبرى؟
            tasks: [
                // المعرف 1: حل 50 سؤال في المعصومين
                { id: 1, current: 0, target: 50, claimed: false, desc: "حل 50 سؤال في قسم المعصومين" },
                // المعرف 2: استعمال 5 مساعدات
                { id: 2, current: 0, target: 5, claimed: false, desc: "استخدم 5 وسائل مساعدة" },
                // المعرف 3: حل 10 أسئلة ماراثون (النور)
                { id: 3, current: 0, target: 10, claimed: false, desc: "أكمل 10 أسئلة في تحدي النور" },
                // المعرف 4: حل 20 سؤال مهدوي
                { id: 4, current: 0, target: 20, claimed: false, desc: "حل 20 سؤال عن الثقافة المهدوية" },
                // المعرف 5: شراء عنصر من المتجر
                { id: 5, current: 0, target: 1, claimed: false, desc: "اشترِ أي عنصر من المتجر" }
            ]
        };
        // حفظ التهيئة الجديدة في السيرفر فوراً
        if(effectiveUserId) {
            updateDoc(doc(db, "users", effectiveUserId), { dailyQuests: userProfile.dailyQuests })
            .catch(err => console.log("Quest Init Error", err));
        }
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
        initDailyQuests();
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
    // تحديث الاسم (مع التحقق من وجود العنصر)
    const nameEl = getEl('username-display');
    if (nameEl) nameEl.textContent = userProfile.username;

    // حركة العداد للشريط السفلي
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

    // --- تحديث الأفاتار في الشريط السفلي (مع الإطار) ---
    const btn = getEl('user-profile-btn');
    if (btn) {
        // تنظيف محتوى الزر بالكامل (نحذف الأيقونات القديمة والصور)
        btn.innerHTML = ''; 

        // جلب الإطار الحالي
        const currentFrame = userProfile.equippedFrame || 'default';
        
        // استخدام دالة بناء الإطار (نمرر w-full h-full لملء الزر)
        // ملاحظة: getAvatarHTML موجودة في الكود لديك وتدعم الإطارات
        const avatarHtml = getAvatarHTML(userProfile.customAvatar, currentFrame, "w-full h-full");
        
        // حقن الكود الجديد
        btn.innerHTML = avatarHtml;
    }

    // زر مراجعة الأخطاء في الشاشة الرئيسية
    if(userProfile.wrongQuestionsBank && userProfile.wrongQuestionsBank.length > 0) {
        show('review-mistakes-btn');
        const reviewText = getEl('review-mistakes-text');
        if(reviewText) reviewText.textContent = `مراجعة أخطائي (${userProfile.wrongQuestionsBank.length})`;
    } else {
        hide('review-mistakes-btn');
    }
        // --- تحديث زر المهام اليومية ---
    const questContainer = document.getElementById('daily-quest-container');
    const questBadge = document.getElementById('quest-notification-badge');

    if (questContainer && userProfile.dailyQuests) {
        // إذا لم يتم استلام الجائزة الكبرى، أظهر الزر
        if (!userProfile.dailyQuests.grandPrizeClaimed) {
            questContainer.classList.remove('hidden');
            
            // تحديث الشارة (Badge) بعدد المهام المتبقية
            // نحسب المهام التي لم يكتمل عدادها بعد
            const remainingTasks = userProfile.dailyQuests.tasks.filter(t => t.current < t.target).length;
            
            if (remainingTasks > 0) {
                questBadge.style.display = 'flex';
                questBadge.textContent = remainingTasks;
                questBadge.classList.add('pulse-red'); // وميض
            } else {
                // إذا اكتملت كل المهام ولم تستلم الجائزة الكبرى بعد
                questBadge.style.display = 'flex';
                questBadge.textContent = "🎁";
                questBadge.classList.add('pulse-red');
            }
        } else {
            // إذا استلم الجائزة الكبرى، أخفِ الزر
            questContainer.classList.add('hidden');
        }
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
    
    show('bottom-nav');
    quizState.active = false;
    
    hide('login-area'); hide('auth-loading'); hide('quiz-proper'); hide('results-area');
    show('welcome-area');
    
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
     

    
    checkAndShowDailyReward(); 
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



    // 2. إعداد المتغيرات
    const cat = getEl('category-select').value;
    const count = parseInt(getEl('ai-question-count').value);
    const topicValue = getEl('topic-select').value;
    let topic = cat === 'random' || !cat ? "عام" : (topicValue || cat);

    quizState.difficulty = 'موحد';
    quizState.mode = 'standard';
    quizState.contextTopic = topic;

// --- إصلاح زر ابدأ التحدي (تمت إضافة الغلاف المفقود) ---
bind('ai-generate-btn', 'click', async () => {
    // 2. إعداد المتغيرات
    const cat = getEl('category-select').value;
    const count = parseInt(getEl('ai-question-count').value);
    const topicValue = getEl('topic-select').value;
    let topic = cat === 'random' || !cat ? "عام" : (topicValue || cat);

    quizState.difficulty = 'موحد';
    quizState.mode = 'standard';
    quizState.contextTopic = topic;

    const btn = getEl('ai-generate-btn');
    btn.disabled = true;
    
    // تغيير النص حسب حالة الاتصال
    if (navigator.onLine) {
        btn.innerHTML = `<span class="material-symbols-rounded animate-spin">autorenew</span> جاري التجهيز والتحميل...`;
    } else {
        btn.innerHTML = `<span class="material-symbols-rounded animate-spin">wifi_off</span> جاري البحث محلياً...`;
    }

    try {
        if (navigator.onLine) {
            const cacheBuster = Date.now();
            const marathonUrl = `https://raw.githubusercontent.com/iqsd2020-ctrl/New/refs/heads/main/Data/Noor/dataNooR.json?v=${cacheBuster}`;
            fetch(marathonUrl).catch(err => console.log("Background cache skipped:", err));
        }

        const QUERY_LIMIT = 3000;
        let qQuery;

        if (cat === 'random' || !cat) {
            qQuery = query(collection(db, "questions"), where("isReviewed", "==", true), limit(QUERY_LIMIT));
        } else {
            qQuery = query(collection(db, "questions"), where("topic", "==", topic), where("isReviewed", "==", true), limit(QUERY_LIMIT));
        }

        const snap = await getDocs(qQuery);

        if (cat !== 'random' && cat !== '' && snap.empty) {
            const msg = navigator.onLine ? "عذراً، لا توجد أسئلة متاحة لهذا الموضوع حالياً." : "لا توجد أسئلة محفوظة لهذا القسم، اتصل بالإنترنت وحاول مرة أخرى.";
            toast(msg, "error");
            btn.disabled = false;
            btn.innerHTML = `<span class="text-lg">ابدأ التحدي</span> <span class="material-symbols-rounded">menu_book</span>`;
            return;
        }

        let firebaseQs = [];
        snap.forEach(d => firebaseQs.push({ id: d.id, ...d.data() }));

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
            toast("سيتم عرض أسئلة سابقة في هذه الجولة.", "warning");
        }

        if (quizState.questions.length === 0) {
            toast("لا توجد أسئلة كافية لبدء الجولة.", "error");
            throw new Error("No questions");
        }

        if (navigator.onLine && cat === 'random') {
            toast("✅ تم تحديث البيانات للعمل بدون إنترنت", "success");
        }

        startQuiz();

    } catch (e) {
        console.error(e);
        if (e.message !== "No questions") {
            const errMsg = navigator.onLine ? "حدث خطأ في تحميل الأسئلة" : "أنت غير متصل ولا توجد أسئلة محفوظة";
            toast(errMsg, "error");
        }
    }

    btn.disabled = false;
    btn.innerHTML = `<span class="text-lg">ابدأ التحدي</span> <span class="material-symbols-rounded">menu_book</span>`;
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
            // التحقق من وجود تقدم يستحق الحفظ
            if (quizState.score > 0 || quizState.correctCount > 0) {
                try {
                    const userRef = doc(db, "users", effectiveUserId);
                    const currentTopic = quizState.contextTopic;
                    const safeCorrect = quizState.correctCount || 0;
                    
                    // 1. تجهيز تحديثات السيرفر
                    const updates = {
                        highScore: increment(quizState.score),
                        "stats.quizzesPlayed": increment(1),
                        "stats.totalCorrect": increment(safeCorrect), // ✅ حفظ عدد الإجابات الصحيحة
                        "stats.totalQuestions": increment(quizState.idx) // ✅ حفظ عدد الأسئلة التي مرت
                    };

                    // 2. حفظ إحصائيات الموضوع (إذا لم يكن عاماً)
                    if (currentTopic && currentTopic !== 'عام' && currentTopic !== 'مراجعة الأخطاء') {
                        // استخدام increment لزيادة رصيد الموضوع المحدد
                        updates[`stats.topicCorrect.${currentTopic}`] = increment(safeCorrect);
                    }

                    // 3. تحديث الإحصائيات الأسبوعية (للوحة الشرف)
                    const wKey = getCurrentWeekKey();
                    let newWeekly = userProfile.weeklyStats || { key: wKey, correct: 0 };
                    // إذا بدأ أسبوع جديد، نصفر العداد
                    if (newWeekly.key !== wKey) newWeekly = { key: wKey, correct: 0 };
                    newWeekly.correct += safeCorrect;
                    updates.weeklyStats = newWeekly;

                    // 4. تحديث الإحصائيات الشهرية
                    const mKey = getCurrentMonthKey();
                    let newMonthly = userProfile.monthlyStats || { key: mKey, correct: 0 };
                    if (newMonthly.key !== mKey) newMonthly = { key: mKey, correct: 0 };
                    newMonthly.correct += safeCorrect;
                    updates.monthlyStats = newMonthly;

                    // تنفيذ التحديث في السيرفر
                    await updateDoc(userRef, updates);

                    // 5. تحديث الملف الشخصي المحلي فوراً (لعدم الحاجة لإعادة التحميل)
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

bind('toggle-timer-btn', 'click', () => {
    if(quizState.mode === 'marathon') { toast("⛔️ لا يمكن إيقاف المؤقت في وضع النور!", "error"); return; }
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
        // ✅ ضع هذا الكود الجديد مكانه:
        
        // 1. خلط القوائم لضمان التنوع
        shuffleArray(freshQs);
        shuffleArray(usedQs);

        // 2. منطق اللعب حتى نهاية الملف
        if (freshQs.length > 0) {
            // الحالة الأولى: المستخدم لم يختم الملف بعد
            // نضع الأسئلة الجديدة فقط، وتنتهي اللعبة عند انتهائها
            quizState.questions = freshQs;
            toast(`🚀 انطلاق! متبقي ${freshQs.length} سؤال لختم هذا الملف.`, "info");
        } else {
            // الحالة الثانية: المستخدم ختم الملف سابقاً
            // نضع جميع الأسئلة (المراجعة) وتنتهي اللعبة بنهاية الملف
            quizState.questions = usedQs;
            toast("🌟 رائع! أنت ختمت هذا الملف. بدأت جولة مراجعة شاملة.", "success");
        }

        // 3. حماية من الملفات الفارغة
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
    quizState.processingAnswer = false;
    quizState.usedHelpers = false; 
    updateHelpersUI(); 

    quizState.active = true; 
    const q = quizState.questions[quizState.idx];
    
    getEl('quiz-topic-display').textContent = q.topic || quizState.contextTopic;

    // كتابة نص السؤال
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

    // ============================================================
    // 🔥 الحل النهائي: تنسيق الشبكة عبر الجافاسكربت مباشرة 🔥
    // (يضمن العمل 100% بتطبيق التنسيق على العناصر مباشرة)
    // ============================================================
    if (quizState.mode === 'marathon') {
        // 1. إعداد الشبكة (Grid) يدوياً
        box.style.display = 'grid';
        box.style.gridTemplateColumns = 'repeat(2, 1fr)'; // عمودين متساويين
        box.style.gap = '10px'; // مسافة بين المربعات
        
        // 2. إزالة تأثيرات القائمة العمودية
        box.classList.remove('space-y-1', 'space-y-2', 'space-y-3');
    } else {
        // العودة للوضع الطبيعي (القائمة)
        box.style.display = 'block'; // إلغاء الشبكة
        box.style.gridTemplateColumns = 'none';
        box.style.gap = '0';
        box.classList.add('space-y-1');
    }
    q.options.forEach((o, i) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        
        // --- تعديل الشكل لوضع الماراثون (حجم أصغر) ---
        if (quizState.mode === 'marathon') {
            // 1. تقليل الارتفاع ليصبح أصغر (135px بدلاً من 160px)
            btn.style.setProperty('height', '135px', 'important');      
            btn.style.setProperty('min-height', '135px', 'important');
            btn.style.setProperty('max-height', '135px', 'important');
            
            // 2. كسر قفل الترتيب (فوق بعض)
            btn.style.setProperty('flex-direction', 'column', 'important');
            btn.style.setProperty('justify-content', 'center', 'important');
            btn.style.setProperty('align-items', 'center', 'important');
            
            // 3. تقليل المسافة الفاصلة قليلاً لتوفير المساحة
            btn.style.setProperty('gap', '8px', 'important'); 

            // 4. تنسيقات النص
            btn.style.textAlign = 'center';
            btn.style.whiteSpace = 'normal'; 
            btn.style.padding = '8px'; // تقليل الحشوة قليلاً
            btn.style.lineHeight = '1.3';
            btn.style.margin = '0';
            
            // تصغير الخط قليلاً جداً ليتناسب مع الحجم الجديد
            btn.style.setProperty('font-size', '1.1em', 'important');
        }

        btn.innerHTML = `<span class="option-number">${formatNumberAr(i+1)}</span> ${o}`;
        btn.onclick = () => selectAnswer(i, btn);
btn.classList.add('grid-pop');
btn.style.animationDelay = `${i * 0.1}s`; 

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
    if (!userProfile.stats.enrichmentCount) userProfile.stats.enrichmentCount = 0;
    userProfile.stats.enrichmentCount++;

    if (!userProfile.stats.explanationsViewed) userProfile.stats.explanationsViewed = 0;
    userProfile.stats.explanationsViewed++;

    if (effectiveUserId) {
        updateDoc(doc(db, "users", effectiveUserId), {
            "stats.enrichmentCount": userProfile.stats.enrichmentCount,
            "stats.explanationsViewed": userProfile.stats.explanationsViewed
        }).catch(e => console.error("فشل حفظ عداد القراءة", e));
    }

    getEl('enrichment-content').textContent = text;
    const modal = getEl('enrichment-modal');
    modal.classList.add('active');
    
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
    if(!quizState.active || quizState.processingAnswer) return;
    quizState.processingAnswer = true; 

    stopTimer();
    const answerTime = Date.now() - quizState.startTime;
    const q = quizState.questions[quizState.idx];
    const isCorrect = idx === q.correctAnswer;
    const btns = document.querySelectorAll('.option-btn');
    
    btns.forEach(b => b.classList.add('pointer-events-none', 'opacity-60'));
    
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
        if (answerTime <= 5000) { quizState.fastAnswers++; }

        if (quizState.mode === 'marathon') {
            userProfile.stats.marathonCorrectTotal = (userProfile.stats.marathonCorrectTotal || 0) + 1;
        }

        if (quizState.contextTopic === "مراجعة الأخطاء") {
            userProfile.stats.reviewedMistakesCount = (userProfile.stats.reviewedMistakesCount || 0) + 1;
        }

        let basePoints = 1;
        let multiplier = 1;
        let multiplierText = "";

        if (quizState.mode === 'marathon') {
            quizState.streak++;

            if(quizState.streak > userProfile.stats.maxStreak) { userProfile.stats.maxStreak = quizState.streak; }

            quizState.marathonCorrectStreak = (quizState.marathonCorrectStreak || 0) + 1;
            if(quizState.marathonCorrectStreak === 15) {
                userProfile.inventory.lives++;
                updateDoc(doc(db, "users", effectiveUserId), { "inventory.lives": userProfile.inventory.lives });
                toast("🎉 إنجاز رائع! حصلت على قلب إضافي", "success");
                quizState.lives++;
                renderLives();

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
        // --- 👇 بداية كود تتبع المهام اليومية (محدث للقائمة الجديدة) 👇 ---
        
        // المهمة 3: أسئلة الماراثون (ID: 3)
        if (quizState.mode === 'marathon') {
            updateQuestProgress(3, 1);
        }

        // تعريف المتغير (تأكدنا من الاسم لتجنب الأخطاء)
        const questTopic = q.topic || quizState.contextTopic;

        // المهمة 1: أسئلة المعصومين (ID: 1)
        if (questTopic && (questTopic.includes('المعصومين') || questTopic.includes('أهل البيت') || questTopic.includes('الإمام') || questTopic.includes('النبي'))) {
             updateQuestProgress(1, 1);
        }

        // المهمة 4: الثقافة المهدوية (ID: 4) - التحديث الجديد والشامل
        if (questTopic && (
            questTopic.includes('مهدي') || 
            questTopic.includes('حجة') || 
            questTopic.includes('منتظر') || 
            questTopic.includes('قائم') ||
            questTopic.includes('الظهور') ||        // يشمل: علامات الظهور
            questTopic.includes('السفراء') ||       // يشمل: السفراء الأربعة
            questTopic.includes('الغيبة') ||        // يشمل: الغيبة الصغرى والكبرى
            questTopic.includes('دولة العدل')       // يشمل: دولة العدل الإلهي
        )) {
             updateQuestProgress(4, 1);
        }
        // --- 👆 نهاية كود تتبع المهام اليومية 👆 ---


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
    if (monthlyStats.key !== currentMonthKey) { monthlyStats = { key: currentMonthKey, correct: 0 }; }
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

    if (quizState.usedHelpers) {
        toast("عذراً، يسمح بمساعدة واحدة فقط لكل سؤال! 🚫", "error");
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
        // المهمة 2: استخدام 5 مساعدات (ID: 2)
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

// ==========================================
// ✅ إصلاح أزرار الإغلاق (Global Close Handler)
// ==========================================
document.addEventListener('click', (e) => {
    // التحقق مما إذا كان العنصر المضغوط هو زر إغلاق (أو داخله)
    const closeBtn = e.target.closest('.close-modal');

    if (closeBtn) {
        e.preventDefault();
        e.stopPropagation();

        // 1. الإغلاق البصري الفوري (لحل مشكلة عدم الاستجابة)
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
        
        // إغلاق القائمة الجانبية إذا كانت مفتوحة
        toggleMenu(false);

        // تشغيل صوت النقر (إذا كان مفعلاً)
        if(typeof playSound === 'function') playSound('click');

        // 2. معالجة زر الرجوع في المتصفح (History)
        // نعود للخلف خطوة فقط إذا كان هناك سجل مفتوح، لتجنب الخروج من الموقع
        if (window.history.state && (window.history.state.modalOpen || window.history.state.menuOpen)) {
            window.history.back();
        }
    }
});

// مستمع لزر الرجوع في الهاتف لضمان إغلاق النوافذ
window.addEventListener('popstate', () => {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    toggleMenu(false);
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

// في ملف main.js - استبدل دالة loadLeaderboard بالكامل

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
        if(modalTitle) modalTitle.parentNode.after(subTitle);
    }
    subTitle.textContent = "التنافس على لقب بطل هذا الشهر";

    try {
        const currentMonthKey = getCurrentMonthKey();
        const q = query(collection(db, "users"), where("monthlyStats.key", "==", currentMonthKey), orderBy("monthlyStats.correct", "desc"), limit(20));
        
        const s = await getDocs(q);
        const l = getEl('leaderboard-list');
        l.innerHTML = '';
        
        if (s.empty) {
            l.innerHTML = `<div class="text-center text-slate-400 py-6">بداية شهر جديد! كن أول المنافسين في القائمة.</div>`;
            return;
        }
        
        // 🚨 الخطوة الجديدة: جلب حالات التواجد من RTDB
        const statusUpdates = {};
        const statusRef = ref(rtdb, 'status');
        
        // نقوم بجلب كل الحالات دفعة واحدة (RTDB قراءة خفيفة جداً)
        onValue(statusRef, (snapshot) => {
             snapshot.forEach((child) => {
                 statusUpdates[child.key] = child.val();
             });
             // بعد جلب الحالات، نقوم بإنشاء القائمة
             renderLeaderboardList(s.docs, l, statusUpdates);
        }, { onlyOnce: true }); // نجلبها مرة واحدة لتسريع العرض

    } catch(e) { 
        console.error(e); 
        // رسالة الخطأ تبقى كما هي
        getEl('leaderboard-list').innerHTML = `<div class="text-center text-red-400 mt-4">خطأ في التحميل (قد تحتاج لإنشاء Index أو تفعيل RTDB)</div>`; 
    }
}

function renderLeaderboardList(docs, container, statusUpdates) {
    container.innerHTML = '';
    let r = 1;
    
    docs.forEach(doc => {
        const data = doc.data();
        const userId = doc.id;
        
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
        
        // --- منطق الحالة (تم التعديل لاستخدام Tailwind مباشرة) ---
        let statusLine = '';
        const userStatus = statusUpdates[userId];
        const isOnline = userStatus && userStatus.state === 'online';
        
        if (isOnline) {
            // ✅ متصل: نقطة خضراء (استخدام كلاسات Tailwind مباشرة لضمان الظهور)
            statusLine = `
                <div class="flex items-center gap-1.5 mt-1">
                    <span class="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)] animate-pulse inline-block"></span>
                    <span class="text-[10px] text-green-400 font-bold leading-none pt-0.5">نشط الآن</span>
                </div>`;
        } else if (userStatus && userStatus.last_changed) {
            // ⚪ غير متصل: نقطة رمادية
            const lastSeenTimestamp = userStatus.last_changed;
            const timeDiff = Date.now() - lastSeenTimestamp;
            let timeAgo;

            if (timeDiff < 60000) { 
                timeAgo = `منذ لحظات`;
            } else if (timeDiff < 3600000) { 
                const minutes = Math.floor(timeDiff / 60000);
                timeAgo = `منذ ${formatNumberAr(minutes)} دقيقة`;
            } else if (timeDiff < 86400000) { 
                const hours = Math.floor(timeDiff / 3600000);
                timeAgo = `منذ ${formatNumberAr(hours)} ساعة`;
            } else {
                const days = Math.floor(timeDiff / 86400000);
                timeAgo = `منذ ${formatNumberAr(days)} يوم`;
            }
            
            statusLine = `
                <div class="flex items-center gap-1.5 mt-1">
                    <span class="w-2 h-2 rounded-full bg-slate-500 opacity-50 inline-block"></span>
                    <span class="text-[9px] text-slate-500 opacity-80 leading-none pt-0.5">${timeAgo}</span>
                </div>`;
        } else {
            // ⚫ لا توجد بيانات
            statusLine = `
                <div class="flex items-center gap-1.5 mt-1">
                    <span class="w-2 h-2 rounded-full bg-slate-600 opacity-30 inline-block"></span>
                    <span class="text-[9px] text-slate-600 opacity-50 leading-none pt-0.5">غير متاح</span>
                </div>`;
        }

        let fontSizeClass = 'text-lg';
        const nameLen = (data.username || "").length;
        if (nameLen > 25) fontSizeClass = 'text-[10px] leading-tight'; 
        else if (nameLen > 18) fontSizeClass = 'text-xs'; 
        else if (nameLen > 12) fontSizeClass = 'text-sm'; 

        const row = document.createElement('div');
        row.className = `flex justify-between items-center p-3 ${bgClass} rounded-xl border-2 ${borderClass} mb-3 transition transform hover:scale-[1.01] cursor-pointer group hover:bg-slate-700 relative`;
        
        row.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="flex items-center justify-center min-w-[40px] shrink-0">${medalIcon}</div>
                <div class="flex items-center justify-center shrink-0 relative z-10">
                    <div class="relative">
                        ${avatarHtml}
                    </div>
                </div>
                <div class="flex flex-col overflow-hidden w-full justify-center">
                    <span class="text-white ${fontSizeClass} font-bold group-hover:text-amber-400 transition whitespace-nowrap overflow-hidden text-ellipsis" style="font-family: 'Amiri', serif;">${data.username}</span>
                    ${statusLine}
                </div>
            </div>
            <div class="text-center pl-2 shrink-0 min-w-[60px]">
                <span class="text-green-400 font-mono font-bold text-lg block leading-none text-shadow">${formatNumberAr(correctCount)}</span>
                <span class="material-symbols-rounded text-[10px] text-slate-500">check_circle</span>
            </div>`;
        
        row.onclick = () => showPlayerProfile(data);
        container.appendChild(row);
        r++;
    });
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
// --- تحسين منطق تغيير حجم الخط وحفظه ---

// --- كود التحكم بحجم الخط (المحسن) ---

// 1. عند تحميل التطبيق: استعادة الحجم وتحديث الرقم
const savedFontSize = localStorage.getItem('app_font_size');
if (savedFontSize) {
    document.documentElement.style.setProperty('--base-size', savedFontSize + 'px');
    const slider = getEl('font-size-slider');
    const numDisplay = getEl('font-size-number');
    
    if (slider) slider.value = savedFontSize;
    if (numDisplay) numDisplay.textContent = savedFontSize; // تحديث الرقم عند التحميل
}

// 2. عند تحريك الشريط (تحديث فوري للنص والرقم)
bind('font-size-slider', 'input', (e) => {
    const newVal = e.target.value;
    
    // تطبيق الحجم
    document.documentElement.style.setProperty('--base-size', newVal + 'px');
    
    // تحديث الرقم الظاهر للمستخدم
    const numDisplay = getEl('font-size-number');
    if (numDisplay) numDisplay.textContent = newVal;
    
    // حفظ في الذاكرة
    localStorage.setItem('app_font_size', newVal);
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

    // 3. عرض الصورة الشخصية + الإطار (التعديل الجديد) 🌟
    const avatarContainer = document.querySelector('#user-modal .relative.w-24.h-24');
    
    // أ) تنظيف أي إطار قديم لمنع التكرار
    const oldFrame = avatarContainer.querySelector('.avatar-frame-overlay');
    if (oldFrame) oldFrame.remove();

    // ب) عرض الصورة أو الأيقونة
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

    // ج) إضافة الإطار المختار (إن وجد)
    const currentFrameId = userProfile.equippedFrame || 'default';
    if (currentFrameId !== 'default') {
        const frameObj = framesData.find(f => f.id === currentFrameId);
        if (frameObj) {
            const frameDiv = document.createElement('div');
            // نضيف pointer-events-none لضمان إمكانية الضغط على زر تغيير الصورة
            frameDiv.className = `avatar-frame-overlay ${frameObj.cssClass}`;
            frameDiv.style.pointerEvents = 'none'; 
            avatarContainer.appendChild(frameDiv);
        }
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

    // 5. عرض الأوسمة
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


function getCurrentMonthKey() {
    const d = new Date();
    // التعديل: استخدام التاريخ المحلي أيضاً
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    
    return `${year}-${month}`;
}

// ==========================================
// 🛍️ نظام المتجر والحقيبة الجديد (Zero-Flicker)
// ==========================================

let isBagSystemInitialized = false;

function openBag() {
    toggleMenu(false);
    
    // 1. التهيئة لمرة واحدة فقط (بناء الهيكل)
    if (!isBagSystemInitialized) {
        initBagSystem();
        isBagSystemInitialized = true;
    }

    // 2. تحديث الحالة فقط (سريع جداً ولا يسبب وميض)
    updateBagState();
    
    // 3. فتح النافذة
    openModal('bag-modal');
}

// دالة البناء الأولي (تعمل مرة واحدة فقط عند فتح التطبيق لأول مرة)
function initBagSystem() {
    // --- أ) بناء قسم الحقيبة (Inventory) ---
    // سنقوم بإنشاء بطاقة لكل إطار موجود في اللعبة، لكن سنخفي غير المملوك منها بالـ CSS
    const invContainer = getEl('inventory-view');
    // تنظيف الحاوية لضمان عدم التكرار
    const existingList = getEl('inv-frames-grid-new');
    if (existingList) existingList.remove();

    // إنشاء الشبكة
    const invGrid = document.createElement('div');
    invGrid.id = 'inv-frames-grid-new';
    invGrid.className = 'game-store-grid';

    // عنوان القسم
    const invHeader = document.createElement('h4');
    invHeader.className = "text-sm text-slate-400 mb-3 font-bold mt-4 border-t border-slate-700 pt-4";
    invHeader.textContent = "إطاراتي (اضغط للتجهيز)";
    invContainer.appendChild(invHeader);

    // إضافة كل الإطارات الممكنة للشبكة
    framesData.forEach(f => {
        const card = createGameItemCard(f, 'inventory');
        invGrid.appendChild(card);
    });
    invContainer.appendChild(invGrid);


    // --- ب) بناء قسم المتجر (Shop) ---
    const shopContainer = getEl('shop-view');
    const existingShopGrid = getEl('shop-frames-grid-new');
    if (existingShopGrid) existingShopGrid.remove();

    const shopGrid = document.createElement('div');
    shopGrid.id = 'shop-frames-grid-new';
    shopGrid.className = 'game-store-grid'; // نفس كلاس الشبكة
    // نستخدم grid-cols-2 للمتجر ليكون العرض أكبر قليلاً إذا أردت، أو نتركه موحد
    shopGrid.style.gridTemplateColumns = "repeat(2, 1fr)"; 

    const shopHeader = document.createElement('h4');
    shopHeader.className = "text-amber-400 text-sm font-bold mt-6 mb-3 flex items-center gap-1";
    shopHeader.innerHTML = `<span class="material-symbols-rounded">image</span> إطارات الأفاتار`;
    shopContainer.appendChild(shopHeader);

    // إضافة الإطارات (ما عدا الافتراضي) للمتجر
    framesData.forEach(f => {
        if (f.id === 'default') return;
        const card = createGameItemCard(f, 'shop');
        shopGrid.appendChild(card);
    });
    shopContainer.appendChild(shopGrid);
}

// دالة مساعدة لإنشاء HTML البطاقة (CSS نقي)
function createGameItemCard(fData, type) {
    const btn = document.createElement('button');
    // نضع ID مميز للزر لسهولة الوصول إليه عند التحديث
    btn.id = `btn-${type}-${fData.id}`;
    btn.className = 'game-item-card';
    
    // محتوى البطاقة
    const previewHTML = getAvatarHTML(userProfile.customAvatar, fData.id, "w-10 h-10");
    
    let actionHTML = '';
    if (type === 'shop') {
        actionHTML = `<span class="game-item-price">${formatNumberAr(fData.price)}</span>`;
    } else {
        // في الحقيبة نضيف شارة التجهيز
        actionHTML = `<div class="equip-badge"><span class="material-symbols-rounded" style="font-size:10px">check</span></div>`;
    }

    btn.innerHTML = `
        ${previewHTML}
        <span class="game-item-name">${fData.name}</span>
        ${actionHTML}
    `;

    // ربط الأحداث
    btn.onclick = () => {
        if (type === 'inventory') {
            equipFrame(fData.id);
        } else {
            // التحقق من الملكية يتم داخل دالة الشراء، لكن يمكننا منع الضغط بصرياً
            if (!btn.classList.contains('owned')) {
                window.buyShopItem('frame', fData.price, fData.id);
            }
        }
    };

    return btn;
}


// دالة التحديث (تعمل عند كل فتح للحقيبة أو شراء)
function updateBagState() {
    // 1. تحديث النصوص (الرصيد والعدادات)
    getEl('bag-user-score').textContent = formatNumberAr(userProfile.highScore);
    const inv = userProfile.inventory;
    getEl('inv-lives-count').textContent = formatNumberAr(inv.lives || 0);       
    getEl('inv-fifty-count').textContent = formatNumberAr(inv.helpers.fifty || 0); 
    getEl('inv-hint-count').textContent = formatNumberAr(inv.helpers.hint || 0);   
    getEl('inv-skip-count').textContent = formatNumberAr(inv.helpers.skip || 0);

    const ownedFrames = userProfile.inventory.frames || ['default'];
    const currentFrame = userProfile.equippedFrame;

    // 2. تحديث عناصر الحقيبة (Inventory)
    framesData.forEach(f => {
        const btn = document.getElementById(`btn-inventory-${f.id}`);
        if (!btn) return;

        // أ) هل أملك هذا الإطار؟
        if (ownedFrames.includes(f.id)) {
            btn.classList.remove('game-item-hidden'); // إظهار
        } else {
            btn.classList.add('game-item-hidden'); // إخفاء
        }

        // ب) هل هو مجهز؟
        if (f.id === currentFrame) {
            btn.classList.add('equipped');
        } else {
            btn.classList.remove('equipped');
        }
        
        // تحديث صورة الأفاتار داخل الزر (في حال غير المستخدم صورته)
        const avatarContainer = btn.querySelector('.avatar-wrapper');
        if(avatarContainer) {
             avatarContainer.outerHTML = getAvatarHTML(userProfile.customAvatar, f.id, "w-10 h-10");
        }
    });

    // 3. تحديث عناصر المتجر (Shop)
    framesData.forEach(f => {
        if (f.id === 'default') return;
        const btn = document.getElementById(`btn-shop-${f.id}`);
        if (!btn) return;

        if (ownedFrames.includes(f.id)) {
            btn.classList.add('owned');
            // إخفاء السعر وإظهار "مملوك"
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
            
            // ✅ التصحيح: جعلنا هذا الشرط هو الأول (if بدلاً من else if)
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
                
                // ✅ التغيير هنا: نستخدم دالة التحديث الجديدة
                updateBagState(); 
                
                updateProfileUI(); 
                 
                // إزالة ذكر الثيم من الإشعار
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


// ربط أزرار الحقيبة
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
    // --- التحقق من بنك الأخطاء ---
    if (userProfile.wrongQuestionsBank && userProfile.wrongQuestionsBank.length > 0) {
        openModal('force-review-modal');
        return; // إيقاف الدالة
    }

    // فتح النافذة فقط دون تعطيل الأزرار الخلفية
    document.getElementById('marathon-rules-modal').classList.add('active'); 
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

btn.innerHTML = `<span class="text-lg">أكمل النور</span> <span class="material-symbols-rounded">local_fire_department</span>`;
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
        btn.innerHTML = `<span class="text-lg">(أكمل النور)</span> <span class="material-symbols-rounded">directions_run</span>`;

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

bind('btn-force-review-confirm', 'click', () => {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    getEl('review-mistakes-btn').click();
});


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

    // أولوية 2: نحن داخل اللعبة ولا توجد نوافذ مفتوحة
    if (quizState.active) {
        window.history.pushState({ view: 'playing' }, "", ""); // منع الرجوع

        window.showConfirm(
            "مغادرة المسابقة",
            "هل تريد الانسحاب؟ سيتم احتساب النقاط والإجابات الصحيحة الحالية.",
            "logout",
            async () => {
                quizState.active = false; 
                
                // نسخ نفس منطق الحفظ الشامل هنا أيضاً
                if (quizState.score > 0 || quizState.correctCount > 0) {
                    try {
                        const userRef = doc(db, "users", effectiveUserId);
                        const currentTopic = quizState.contextTopic;
                        const safeCorrect = quizState.correctCount || 0;
                        
                        const updates = {
                            highScore: increment(quizState.score),
                            "stats.quizzesPlayed": increment(1),
                            "stats.totalCorrect": increment(safeCorrect), // ✅
                            "stats.totalQuestions": increment(quizState.idx) // ✅
                        };

                        if (currentTopic && currentTopic !== 'عام' && currentTopic !== 'مراجعة الأخطاء') {
                            updates[`stats.topicCorrect.${currentTopic}`] = increment(safeCorrect);
                        }

                        // الأسبوعي
                        const wKey = getCurrentWeekKey();
                        let newWeekly = userProfile.weeklyStats || { key: wKey, correct: 0 };
                        if (newWeekly.key !== wKey) newWeekly = { key: wKey, correct: 0 };
                        newWeekly.correct += safeCorrect;
                        updates.weeklyStats = newWeekly;

                        // الشهري
                        const mKey = getCurrentMonthKey();
                        let newMonthly = userProfile.monthlyStats || { key: mKey, correct: 0 };
                        if (newMonthly.key !== mKey) newMonthly = { key: mKey, correct: 0 };
                        newMonthly.correct += safeCorrect;
                        updates.monthlyStats = newMonthly;

                        await updateDoc(userRef, updates);

                        // تحديث محلي
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
    
    // تنظيف المحتوى السابق
    box.innerHTML = ''; 

    // --- منطق تبديل شكل الخيارات (قائمة vs شبكة) ---
    if (quizState.mode === 'marathon') {
        // 1. تفعيل وضع الشبكة
        box.classList.add('options-grid-mode');
        // 2. هام جداً: إزالة كلاسات التباعد العمودي الخاصة بـ Tailwind
        // (إذا لم نحذفها، ستخرب شكل الشبكة)
        box.classList.remove('space-y-1', 'space-y-2', 'space-y-3'); 
    } else {
        // 1. إزالة وضع الشبكة
        box.classList.remove('options-grid-mode');
        // 2. إعادة كلاس التباعد العمودي للقائمة العادية
        box.classList.add('space-y-1'); 
    }

    
    box.innerHTML = ''; // تفريغ المحتوى القديم

        
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
    if (!navigator.onLine) {
        toast("هذه الميزة تتطلب اتصالاً بالإنترنت ", "error");
        return; // إيقاف العملية فوراً
    }
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
// ==========================================
// 📡 مراقب حالة الاتصال (Online/Offline Monitor)
// ==========================================

function updateOnlineStatus() {
    const banner = document.getElementById('offline-banner');
    if (!banner) return;

    if (navigator.onLine) {
        // حالة الاتصال: إخفاء الشريط
        banner.classList.remove('show-offline');
        banner.classList.add('hidden');
    } else {
        // حالة الانقطاع: إظهار الشريط
        banner.classList.remove('hidden');
        // تأخير بسيط للسماح للمتصفح بإزالة hidden قبل تفعيل الحركة
        setTimeout(() => {
            banner.classList.add('show-offline');
        }, 10);
        
        // تنبيه المستخدم (Toast)
        if(typeof toast === 'function') toast("انقطع الاتصال بالإنترنت ", "error");
    }
}

// الاستماع للأحداث
window.addEventListener('online', () => {
    updateOnlineStatus();
    if(typeof toast === 'function') toast("عاد الاتصال! تمت المزامنة ", "success");
});
window.addEventListener('offline', updateOnlineStatus);

// التحقق عند بدء التشغيل
document.addEventListener('DOMContentLoaded', updateOnlineStatus);


// --- تفعيل أزرار الشريط السفلي الجديدة (محدث للعمل المباشر) ---

// 1. ربط زر المتصدرين السفلي (تم نقل منطق الفتح إلى هنا مباشرة)
bind('bottom-leaderboard-btn', 'click', () => {
    toggleMenu(false); // إغلاق القائمة الجانبية
    openModal('leaderboard-modal'); // فتح النافذة
    
    // تنظيف التبويبات القديمة إن وجدت لضمان التحديث
    const oldTabs = document.getElementById('lb-tabs-container');
    if (oldTabs) oldTabs.remove();

    // استدعاء دالة تحميل البيانات
    loadLeaderboard();
});

// 2. ربط زر الحقيبة السفلي
bind('bottom-bag-btn', 'click', () => {
    toggleMenu(false);
    openBag(); // دالة فتح الحقيبة تعمل بشكل مباشر ولا تحتاج تعديل
});

// ✅ جعل دوال الاستلام مرئية لملف HTML
window.claimSingleReward = claimSingleReward;
window.claimGrandPrize = claimGrandPrize;
window.buyShopItem = buyShopItem; // إذا كانت غير مفعلة أيضاً



// ==========================================
// 🎓 نظام التعلم الذكي (Clean Code Implementation)
// ==========================================

function checkContentAvailability(topicName) {
    // 1. إذا كان الموضوع غير محدد أو عام، نرفض فوراً
    if (!topicName || topicName === "عام" || topicName === "random") return null;

    const audioId = findContentId(topicName, audioLibrary);
    const pdfId = findContentId(topicName, pdfLibrary);

    // ✅ التصحيح: التحقق من وجود قيمة (سواء كانت رقماً أو نصاً)
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

/**
 * 3. فتح نافذة خيارات التعلم (محدثة)
 */
function openLearnModal(topic, audioId, pdfId) {
    const modal = document.getElementById('learn-mode-modal');
    const titleEl = document.getElementById('learn-topic-title');
    const btnListen = document.getElementById('btn-mode-listen');
    const btnRead = document.getElementById('btn-mode-read');

    if (!modal) return;

    // تحديث العنوان
    if (titleEl) titleEl.textContent = topic;

    // إعداد زر الاستماع
    if (btnListen) {
        // ✅ التصحيح: التحقق المرن (يقبل الصفر والأرقام والنصوص)
        if (audioId !== null && audioId !== undefined) {
            btnListen.onclick = () => {
                modal.classList.add('hidden'); 
                modal.classList.remove('active'); // إزالة الكلاس النشط
                modal.style.display = 'none'; 
                // تحويل الـ ID إلى نص عند تمريره للمشغل لضمان توافق الرابط
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

    // إعداد زر القراءة
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

    // 🔥 عرض النافذة بالقوة
    modal.classList.remove('hidden');
    modal.classList.add('active');
    modal.style.display = 'flex';
}

async function handlePdfReward() {
    const btn = document.getElementById('pdf-finish-btn');
    if (!btn || btn.disabled) return;

    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-rounded animate-spin">refresh</span> جاري الاحتساب...`;

    try {
        if (!effectiveUserId) {
            if(window.toast) window.toast("يجب تسجيل الدخول لاحتساب النقاط", "warning");
            btn.disabled = false;
            btn.innerHTML = "استلام المكافأة";
            return;
        }

        const pointsToAdd = 5;

        const wKey = getCurrentWeekKey();
        let wStats = userProfile.weeklyStats || { key: wKey, correct: 0 };
        if (wStats.key !== wKey) wStats = { key: wKey, correct: 0 };
        wStats.correct += pointsToAdd;

        const mKey = getCurrentMonthKey();
        let mStats = userProfile.monthlyStats || { key: mKey, correct: 0 };
        if (mStats.key !== mKey) mStats = { key: mKey, correct: 0 };
        mStats.correct += pointsToAdd;

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

        if (typeof updateProfileUI === 'function') updateProfileUI();

        if(window.playSound) window.playSound('win');
        if(window.toast) window.toast(`🎉 ممتاز! أضيفت ${pointsToAdd} نقاط لرصيدك`, "success");

        btn.innerHTML = `<span>تم الاستلام</span><span class="material-symbols-rounded">check_circle</span>`;
        
        setTimeout(() => {
            if(pdfViewer) pdfViewer.close();
            btn.disabled = false; 
            btn.innerHTML = `<span>استلام المكافأة</span><span class="material-symbols-rounded">card_giftcard</span>`;
        }, 1500);

    } catch (error) {
        console.error("Reward Error:", error);
        if(window.toast) window.toast("حدث خطأ في الاتصال", "error");
        btn.disabled = false;
        btn.innerHTML = "حاول مرة أخرى";
    }
}

// ==========================================
// 🚀 التشغيل الرئيسي (Main Initialization)
// هذا الكود يعمل مرة واحدة فقط عند جاهزية الصفحة
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 جاري تهيئة نظام التعلم الذكي...");

    // 1. ربط زر التعلم (AI Learn Button)
    const learnBtn = document.getElementById('ai-learn-btn');
    if (learnBtn) {
        // إزالة أي مستمعين سابقين عبر استبدال العنصر (اختياري للنظافة القصوى)
        const newBtn = learnBtn.cloneNode(true);
        learnBtn.parentNode.replaceChild(newBtn, learnBtn);
        
        // ربط الحدث الجديد
        newBtn.addEventListener('click', handleLearnClick);
        console.log("✅ زر التعلم جاهز.");
    }

    // 2. ربط زر مكافأة الكتاب
    const rewardBtn = document.getElementById('pdf-finish-btn');
    if (rewardBtn) {
        rewardBtn.onclick = handlePdfReward;
    }

    // 3. ربط أزرار إغلاق النوافذ الجديدة (إن وجدت)
    const closeLearnModalBtn = document.getElementById('close-learn-modal');
    if(closeLearnModalBtn) {
        closeLearnModalBtn.onclick = () => {
            document.getElementById('learn-mode-modal').classList.add('hidden');
        };
    }
});
