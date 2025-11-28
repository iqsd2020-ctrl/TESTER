// اسم الكاش (قم بتغيير الرقم v1 عند كل تحديث كبير للكود)
const CACHE_NAME = 'ahlulbayt-shell-v2';

// قائمة الملفات الضرورية لتشغيل "هيكل" التطبيق
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/manifest.json',
  '/js/main.js',
  '/js/data.js',
  'https://cdn.tailwindcss.com', // مكتبة التصميم
  'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Reem+Kufi:wght@400;500;700&display=swap', // الخطوط
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,1,0' // الأيقونات
];

// 1. تثبيت التطبيق: تحميل وحفظ الملفات الأساسية
self.addEventListener('install', (evt) => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Service Worker: Caching App Shell');
      return cache.addAll(ASSETS);
    })
  );
});

// 2. تفعيل التحديثات: حذف الكاش القديم عند تغيير الإصدار
self.addEventListener('activate', (evt) => {
  evt.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys
        .filter(key => key !== CACHE_NAME)
        .map(key => caches.delete(key))
      );
    })
  );
});

// 3. استراتيجية "الكاش أولاً": تخدم الملفات من الجهاز، وإذا لم توجد تطلبها من النت
self.addEventListener('fetch', (evt) => {
  // استثناء: لا تتدخل في طلبات قاعدة البيانات (Firestore)
  if(evt.request.url.includes('firestore.googleapis.com')) return;

  evt.respondWith(
    caches.match(evt.request).then((cacheRes) => {
      return cacheRes || fetch(evt.request);
    })
  );
});
