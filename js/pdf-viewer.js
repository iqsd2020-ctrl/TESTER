import { PDF_BASE_URL } from './DataPdf.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

export default class SmartPdfViewer {
    /**
     * @param {Object} db - كائن قاعدة البيانات Firestore
     * @param {Function} getCurrentUser - دالة تعيد معرف المستخدم الحالي (effectiveUserId)
     */
    constructor(db, getCurrentUser) {
        this.db = db; // تخزين قاعدة البيانات لاستخدامها لاحقاً
        this.getCurrentUser = getCurrentUser; // تخزين دالة جلب المستخدم

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
            this.canvas.style.transition = "opacity 0.2s ease-out"; 
            this.canvas.style.opacity = "0";
        }
        if (this.zoomContainer) {
            this.zoomContainer.style.transformOrigin = "center center"; 
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

    // ✅ دالة التحقق هل تم استلام المكافأة من قبل؟
    async checkRewardStatus(bookId) {
        // نستخدم الدالة الممررة لجلب المستخدم الحالي بدلاً من المتغير العام
        const userId = this.getCurrentUser();

        // إذا كان المستخدم ضيفاً، لا نفعل شيئاً
        if (!userId) return;

        const btn = this.elements.finishBtn;
        
        this.isRewardClaimed = false; 
        if(btn) {
            btn.disabled = false;
            btn.innerHTML = `<span>استلام المكافأة</span><span class="material-symbols-rounded">card_giftcard</span>`;
            btn.classList.remove('bg-slate-700', 'text-slate-400', 'cursor-not-allowed');
        }

        try {
            // نستخدم this.db بدلاً من db العام
            const historyRef = doc(this.db, "users", userId, "read_history", bookId);
            const docSnap = await getDoc(historyRef);

            if (docSnap.exists()) {
                console.log(` الكتاب ${bookId} تم استلام جائزته سابقاً.`);
                
                this.isRewardClaimed = true;
                if(btn) {
                    btn.disabled = true;
                    btn.innerHTML = `<span>تم الاستلام مسبقاً</span><span class="material-symbols-rounded">check</span>`;
                    btn.classList.add('bg-slate-700', 'text-slate-400', 'cursor-not-allowed');
                }
            }

        } catch (error) {
            console.error("❌ خطأ في التحقق من سجل القراءة:", error);
        }
    }

    async loadDocument(id, title) {
        if (!id || typeof id !== 'string' || id.trim() === '') {
            console.warn("⚠️ محاولة فتح كتاب بمعرف غير صالح:", id);
            if(window.toast) window.toast("عذراً، ملف الكتاب غير متوفر حالياً لهذا الموضوع", "error");
            return;
        }

        this.currentPdfId = id;
        this.checkRewardStatus(id); 
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

            // pdfjsLib متاح عالمياً لأنه مكتبة محملة في HTML
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
                msg = "الملف قيد التجهيز سيتم رفعه قريبا";
            } else if (error.name === 'InvalidPDFException') {
                msg = "ملف الكتاب تالف أو غير صالح";
            }
            
            if(window.toast) window.toast(msg, "error");
        }
    }

    async renderPage(num) {
        this.pageRendering = true;
        
        if (this.canvas) this.canvas.style.opacity = "0";
        await new Promise(r => setTimeout(r, 80));

        try {
            let page;
            if (this.nextPagePromise && this.nextPageNum === num) {
                page = await this.nextPagePromise;
            } else {
                page = await this.pdfDoc.getPage(num);
            }
            
            const container = document.getElementById('pdf-canvas-container');
            const containerWidth = container ? container.clientWidth : window.innerWidth;
            const containerHeight = container ? container.clientHeight : window.innerHeight;
            
            const viewportRaw = page.getViewport({ scale: 1 });
            
            const scaleX = containerWidth / viewportRaw.width;
            const scaleY = containerHeight / viewportRaw.height;
            
            let fitScale = Math.min(scaleX, scaleY);
 
            const outputScale = window.devicePixelRatio || 1;
            const viewport = page.getViewport({ scale: fitScale });

            this.canvas.width = Math.floor(viewport.width * outputScale);
            this.canvas.height = Math.floor(viewport.height * outputScale);
            this.canvas.style.width = Math.floor(viewport.width) + "px";
            this.canvas.style.height = Math.floor(viewport.height) + "px";

            this.baseWidth = viewport.width;
            this.baseHeight = viewport.height;
            this.containerWidth = containerWidth;
            this.containerHeight = containerHeight;

            const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

            await page.render({ canvasContext: this.ctx, transform, viewport }).promise;
            
            if (this.canvas) this.canvas.style.opacity = "1";
            
            this.resetZoom();
            this.pageRendering = false;

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

    _bindGestures() {
        const container = document.getElementById('pdf-canvas-container');
        if (!container) return;

        container.addEventListener('touchstart', (e) => this._handleTouchStart(e), { passive: false });
        container.addEventListener('touchmove', (e) => this._handleTouchMove(e), { passive: false });
        container.addEventListener('touchend', (e) => this._handleTouchEnd(e), { passive: false });
    }

    _handleTouchStart(e) {
        if (e.touches.length === 1) {
            const currentTime = new Date().getTime();
            const tapLength = currentTime - this.lastTapTime;
            if (tapLength < 300 && tapLength > 0) {
                e.preventDefault(); 
                this._handleDoubleTap();
                return;
            }
            this.lastTapTime = currentTime;
        }

        if (e.touches.length === 2) {
            e.preventDefault();
            this.startDist = Math.hypot(
                e.touches[0].pageX - e.touches[1].pageX,
                e.touches[0].pageY - e.touches[1].pageY
            );
        } else if (e.touches.length === 1) {
            this.isDragging = true;
            this.lastPosX = e.touches[0].pageX;
            this.lastPosY = e.touches[0].pageY;
            this.touchStartX = e.touches[0].pageX;
            this.touchStartY = e.touches[0].pageY;
        }
    }

    _handleDoubleTap() {
        if (this.scale > 1) {
            this.resetZoom(); 
        } else {
            this.scale = 2.5; 
            this.posX = 0;
            this.posY = 0;
            this._updateTransform();
        }
    }

    _handleTouchMove(e) {
        if (e.touches.length === 2) {
            e.preventDefault();
            const dist = Math.hypot(
                e.touches[0].pageX - e.touches[1].pageX,
                e.touches[0].pageY - e.touches[1].pageY
            );
            
            const delta = dist / this.startDist;
            let newScale = this.lastScale * delta;
            newScale = Math.min(Math.max(1, newScale), 4); 
            
            this.scale = newScale;
            this._updateTransform();

        } else if (e.touches.length === 1 && this.scale > 1 && this.isDragging) {
            e.preventDefault();
            const currentX = e.touches[0].pageX;
            const currentY = e.touches[0].pageY;
            
            const deltaX = currentX - this.lastPosX;
            const deltaY = currentY - this.lastPosY;

            this.posX += deltaX;
            this.posY += deltaY;

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
        
        if (this.scale === 1 && e.changedTouches.length === 1) {
            const touchEndX = e.changedTouches[0].pageX;
            const touchEndY = e.changedTouches[0].pageY;
            
            const diffX = this.touchStartX - touchEndX;
            const diffY = this.touchStartY - touchEndY;

            if (Math.abs(diffX) > 50 && Math.abs(diffY) < 30) {
                this.stopAutoScroll();
                if (diffX > 0) this.nextPage();
                else this.prevPage();
            }
        }
        
        this.isDragging = false;
        
        if (this.scale < 1.1) {
            this.resetZoom();
        } else {
            this._clampOffset();
            this._updateTransform();
        }
    }

    _clampOffset() {
        const currentWidth = this.baseWidth * this.scale;
        const currentHeight = this.baseHeight * this.scale;
        
        let maxOffsetX = 0;
        let maxOffsetY = 0;

        if (currentWidth > this.containerWidth) {
            maxOffsetX = (currentWidth - this.containerWidth) / 2;
        }
        
        if (currentHeight > this.containerHeight) {
            maxOffsetY = (currentHeight - this.containerHeight) / 2;
        }

        this.posX = Math.min(Math.max(this.posX, -maxOffsetX), maxOffsetX);
        this.posY = Math.min(Math.max(this.posY, -maxOffsetY), maxOffsetY);
    }

    _updateTransform() {
        if (this.zoomContainer) {
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
        const btnClose = document.getElementById('close-pdf-btn');
        if (btnClose) {
            btnClose.onclick = (e) => {
                e.preventDefault(); 
                this.close();
            };
        } 
        if(this.elements.bottomPrev) this.elements.bottomPrev.onclick = () => { this.stopAutoScroll(); this.prevPage(); };
        if(this.elements.bottomNext) this.elements.bottomNext.onclick = () => { this.stopAutoScroll(); this.nextPage(); };
        
        if(this.elements.autoBtn) this.elements.autoBtn.onclick = () => this.toggleAutoScroll();
    }
}
