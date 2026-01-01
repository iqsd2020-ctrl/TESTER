
// ==========================================
// ⚙️ إعدادات الإشعارات (عدل هنا بسهولة)
// ==========================================
const NOTIF_CONFIG = {
    title: "هياكل النور",
    body: "لا تنسى الصلاة على محمد وآل محمد",
    icon: 'Icon.png',     // تأكد من المسار
    badge: 'Icon.png',
    tag: 'daily-reminder',
    hour: 9,              // ساعة الإشعار (24 ساعة)
    minute: 0             // الدقيقة
};

// ==========================================
// 🛠️ دوال النظام
// ==========================================

/**
 * دالة التهيئة الرئيسية: يتم استدعاؤها من main.js
 */
function initNotificationSystem() {
    // التحقق من الدعم أولاً
    if (!('serviceWorker' in navigator) || !('Notification' in window)) {
        console.log("الإشعارات غير مدعومة في هذا الهاتف.");
        return;
    }

    // إذا كان الإذن ممنوحاً، نقوم بالجدولة فوراً
    if (Notification.permission === 'granted') {
        navigator.serviceWorker.ready.then(reg => {
            scheduleDailyNotification(reg);
        });
    } 
    // إذا لم يمنح بعد، ننتظر تفاعل المستخدم
    else if (Notification.permission !== 'denied') {
        document.addEventListener('click', requestPermissionAndSchedule, { once: true });
    }
}

/**
 * دالة طلب الإذن عند النقر
 */
function requestPermissionAndSchedule() {
    Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
            navigator.serviceWorker.ready.then(reg => {
                scheduleDailyNotification(reg);
                // إشعار ترحيبي بسيط للتأكيد (اختياري)
                // reg.showNotification("تم تفعيل التنبيهات ✅", { body: "سصلك الإشعار يومياً الساعة 9 صباحاً" });
            });
        }
    });
}

/**
 * دالة الجدولة الفعلية والحساب
 */
function scheduleDailyNotification(reg) {
    const now = new Date();
    const scheduledTime = new Date();
    
    // ضبط الوقت بناءً على الإعدادات في الأعلى
    scheduledTime.setHours(NOTIF_CONFIG.hour, NOTIF_CONFIG.minute, 0, 0);

    // إذا كان الوقت قد فات اليوم، نجدوله للغد
    if (now > scheduledTime) {
        scheduledTime.setDate(scheduledTime.getDate() + 1);
    }

    const options = {
        body: NOTIF_CONFIG.body,
        icon: NOTIF_CONFIG.icon,
        badge: NOTIF_CONFIG.badge,
        tag: NOTIF_CONFIG.tag,
    };

    // استخدام خاصية Notification Triggers
    if ('showTrigger' in Notification.prototype) {
        options.showTrigger = new TimestampTrigger(scheduledTime.getTime());
        reg.showNotification(NOTIF_CONFIG.title, options);
        console.log(`✅ [Notifications] تمت الجدولة في: ${scheduledTime.toLocaleString()}`);
    } else {
        console.log("⚠️ [Notifications] خاصية Triggers غير مدعومة.");
    }
}

// ==========================================
// 👋 إشعار الترحيب الفوري (عند فتح التطبيق)
// ==========================================
function showWelcomeNotification() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(reg => {
            reg.showNotification("هياكل النور ازدد علمًا ووعيًا", {
                body: "لا تنسى العودة مجدداً",
                icon: 'Icon.png',
                badge: 'Icon.png',
                vibrate: [200, 100, 200],
                tag: 'welcome-notification' // تاغ مختلف لكي لا يمسح الإشعار المجدول
            });
        });
    }
}

// جعل الدالة متاحة للاستخدام العام
window.showWelcomeNotification = showWelcomeNotification;
