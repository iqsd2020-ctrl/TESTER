// sw.js
const CONFIG = {
    version: 'ahlulbayt-quiz-v4.0-direct-link', // تحديث الإصدار
    staticAssets: [
        './',
        'index.html',
        'tailwind-lib.js',
        'Icon.png',
        'Css.png',
        'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Reem+Kufi:wght@400;500;700&display=swap',
        'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,1,0'
    ]
};

// 1. التثبيت
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CONFIG.version).then(cache => cache.addAll(CONFIG.staticAssets))
    );
});

// 2. التفعيل وتنظيف القديم
self.addEventListener('activate', (event) => {
    event.waitUntil(Promise.all([
        clients.claim(),
        caches.keys().then(keys => Promise.all(
            keys.map(key => {
                if (key !== CONFIG.version) return caches.delete(key);
            })
        ))
    ]));
});

// 3. استراتيجية الكاش
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            return cachedResponse || fetch(event.request);
        })
    );
});

// 4. معالجة النقر (بسيط ومباشر)
self.addEventListener('notificationclick', function(event) {
    event.notification.close();

    // نأخذ الرابط من البيانات، وإذا لم يوجد نستخدم الرابط الثابت كاحتياط
    const urlToOpen = event.notification.data && event.notification.data.url 
                      ? event.notification.data.url 
                      : 'https://iqsd2020-ctrl.github.io/New/';

    const promiseChain = clients.matchAll({
        type: 'window',
        includeUncontrolled: true
    }).then((windowClients) => {
        // البحث عن نافذة مفتوحة لنفس الرابط
        for (let i = 0; i < windowClients.length; i++) {
            const client = windowClients[i];
            if (client.url === urlToOpen && 'focus' in client) {
                return client.focus();
            }
        }
        // فتح نافذة جديدة
        if (clients.openWindow) {
            return clients.openWindow(urlToOpen);
        }
    });

    event.waitUntil(promiseChain);
});
