// service-worker.js - النسخة المحسنة

// 🔧 إصدار الكاش (يتم تحديثه عند كل تحديث كبير)
const CACHE_NAME = 'ahlulbayt-app-v3.1';
const DYNAMIC_CACHE = 'ahlulbayt-dynamic-v2';

// 🔧 قائمة الملفات الضرورية لتشغيل "هيكل" التطبيق
const APP_SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/manifest.json',
  '/js/main.js',
  '/js/data.js',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Reem+Kufi:wght@400;500;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,1,0'
];

// 🔧 الموارد الخارجية التي نريد تخزينها
const EXTERNAL_RESOURCES = [
  'https://raw.githubusercontent.com/iqsd2020-ctrl/New/main/Icon.png'
];

// 🔧 استراتيجيات التخزين المختلفة
const CACHE_STRATEGIES = {
  SHELL: 'shell',
  EXTERNAL: 'external',
  DYNAMIC: 'dynamic'
};

// 1. تثبيت التطبيق: تحميل وحفظ الملفات الأساسية
self.addEventListener('install', (event) => {
  console.log('🚀 Service Worker: Installing App Shell');
  
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        console.log('✅ Service Worker: Caching App Shell');
        
        // 🔧 تحسين: إضافة جميع الموارد دفعة واحدة مع معالجة الأخطاء
        const resourcesToCache = [...APP_SHELL, ...EXTERNAL_RESOURCES];
        await cache.addAll(resourcesToCache);
        
        // 🔧 جديد: تفعيل Service Worker فوراً
        self.skipWaiting();
        console.log('✅ Service Worker: Installation completed successfully');
      } catch (error) {
        console.error('❌ Service Worker: Installation failed', error);
      }
    })()
  );
});

// 2. تفعيل التحديثات: حذف الكاش القديم
self.addEventListener('activate', (event) => {
  console.log('🔄 Service Worker: Activating and cleaning old caches');
  
  event.waitUntil(
    (async () => {
      try {
        // 🔧 تحسين: الحصول على جميع مفاتيح الكاش
        const cacheKeys = await caches.keys();
        
        // 🔧 حذف جميع الكاشات القديمة
        const deletePromises = cacheKeys.map((cacheKey) => {
          if (cacheKey !== CACHE_NAME && cacheKey !== DYNAMIC_CACHE) {
            console.log(`🗑️ Service Worker: Deleting old cache - ${cacheKey}`);
            return caches.delete(cacheKey);
          }
        });
        
        await Promise.all(deletePromises);
        
        // 🔧 جديد: المطالبة بالتحكم في جميع العملاء فوراً
        await self.clients.claim();
        console.log('✅ Service Worker: Activation completed successfully');
      } catch (error) {
        console.error('❌ Service Worker: Activation failed', error);
      }
    })()
  );
});

// 3. استراتيجيات التخزين الذكية
self.addEventListener('fetch', (event) => {
  // 🔧 استثناء: لا تتدخل في طلبات قاعدة البيانات وواجهة برمجة التطبيقات
  if (shouldIgnoreRequest(event.request)) {
    return;
  }
  
  // 🔧 معالجة طلبات التنقل (الصفحات) بشكل مختلف
  if (event.request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(event.request));
    return;
  }
  
  // 🔧 تطبيق استراتيجيات التخزين المناسبة حسب نوع المورد
  event.respondWith(handleFetchRequest(event.request));
});

// 🔧 دالة لتحديد ما إذا كان يجب تجاهل الطلب
function shouldIgnoreRequest(request) {
  const ignorePatterns = [
    'firestore.googleapis.com',
    'firebasestorage.googleapis.com',
    'google-analytics.com',
    'gtag',
    'chrome-extension'
  ];
  
  return ignorePatterns.some(pattern => request.url.includes(pattern));
}

// 🔧 دالة معالجة طلبات التنقل
async function handleNavigationRequest(request) {
  try {
    // 🔧 محاولة جلب من الشبكة أولاً للصفحات
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // 🔧 تخزين النسخة المحدثة في الكاش
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
      return networkResponse;
    }
    
    throw new Error('Network response not ok');
  } catch (error) {
    // 🔧 Fallback إلى الكاش إذا فشل الاتصال
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // 🔧 Fallback إلى الصفحة الرئيسية
    return caches.match('/');
  }
}

