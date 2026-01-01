// ==========================================
// ⚙️ إعدادات الإشعارات
// ==========================================
// 🔴 الرابط الكامل للتطبيق (لضمان الفتح الصحيح 100%)
const APP_URL = 'https://iqsd2020-ctrl.github.io/New/';

const NOTIF_CONFIG = {
    title: "هياكل النور",
    body: "لا تنسى الصلاة على محمد وآل محمد أبدا",
    icon: 'Icon.png',
    badge: 'Icon.png',
    tag: 'daily-reminder',
    hour: 9,
    minute: 0
};

// ==========================================
// 🛠️ دوال النظام
// ==========================================
function initNotificationSystem() {
    if (!('serviceWorker' in navigator) || !('Notification' in window)) return;

    // إذا كان الإذن ممنوحاً
    if (Notification.permission === 'granted') {
        navigator.serviceWorker.ready.then(reg => {
            // 1. جدولة إشعار الغد
            scheduleDailyNotification(reg);
            
            // 2. تشغيل الإشعار الفوري (الترحيب) الآن ✅
            showWelcomeNotification();
        });
    } 
    // إذا لم يمنح الإذن بعد
    else if (Notification.permission !== 'denied') {
        document.addEventListener('click', requestPermissionAndSchedule, { once: true });
    }
}

function requestPermissionAndSchedule() {
    Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
            navigator.serviceWorker.ready.then(reg => {
                scheduleDailyNotification(reg);
                showWelcomeNotification(); // تشغيل الترحيب بعد الموافقة فوراً
            });
        }
    });
}

function scheduleDailyNotification(reg) {
    const now = new Date();
    const scheduledTime = new Date();
    scheduledTime.setHours(NOTIF_CONFIG.hour, NOTIF_CONFIG.minute, 0, 0);

    if (now > scheduledTime) {
        scheduledTime.setDate(scheduledTime.getDate() + 1);
    }

    const options = {
        body: NOTIF_CONFIG.body,
        icon: NOTIF_CONFIG.icon,
        badge: NOTIF_CONFIG.badge,
        tag: NOTIF_CONFIG.tag,
        data: { url: APP_URL } // الرابط الثابت
    };

    if ('showTrigger' in Notification.prototype) {
        options.showTrigger = new TimestampTrigger(scheduledTime.getTime());
        reg.showNotification(NOTIF_CONFIG.title, options);
    }
}

// دالة الإشعار الفوري
function showWelcomeNotification() {
    if ('serviceWorker' in navigator && Notification.permission === 'granted') {
        navigator.serviceWorker.ready.then(reg => {
            reg.showNotification("هياكل النور ازدد علمًا ووعيًا", {
                body: "لا تنسى العودة مجدداً",
                icon: 'Icon.png',
                badge: 'Icon.png',
                vibrate: [300, 100, 200],
                tag: 'welcome-notification',
                data: { url: APP_URL } // الرابط الثابت
            });
        });
    }
}

// جعل الدوال متاحة
window.initNotificationSystem = initNotificationSystem;
window.showWelcomeNotification = showWelcomeNotification;
