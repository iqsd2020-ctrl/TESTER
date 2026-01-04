import { AUDIO_BASE_URL } from './DataMp3.js';

export default class SmartAudioPlayer {
    constructor(onRewardCallback) {
        this.audio = new Audio();
        this.isPlaying = false;
        this.currentId = null;
        this.onRewardCallback = onRewardCallback; // دالة استلام النقاط

        // عناصر الواجهة
        this.elements = {
            modal: document.getElementById('audio-learning-modal'),
            playBtn: document.getElementById('audio-play-pause-btn'),
            icon: document.getElementById('audio-play-icon'),
            pauseIcon: document.getElementById('audio-pause-icon'),
            progressBar: document.getElementById('audio-progress-area'),
            progressFill: document.getElementById('audio-progress-fill'),
            currentTime: document.getElementById('audio-current-time'),
            duration: document.getElementById('audio-total-duration'),
            title: document.getElementById('audio-topic-title')
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
        
        console.log(` جاري تحميل الصوت: ${src}`);
        
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
            this.elements.modal.classList.remove('active');
            this.elements.modal.classList.add('hidden');
            this.elements.modal.style.display = 'none';
        }
    }

    _bindAudioEvents() {
        this.audio.addEventListener('timeupdate', () => {
            if (isNaN(this.audio.duration)) return;

            const currentTime = this.audio.currentTime;
            
            // حساب الفرق الزمني
            if (this.lastTime !== undefined) {
                const diff = currentTime - this.lastTime;
                if (diff > 0 && diff < 1.5) {
                    this.accumulatedTime = (this.accumulatedTime || 0) + diff;
                }
            }
            this.lastTime = currentTime;

            // التحقق من مرور 60 ثانية
            if (this.accumulatedTime >= 60) {
                this.accumulatedTime = 0; 
                
                // هنا نستدعي الدالة الخارجية بدلاً من التعامل مع Firebase مباشرة
                if (this.onRewardCallback) {
                    this.onRewardCallback();
                }
            }

            // تحديث شريط التقدم والوقت
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

        const btnForward = document.getElementById('audio-forward-btn');
        const btnRewind = document.getElementById('audio-rewind-btn');
        const btnClose = document.getElementById('close-audio-btn');

        if(btnForward) btnForward.onclick = () => this.skip(10);
        if(btnRewind) btnRewind.onclick = () => this.skip(-10);
        if(btnClose) btnClose.onclick = () => this.close();
    }

    _updatePlayIcon() {
        if (this.elements.icon && this.elements.pauseIcon) {
            if (this.isPlaying) {
                this.elements.icon.classList.add('hidden');
                this.elements.pauseIcon.classList.remove('hidden');
            } else {
                this.elements.icon.classList.remove('hidden');
                this.elements.pauseIcon.classList.add('hidden');
            }
        } else if (this.elements.icon) {
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
