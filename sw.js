const CONFIG = {
    version: 'ahlulbayt-quiz-v2.1-fix-path', // قمت بتحديث الإصدار
    staticAssets: [
        './',
        './index.html',
        './tailwind-lib.js',
        './Icon.png',
        './Css.png',
        'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Reem+Kufi:wght@400;500;700&display=swap',
        'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,1,0'
    ]
};

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CONFIG.version).then(cache => cache.addAll(CONFIG.staticAssets))
    );
});

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

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            return cachedResponse || fetch(event.request);
        })
    );
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    
    // جلب الرابط النسبي
    let relativeUrl = event.notification.data && event.notification.data.url ? event.notification.data.url : 'https://iqsd2020-ctrl.github.io/New/';
    
    // 👈 التعديل الجوهري هنا:
    // استخدام self.registration.scope بدلاً من self.location.origin
    // هذا يضمن أن الرابط يبدأ من مجلد /New/ (أو أي مجلد يوجد فيه التطبيق)
    let urlToOpen = new URL(relativeUrl, self.registration.scope).href;

    const promiseChain = clients.matchAll({
        type: 'window',
        includeUncontrolled: true
    }).then((windowClients) => {
        for (let i = 0; i < windowClients.length; i++) {
            const client = windowClients[i];
            // التحقق من أن النافذة المفتوحة تطابق الرابط المطلوب
            if (client.url === urlToOpen && 'focus' in client) {
                return client.focus();
            }
        }
        if (clients.openWindow) {
            return clients.openWindow(urlToOpen);
        }
    });

    event.waitUntil(promiseChain);
});