// 🔧 دالة معالجة طلبات الجلب العامة
async function handleFetchRequest(request) {
  try {
    // 🔧 استراتيجية Cache First للموارد الثابتة
    if (isStaticAsset(request)) {
      return handleCacheFirst(request);
    }
    
    // 🔧 استراتيجية Network First للبيانات الديناميكية
    return handleNetworkFirst(request);
  } catch (error) {
    console.error('❌ Fetch handling failed:', error);
    
    // 🔧 Fallback للصور
    if (request.destination === 'image') {
      return handleImageFallback(request);
    }
    
    // 🔧 Fallback عام
    return new Response('Network error happened', {
      status: 408,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// 🔧 تحديد ما إذا كان المورد ثابتاً
function isStaticAsset(request) {
  const staticExtensions = ['.css', '.js', '.json', '.png', '.jpg', '.svg', '.woff', '.woff2'];
  const staticDomains = [
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'cdn.tailwindcss.com',
    'raw.githubusercontent.com'
  ];
  
  const url = new URL(request.url);
  
  return staticExtensions.some(ext => url.pathname.endsWith(ext)) ||
         staticDomains.some(domain => url.hostname.includes(domain));
}

// 🔧 استراتيجية Cache First
async function handleCacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  
  // 🔧 البحث في الكاش أولاً
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    // 🔧 جديد: تحديث الكاش في الخلفية
    updateCacheInBackground(request, cache);
    return cachedResponse;
  }
  
  // 🔧 إذا لم يوجد في الكاش، جلب من الشبكة
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // 🔧 Fallback للطلبات الخاصة بالخطوط
    if (request.url.includes('fonts.googleapis.com') || request.url.includes('fonts.gstatic.com')) {
      return new Response('', { status: 200, headers: { 'Content-Type': 'text/css' } });
    }
    throw error;
  }
}

// 🔧 استراتيجية Network First
async function handleNetworkFirst(request) {
  const dynamicCache = await caches.open(DYNAMIC_CACHE);
  
  try {
    // 🔧 محاولة الجلب من الشبكة أولاً
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // 🔧 تخزين الاستجابة في الكاش الديناميكي
      dynamicCache.put(request, networkResponse.clone());
      return networkResponse;
    }
    
    throw new Error('Network response not ok');
  } catch (error) {
    // 🔧 Fallback إلى الكاش
    const cachedResponse = await dynamicCache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // 🔧 البحث في الكاش الرئيسي كحل أخير
    const mainCacheResponse = await caches.match(request);
    if (mainCacheResponse) {
      return mainCacheResponse;
    }
    
    throw error;
  }
}

// 🔧 تحديث الكاش في الخلفية
async function updateCacheInBackground(request, cache) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
  } catch (error) {
    // 🔧 تجاهل الأخطاء في التحديث الخلفي
    console.log('Background cache update failed:', error);
  }
}

// 🔧 معالجة Fallback للصور
async function handleImageFallback(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // 🔧 إرجاع صورة بديلة أو أيقونة افتراضية
  return new Response(
    `<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" fill="#fbbf24" opacity="0.2"/>
      <text x="50" y="50" text-anchor="middle" dy=".3em" fill="#fbbf24" font-family="Arial">📚</text>
    </svg>`,
    {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=86400'
      }
    }
  );
}

// 🔧 جديد: معالجة رسائل Service Worker
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({
      version: CACHE_NAME,
      strategy: 'enhanced-cache'
    });
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => {
      keys.forEach(key => caches.delete(key));
    });
  }
});

// 🔧 جديد: معالجة المزامنة في الخلفية
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    console.log('🔄 Background sync triggered');
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  try {
    // 🔧 مزامنة البيانات في الخلفية عندما يتوفر اتصال
    const cache = await caches.open(CACHE_NAME);
    const requests = await cache.keys();
    
    // 🔧 تحديث الموارد المهمة
    const importantResources = APP_SHELL.filter(url => 
      url.includes('.css') || url.includes('.js') || url.includes('index.html')
    );
    
    for (const url of importantResources) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          cache.put(url, response);
        }
      } catch (error) {
        console.log(`Failed to update ${url}:`, error);
      }
    }
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

// 🔧 جديد: معالجة الإشعارات (للتطوير المستقبلي)
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  const data = event.data.json();
  const options = {
    body: data.body || 'تحديث جديد متاح في تطبيق أهل البيت',
    icon: 'https://raw.githubusercontent.com/iqsd2020-ctrl/New/main/Icon.png',
    badge: 'https://raw.githubusercontent.com/iqsd2020-ctrl/New/main/Icon.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '1'
    },
    actions: [
      {
        action: 'explore',
        title: 'استكشاف',
        icon: 'https://raw.githubusercontent.com/iqsd2020-ctrl/New/main/Icon.png'
      },
      {
        action: 'close',
        title: 'إغلاق',
        icon: 'https://raw.githubusercontent.com/iqsd2020-ctrl/New/main/Icon.png'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'من وحي أهل البيت', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'explore') {
    event.waitUntil(
      self.clients.matchAll().then((clientList) => {
        if (clientList.length > 0) {
          return clientList[0].focus();
        }
        return self.clients.openWindow('/');
      })
    );
  }
});

console.log('✅ Enhanced Service Worker loaded successfully');