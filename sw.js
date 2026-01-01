/**
 * Service Worker Configuration
 * v1.3 - Force update strategy
 */
const CONFIG = {
    version: 'ahlulbayt-quiz-v1.3',
    staticAssets: [
        './',
        './index.html',
        './tailwind-lib.js',
        './Icon.png',
        './Css.png',
        'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Reem+Kufi:wght@400;500;700&display=swap',
        'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,1,0'
    ],
    // Domains to ignore (Network Only)
    ignoredHosts: [
        'firestore.googleapis.com',
        'identitytoolkit.googleapis.com',
        'google-analytics.com'
    ],
    // Domains to cache aggressively (Cache First)
    staticHosts: [
        'fonts.gstatic.com',
        'fonts.googleapis.com',
        'cdn.tailwindcss.com'
    ]
};

// --- Lifecycle Events ---

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CONFIG.version).then(cache => cache.addAll(CONFIG.staticAssets))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.map(key => {
                if (key !== CONFIG.version) return caches.delete(key);
            })
        ))
    );
    self.clients.claim();
});

// --- Main Fetch Event ---

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 1. Network Only (Ignore DB & Analytics)
    if (CONFIG.ignoredHosts.some(host => url.hostname.includes(host))) {
        return;
    }

    // 2. Cache First (Static Libraries & Fonts)
    if (CONFIG.staticHosts.some(host => url.hostname.includes(host))) {
        event.respondWith(cacheFirstStrategy(event.request));
        return;
    }

    // 3. Network First (Default for App Files: HTML, JS, JSON)
    event.respondWith(networkFirstStrategy(event.request));
});

// --- Strategies ---

/**
 * Network First: Try to fetch fresh content, update cache, fallback to cache if offline.
 */
function networkFirstStrategy(request) {
    return fetch(request)
        .then(networkResponse => {
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                return networkResponse;
            }
            const responseToCache = networkResponse.clone();
            caches.open(CONFIG.version).then(cache => cache.put(request, responseToCache));
            return networkResponse;
        })
        .catch(() => caches.match(request));
}

/**
 * Cache First: Check cache, if missing then fetch and cache.
 */
function cacheFirstStrategy(request) {
    return caches.match(request).then(cachedResponse => {
        return cachedResponse || fetch(request).then(networkResponse => {
            return caches.open(CONFIG.version).then(cache => {
                cache.put(request, networkResponse.clone());
                return networkResponse;
            });
        });
    });
}

// ==========================================
// 🔔 نظام إدارة الإشعارات (Notification Handler)
// ==========================================

// هذا الحدث يعمل عندما يضغط المستخدم على الإشعار
self.addEventListener('notificationclick', function(event) {
  // 1. إغلاق الإشعار فوراً حتى لا يبقى معلقاً
  event.notification.close();

  // 2. محاولة فتح التطبيق أو التركيز عليه إذا كان مفتوحاً
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // البحث عن نافذة التطبيق المفتوحة
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        // إذا كان التطبيق مفتوحاً ولدينا صلاحية التركيز عليه
        if ('focus' in client) {
          return client.focus();
        }
      }
      // إذا لم يكن التطبيق مفتوحاً، قم بفتحه من جديد
      if (clients.openWindow) {
        return clients.openWindow('/'); // '/' تعني الصفحة الرئيسية (index.html)
      }
    })
  );
});
