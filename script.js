/**
 * ============================================================================
 * أداة العلامة المائية المتحركة بنمط "توقيع تيك توك" (TikTok Signature Watermark)
 * كود JavaScript خالص (Pure Vanilla JS) بدون أي مكتبات خارجية.
 * ============================================================================
 */

// ============================================================================
// 1. كائن الإعدادات الشامل (CONFIG) - كل القيم والمسارات القابلة للتخصيص
// ============================================================================
const CONFIG = {
  // المسار الافتراضي للوجو المستخدم عند بدء الموقع
  defaultLogoPath: 'assets/logo.png',

  // نسبة حجم اللوجو بالنسبة لعرض الفيديو (12% إلى 15% من عرض الفيديو)
  logoWidthPercent: 0.135, // 13.5%

  // هامش الأمان الداخلي من حواف الفيديو حتى لا يخرج اللوجو أبداً (نسبة من الأبعاد)
  safeMarginPercent: 0.08, // 8%

  // الفترة الزمنية بالثواني بين كل انتقال وآخر (عشوائية بين الأدنى والأقصى)
  minIntervalSeconds: 4.0, // 4 ثوانٍ
  maxIntervalSeconds: 7.0, // 7 ثوانٍ

  // مدة حركة الانتقال السلسة بالثواني
  minTransitionDuration: 1.2, // 1.2 ثانية
  maxTransitionDuration: 1.8, // 1.8 ثانية

  // نطاق الشفافية النابضة (Sine wave) المستمرة طوال مدة الفيديو
  minOpacity: 0.25, // الحد الأدنى للشفافية
  maxOpacity: 0.70, // الحد الأقصى للشفافية
  opacityPulseSpeed: 0.65, // سرعة دورة النبض الجيبي (دورة كل ~1.5 ثانية)

  // نطاق الدوران العشوائي للوجو بالدرجات مع كل نقلة
  minRotationDeg: -15, // -15 درجة
  maxRotationDeg: 15,  // +15 درجة

  // نطاق تغيّر الحجم العشوائي للوجو مع كل نقلة
  minScaleFactor: 0.90, // 90%
  maxScaleFactor: 1.15, // 115%

  // معدل إطارات التصدير (Frames Per Second)
  exportFps: 30,

  // إضافة ظل ناعم للّوجو لضمان وضوحه التام فوق الخلفيات الفاتحة والداكنة
  enableDropShadow: true,
  shadowBlur: 10,
  shadowColor: 'rgba(0, 0, 0, 0.55)',

  // قص دائري ناعم للوجو (مفيد إذا كان اللوجو مربعاً وتريده كشارة دائرية)
  enableCircularClip: false,

  // معدل البت المستهدف لتسجيل الفيديو (5 Mbps لجودة ممتازة)
  videoBitrate: 5000000
};

// ============================================================================
// 2. حالة التطبيق العامة (Application State)
// ============================================================================
const state = {
  videoFile: null,
  videoElement: null,
  videoUrl: null,
  videoDuration: 0,
  videoWidth: 0,
  videoHeight: 0,

  logoImage: null,
  logoUrl: null,
  logoLoaded: false,
  isDefaultLogo: true,

  // متغيرات حركة اللوجو
  motion: {
    curX: 0,
    curY: 0,
    startX: 0,
    startY: 0,
    targetX: 0,
    targetY: 0,

    curRot: 0,
    startRot: 0,
    targetRot: 0,

    curScale: 1,
    startScale: 1,
    targetScale: 1,

    isMoving: false,
    moveStartTime: 0,
    moveDuration: 1.5,
    nextJumpTime: 0
  },

  // حالة التشغيل والتسجيل
  isPlaying: false,
  isExporting: false,
  exportCancelled: false,
  mediaRecorder: null,
  recordedChunks: [],
  exportStartTime: 0,

  // نظام الصوت (Web Audio API)
  audioCtx: null,
  mediaSourceNode: null,
  streamDestNode: null,
  speakerGainNode: null,

  // الصيغة المدعومة
  supportedMimeType: null,
  isMp4Supported: false,

  // عناصر واجهة المستخدم
  ui: {}
};

// ============================================================================
// 3. دوال مساعدة عامة والحسابات الرياضية (Math & Utility Helpers)
// ============================================================================

// دالة توليد رقم عشوائي ضمن مجال محدد
function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

// دالة التنعيم السلس (Easing: ease-in-out cubic)
function easeInOutCubic(t) {
  return t < 0.5 
    ? 4 * t * t * t 
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// تحويل الثواني إلى نص زمني منسق (MM:SS)
function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// ============================================================================
// 4. الكشف عن أفضل صيغة تصدير مدعومة في المتصفح
// ============================================================================
function detectSupportedVideoFormat() {
  const candidateTypes = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ];

  if (!window.MediaRecorder) {
    console.error('متصفحك لا يدعم MediaRecorder.');
    return { mimeType: '', isMp4: false };
  }

  for (const type of candidateTypes) {
    if (MediaRecorder.isTypeSupported(type)) {
      const isMp4 = type.includes('mp4');
      return { mimeType: type, isMp4 };
    }
  }

  return { mimeType: 'video/webm', isMp4: false };
}

// ============================================================================
// 5. تهيئة أنابيب الصوت للتشغيل والتصدير الصامت (Web Audio Pipeline)
// ============================================================================
function initAudioPipeline() {
  if (!state.videoElement) return;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  if (!state.audioCtx) {
    state.audioCtx = new AudioContextClass();
  }

  if (state.audioCtx.state === 'suspended') {
    state.audioCtx.resume();
  }

  // يمكن ربط MediaElementSource مرة واحدة فقط للعنصر نفسه
  if (!state.mediaSourceNode) {
    try {
      state.mediaSourceNode = state.audioCtx.createMediaElementSource(state.videoElement);
      state.streamDestNode = state.audioCtx.createMediaStreamDestination();
      state.speakerGainNode = state.audioCtx.createGain();

      // المسار 1: إرسال الصوت لمسار التسجيل المستمر
      state.mediaSourceNode.connect(state.streamDestNode);

      // المسار 2: إرسال الصوت للسماعات مع متحكم في الصوت (كتم الصوت أثناء التصدير)
      state.mediaSourceNode.connect(state.speakerGainNode);
      state.speakerGainNode.connect(state.audioCtx.destination);
    } catch (e) {
      console.warn('تعذر إنشاء خط الصوت:', e);
    }
  }
}

// ============================================================================
// 6. منطق حركة وتوقيع تيك توك للّوجو (Watermark Logic)
// ============================================================================

// حساب أبعاد اللوجو بناءً على أبعاد الفيديو الحالية
function getLogoDimensions() {
  if (!state.logoImage || !state.logoLoaded) {
    return { width: 100, height: 100 };
  }
  const baseW = state.videoWidth * CONFIG.logoWidthPercent;
  const aspect = state.logoImage.naturalWidth / (state.logoImage.naturalHeight || 1);
  const baseH = baseW / aspect;
  return { width: baseW, height: baseH };
}

// اختيار نقطة عشوائية جديدة داخل حدود الأمان للفيديو
function pickRandomPosition() {
  const { width: logoW, height: logoH } = getLogoDimensions();

  const marginX = state.videoWidth * CONFIG.safeMarginPercent;
  const marginY = state.videoHeight * CONFIG.safeMarginPercent;

  const minX = marginX + (logoW * 0.6);
  const maxX = Math.max(minX, state.videoWidth - marginX - (logoW * 0.6));

  const minY = marginY + (logoH * 0.6);
  const maxY = Math.max(minY, state.videoHeight - marginY - (logoH * 0.6));

  const newX = randomRange(minX, maxX);
  const newY = randomRange(minY, maxY);

  // دوران عشوائي
  const newRotDeg = randomRange(CONFIG.minRotationDeg, CONFIG.maxRotationDeg);
  const newRotRad = (newRotDeg * Math.PI) / 180;

  // تحجيم عشوائي خفيف
  const newScale = randomRange(CONFIG.minScaleFactor, CONFIG.maxScaleFactor);

  return { x: newX, y: newY, rot: newRotRad, scale: newScale };
}

// تهيئة موقع اللوجو الأولي
function resetLogoPosition() {
  const target = pickRandomPosition();
  const m = state.motion;
  m.curX = m.startX = m.targetX = target.x;
  m.curY = m.startY = m.targetY = target.y;
  m.curRot = m.startRot = m.targetRot = target.rot;
  m.curScale = m.startScale = m.targetScale = target.scale;
  m.isMoving = false;
  m.nextJumpTime = performance.now() + (randomRange(CONFIG.minIntervalSeconds, CONFIG.maxIntervalSeconds) * 1000);
}

// تحديث حركة اللوجو لكل فريم
function updateLogoMotion(now) {
  const m = state.motion;

  if (m.isMoving) {
    const elapsed = (now - m.moveStartTime) / 1000;
    const progress = Math.min(1, Math.max(0, elapsed / m.moveDuration));
    const ease = easeInOutCubic(progress);

    m.curX = m.startX + (m.targetX - m.startX) * ease;
    m.curY = m.startY + (m.targetY - m.startY) * ease;
    m.curRot = m.startRot + (m.targetRot - m.startRot) * ease;
    m.curScale = m.startScale + (m.targetScale - m.startScale) * ease;

    if (progress >= 1) {
      m.isMoving = false;
      m.startX = m.curX;
      m.startY = m.curY;
      m.startRot = m.curRot;
      m.startScale = m.curScale;
      // تحديد الموعد القادم للانتقال العشوائي
      const restDuration = randomRange(CONFIG.minIntervalSeconds, CONFIG.maxIntervalSeconds);
      m.nextJumpTime = now + (restDuration * 1000);
    }
  } else {
    // التحقق من وصول موعد الانتقال القادم
    if (now >= m.nextJumpTime) {
      const nextPos = pickRandomPosition();
      m.isMoving = true;
      m.moveStartTime = now;
      m.moveDuration = randomRange(CONFIG.minTransitionDuration, CONFIG.maxTransitionDuration);

      m.startX = m.curX;
      m.startY = m.curY;
      m.startRot = m.curRot;
      m.startScale = m.curScale;

      m.targetX = nextPos.x;
      m.targetY = nextPos.y;
      m.targetRot = nextPos.rot;
      m.targetScale = nextPos.scale;
    }
  }
}

// حساب الشفافية النابضة بالدالة الجيبية
function computeCurrentOpacity(currentTimeSeconds) {
  const sineVal = 0.5 + 0.5 * Math.sin(currentTimeSeconds * CONFIG.opacityPulseSpeed * 2 * Math.PI);
  return CONFIG.minOpacity + (CONFIG.maxOpacity - CONFIG.minOpacity) * sineVal;
}

// ============================================================================
// 7. حلقة الرسم على الكانفس (Canvas Render Loop)
// ============================================================================
function renderFrame(now) {
  if (!state.videoElement || !state.ui.canvas) return;

  const canvas = state.ui.canvas;
  const ctx = canvas.getContext('2d');
  const video = state.videoElement;

  // 1. رسم فريم الفيديو بدقة كاملة
  if (video.readyState >= 2) {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // 2. تحديث حركة اللوجو ورسمه إن وُجد
  if (state.logoLoaded && state.logoImage) {
    updateLogoMotion(now);
    const { width: baseW, height: baseH } = getLogoDimensions();
    const alpha = computeCurrentOpacity(video.currentTime || (now / 1000));

    ctx.save();
    ctx.globalAlpha = Math.max(0.05, Math.min(1, alpha));

    // الانتقال للموقع الحالي ثم الدوران والتحجيم
    ctx.translate(state.motion.curX, state.motion.curY);
    ctx.rotate(state.motion.curRot);
    ctx.scale(state.motion.curScale, state.motion.curScale);

    // إضافة ظل ناعم لتحسين التباين
    if (CONFIG.enableDropShadow) {
      ctx.shadowColor = CONFIG.shadowColor;
      ctx.shadowBlur = CONFIG.shadowBlur;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 3;
    }

    if (CONFIG.enableCircularClip) {
      // قص دائري ناعم
      ctx.save();
      ctx.beginPath();
      const radius = Math.min(baseW, baseH) / 2;
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(state.logoImage, -baseW / 2, -baseH / 2, baseW, baseH);
      ctx.restore();
    } else {
      // رسم اللوجو بشفافيته الطبيعية
      ctx.drawImage(state.logoImage, -baseW / 2, -baseH / 2, baseW, baseH);
    }

    ctx.restore();
  }

  // تحديث شريط الوقت إذا كان الفيديو يعمل
  if (state.isPlaying && !state.isExporting) {
    updatePlaybackUi();
  }

  // استمرار حلقة الرسم
  requestAnimationFrame(renderFrame);
}

// تحديث واجهة التشغيل والوقت
function updatePlaybackUi() {
  if (!state.videoElement) return;
  const current = state.videoElement.currentTime;
  const total = state.videoElement.duration || 0;
  state.ui.timeCurrent.textContent = formatTime(current);
  state.ui.timeTotal.textContent = formatTime(total);

  if (total > 0 && !state.isExporting) {
    state.ui.timeScrubber.value = (current / total) * 100;
  }
}

// ============================================================================
// 8. التعامل مع اختيار ورفع الملفات (Video & Logo Loading)
// ============================================================================

// تحميل اللوجو الافتراضي تلقائياً
function loadDefaultLogo() {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    state.logoImage = img;
    state.logoLoaded = true;
    state.isDefaultLogo = true;
    state.ui.logoPreviewImg.src = img.src;
    state.ui.logoNameDisplay.textContent = 'اللوجو الافتراضي (assets/logo.png)';
    if (state.videoWidth > 0) {
      resetLogoPosition();
    }
  };
  img.onerror = () => {
    console.info('لم يتم العثور على اللوجو الافتراضي في assets/logo.png، يرجى رفع لوجو.');
    state.logoLoaded = false;
  };
  img.src = CONFIG.defaultLogoPath;
}

// معالجة اختيار ملف فيديو جديد
function handleVideoFile(file) {
  if (!file) return;

  const validTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg', 'video/x-matroska'];
  if (!validTypes.includes(file.type) && !file.name.match(/\.(mp4|webm|mov|mkv)$/i)) {
    alert('يرجى اختيار ملف فيديو صالح بصيغة MP4 أو WebM أو MOV.');
    return;
  }

  // تنظيف أي رابط سابق
  if (state.videoUrl) {
    URL.revokeObjectURL(state.videoUrl);
  }

  state.videoFile = file;
  state.videoUrl = URL.createObjectURL(file);

  const video = state.videoElement;
  video.src = state.videoUrl;
  video.load();

  video.onloadedmetadata = () => {
    state.videoDuration = video.duration;
    state.videoWidth = video.videoWidth || 1080;
    state.videoHeight = video.videoHeight || 1920;

    // ضبط أبعاد الكانفس لتطابق تماماً أبعاد الفيديو الأصلية
    state.ui.canvas.width = state.videoWidth;
    state.ui.canvas.height = state.videoHeight;

    // تحديث بطاقة التفاصيل
    state.ui.videoResolutionBadge.textContent = `${state.videoWidth} × ${state.videoHeight}px`;
    state.ui.videoDurationBadge.textContent = formatTime(state.videoDuration);
    state.ui.videoFileNameDisplay.textContent = file.name;

    // تهيئة موقع اللوجو
    resetLogoPosition();

    // إظهار الخطوات التالية
    activateStep(2);
    state.ui.previewPanel.classList.remove('hidden');
    state.ui.previewPanel.scrollIntoView({ behavior: 'smooth' });

    // تشغيل مبدئي للفيديو
    video.currentTime = 0;
    video.pause();
    state.isPlaying = false;
    state.ui.playPauseBtn.innerHTML = '<span>▶</span> تشغيل';
    updatePlaybackUi();
  };

  video.onerror = () => {
    alert('حدث خطأ أثناء تحميل الفيديو. قد تكون الصيغة غير مدعومة في متصفحك.');
  };
}

// معالجة اختيار ملف لوجو جديد
function handleLogoFile(file) {
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    alert('يرجى اختيار ملف صورة صالح (يفضل PNG بخلفية شفافة).');
    return;
  }

  if (state.logoUrl) {
    URL.revokeObjectURL(state.logoUrl);
  }

  state.logoUrl = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    state.logoImage = img;
    state.logoLoaded = true;
    state.isDefaultLogo = false;
    state.ui.logoPreviewImg.src = state.logoUrl;
    state.ui.logoNameDisplay.textContent = `${file.name} (${img.naturalWidth}×${img.naturalHeight}px)`;
    resetLogoPosition();
    activateStep(3);
  };
  img.src = state.logoUrl;
}

// ============================================================================
// 9. تشغيل وتحكم المعاينة (Playback Controls)
// ============================================================================
function togglePlayPause() {
  if (!state.videoElement || state.isExporting) return;

  initAudioPipeline();

  if (state.videoElement.paused) {
    // تفعيل الصوت في السماعات أثناء المعاينة
    if (state.speakerGainNode) {
      state.speakerGainNode.gain.value = 1.0;
    }
    state.videoElement.play().then(() => {
      state.isPlaying = true;
      state.ui.playPauseBtn.innerHTML = '<span>⏸</span> إيقاف مؤقت';
    }).catch(err => {
      console.warn('تعذر التشغيل التلقائي:', err);
    });
  } else {
    state.videoElement.pause();
    state.isPlaying = false;
    state.ui.playPauseBtn.innerHTML = '<span>▶</span> تشغيل';
  }
}

// ============================================================================
// 10. التصدير الفعلي وحفظ الفيديو (Export Pipeline)
// ============================================================================
async function startExport() {
  if (!state.videoElement || !state.videoFile || state.isExporting) return;

  // تأكيد المستخدم وتحذير الوقت الحقيقي
  const estimatedSeconds = Math.round(state.videoDuration);
  const confirmMsg = `تنبيه: التصدير يتم بالزمن الحقيقي لضمان دقة دمج العلامة المائية والصوت (مدة الفيديو: ${formatTime(estimatedSeconds)}).\n\nهل تود بدء التصدير الآن؟ يرجى إبقاء هذه الصفحة مفتوحة حتى ينتهي.`;
  
  if (!confirm(confirmMsg)) return;

  state.isExporting = true;
  state.exportCancelled = false;
  state.recordedChunks = [];
  state.exportStartTime = performance.now();

  // تحديث واجهة المستخدم لوضع التصدير
  activateStep(4);
  state.ui.exportBtn.disabled = true;
  state.ui.exportStatusCard.classList.add('visible');
  state.ui.cancelExportBtn.classList.remove('hidden');
  state.ui.resultPanel.classList.remove('visible');
  state.ui.exportProgressBar.style.width = '0%';
  state.ui.exportProgressText.textContent = '0%';
  state.ui.exportStatusDesc.textContent = 'جاري تحضير البث وبدء التسجيل...';

  // تهيئة الصوت والكانفس
  initAudioPipeline();

  // كتم الصوت في السماعات أثناء التصدير (تسجيل صامت دون إزعاج المستخدم)
  if (state.speakerGainNode) {
    state.speakerGainNode.gain.value = 0.0;
  }

  // التقاط بث الكانفس بمعدل الإطارات المطلوب
  const canvasStream = state.ui.canvas.captureStream(CONFIG.exportFps);

  // دمج مسارات الصوت إن وجدت
  let combinedStream = canvasStream;
  if (state.streamDestNode && state.streamDestNode.stream) {
    const audioTracks = state.streamDestNode.stream.getAudioTracks();
    if (audioTracks.length > 0) {
      combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...audioTracks
      ]);
    }
  }

  // إعداد MediaRecorder بالصيغة المدعومة الأفضل
  const mimeType = state.supportedMimeType || 'video/webm';
  const recorderOptions = {
    mimeType: mimeType,
    videoBitsPerSecond: CONFIG.videoBitrate
  };

  try {
    state.mediaRecorder = new MediaRecorder(combinedStream, recorderOptions);
  } catch (err) {
    console.warn('فشل خيار الميجابت، جاري المحاولة بدون تحديد bitrate:', err);
    try {
      state.mediaRecorder = new MediaRecorder(combinedStream, { mimeType: mimeType });
    } catch (e2) {
      state.mediaRecorder = new MediaRecorder(combinedStream);
    }
  }

  // تجميع كتل البيانات المسجلة
  state.mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      state.recordedChunks.push(event.data);
    }
  };

  // عند انتهاء التسجيل بنجاح
  state.mediaRecorder.onstop = () => {
    handleExportComplete(mimeType);
  };

  // ضبط بداية الفيديو من الصفر وتصفير حركة اللوجو
  state.videoElement.pause();
  state.videoElement.currentTime = 0;
  resetLogoPosition();

  // عند اكتمال الفيديو تلقائياً يتوقف التسجيل
  state.videoElement.onended = () => {
    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
      state.mediaRecorder.stop();
    }
  };

  // متابعة تقدم التصدير بالزمن الحقيقي
  state.videoElement.ontimeupdate = () => {
    if (!state.isExporting) return;
    const current = state.videoElement.currentTime;
    const total = state.videoDuration || 1;
    const pct = Math.min(100, Math.round((current / total) * 100));

    state.ui.exportProgressBar.style.width = `${pct}%`;
    state.ui.exportProgressText.textContent = `${pct}%`;
    
    const remainingSecs = Math.max(0, Math.round(total - current));
    state.ui.exportTimeRemaining.textContent = `الوقت المتبقي التقديري: ${formatTime(remainingSecs)}`;
    state.ui.exportStatusDesc.textContent = `جاري دمج العلامة المائية... (${formatTime(current)} / ${formatTime(total)})`;
  };

  // بدء التسجيل وتشغيل الفيديو
  state.mediaRecorder.start(200); // إرسال بيانات كل 200 مللي ثانية
  
  try {
    await state.videoElement.play();
    state.isPlaying = true;
  } catch (playErr) {
    console.error('فشل تشغيل الفيديو أثناء التصدير:', playErr);
    alert('تعذر تشغيل الفيديو تلقائياً بسبب قيود المتصفح. يرجى الضغط على زر التشغيل.');
    cancelExport();
  }
}

// إلغاء عملية التصدير بأمان
function cancelExport() {
  if (!state.isExporting) return;

  state.exportCancelled = true;
  state.isExporting = false;

  if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
    state.mediaRecorder.stop();
  }

  if (state.videoElement) {
    state.videoElement.pause();
    state.videoElement.onended = null;
    state.videoElement.ontimeupdate = null;
  }

  // إعادة الصوت للسماعات
  if (state.speakerGainNode) {
    state.speakerGainNode.gain.value = 1.0;
  }

  state.recordedChunks = [];
  state.ui.exportStatusCard.classList.remove('visible');
  state.ui.exportBtn.disabled = false;
  state.ui.cancelExportBtn.classList.add('hidden');
  alert('تم إلغاء عملية التصدير.');
}

// معالجة الانتهاء من التصدير وتوليد ملف الفيديو وحفظه
async function handleExportComplete(mimeType) {
  // إعادة الصوت للسماعات
  if (state.speakerGainNode) {
    state.speakerGainNode.gain.value = 1.0;
  }

  if (state.exportCancelled) {
    return;
  }

  state.isExporting = false;
  state.ui.exportBtn.disabled = false;
  state.ui.exportStatusCard.classList.remove('visible');
  state.ui.cancelExportBtn.classList.add('hidden');

  if (state.recordedChunks.length === 0) {
    alert('حدث خطأ أثناء التسجيل: لم يتم إنشاء أي إطارات.');
    return;
  }

  // تجميع الـ Blob النهائي
  const blob = new Blob(state.recordedChunks, { type: mimeType });
  const originalName = state.videoFile ? state.videoFile.name : 'video';
  const isMp4 = mimeType.includes('mp4');
  const ext = isMp4 ? 'mp4' : 'webm';
  const baseName = originalName.replace(/\.[^/.]+$/, '');
  const finalFilename = `${baseName}_watermark.${ext}`;

  // عرض الفيديو المصدّر في مشغل النتيجة
  const resultUrl = URL.createObjectURL(blob);
  state.ui.resultVideoPreview.src = resultUrl;
  state.ui.resultPanel.classList.add('visible');
  state.ui.resultPanel.scrollIntoView({ behavior: 'smooth' });

  // حفظ الملف إما عبر showSaveFilePicker أو التنزيل المباشر
  saveVideoBlob(blob, finalFilename, mimeType, resultUrl);
}

// حفظ ملف الفيديو على جهاز المستخدم
async function saveVideoBlob(blob, filename, mimeType, blobUrl) {
  let savedViaPicker = false;

  // المحاولة عبر showSaveFilePicker إن كان مدعوماً
  if ('showSaveFilePicker' in window) {
    try {
      const isMp4 = mimeType.includes('mp4');
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{
          description: isMp4 ? 'ملف فيديو MP4' : 'ملف فيديو WebM',
          accept: { [mimeType.split(';')[0]]: [isMp4 ? '.mp4' : '.webm'] }
        }]
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      savedViaPicker = true;
    } catch (pickerErr) {
      if (pickerErr.name === 'AbortError') {
        // ألغى المستخدم نافذة الحفظ، نحتفظ بزر التنزيل في الواجهة
        setupDownloadButton(blobUrl, filename);
        return;
      }
      console.warn('showSaveFilePicker لم يكتمل، الانتقال للتنزيل التلقائي:', pickerErr);
    }
  }

  // التنزيل المباشر إذا لم يُحفظ عبر النافذة
  if (!savedViaPicker) {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  setupDownloadButton(blobUrl, filename);
}

// ضبط زر التنزيل اليدوي في بطاقة النتيجة
function setupDownloadButton(url, filename) {
  state.ui.downloadResultBtn.onclick = () => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
}

// تحديث شريط الخطوات في الأعلى
function activateStep(stepNumber) {
  const steps = document.querySelectorAll('.step-item');
  steps.forEach((el, idx) => {
    const currentStep = idx + 1;
    if (currentStep < stepNumber) {
      el.classList.add('completed');
      el.classList.remove('active');
    } else if (currentStep === stepNumber) {
      el.classList.add('active');
      el.classList.remove('completed');
    } else {
      el.classList.remove('active', 'completed');
    }
  });
}

// ============================================================================
// 11. ربط عناصر واجهة المستخدم والأحداث (DOM & Event Listeners)
// ============================================================================
function initApp() {
  // فحص صيغة التصدير المدعومة في المتصفح وإظهار إشعار للمستخدم
  const formatInfo = detectSupportedVideoFormat();
  state.supportedMimeType = formatInfo.mimeType;
  state.isMp4Supported = formatInfo.isMp4;

  const formatNoticeText = document.getElementById('formatNoticeText');
  if (formatInfo.isMp4) {
    formatNoticeText.textContent = 'متصفحك يدعم تصدير MP4 (H.264) عالي الجودة متوافق مع كافة المنصات.';
  } else {
    formatNoticeText.textContent = 'متصفحك لا يدعم ترميز MP4 الداخلي؛ سيتم التصدير بصيغة WebM فائقة الجودة والمتوافقة مع كافة الأجهزة الحديثة.';
  }

  // تجهيز مراجع DOM
  state.ui = {
    canvas: document.getElementById('previewCanvas'),
    videoElement: document.getElementById('sourceVideo'),
    dropzone: document.getElementById('videoDropzone'),
    videoInput: document.getElementById('videoFileInput'),
    logoInput: document.getElementById('logoFileInput'),
    changeLogoBtn: document.getElementById('changeLogoBtn'),
    resetDefaultLogoBtn: document.getElementById('resetDefaultLogoBtn'),
    logoPreviewImg: document.getElementById('logoPreviewImg'),
    logoNameDisplay: document.getElementById('logoNameDisplay'),

    previewPanel: document.getElementById('previewPanel'),
    playPauseBtn: document.getElementById('playPauseBtn'),
    timeScrubber: document.getElementById('timeScrubber'),
    timeCurrent: document.getElementById('timeCurrent'),
    timeTotal: document.getElementById('timeTotal'),

    videoResolutionBadge: document.getElementById('videoResolutionBadge'),
    videoDurationBadge: document.getElementById('videoDurationBadge'),
    videoFileNameDisplay: document.getElementById('videoFileNameDisplay'),

    // Sliders
    logoSizeSlider: document.getElementById('logoSizeSlider'),
    logoSizeValue: document.getElementById('logoSizeValue'),
    speedSlider: document.getElementById('speedSlider'),
    speedValue: document.getElementById('speedValue'),
    opacityMinSlider: document.getElementById('opacityMinSlider'),
    opacityMinValue: document.getElementById('opacityMinValue'),
    opacityMaxSlider: document.getElementById('opacityMaxSlider'),
    opacityMaxValue: document.getElementById('opacityMaxValue'),
    circularClipToggle: document.getElementById('circularClipToggle'),
    dropShadowToggle: document.getElementById('dropShadowToggle'),

    // Export UI
    exportBtn: document.getElementById('startExportBtn'),
    cancelExportBtn: document.getElementById('cancelExportBtn'),
    exportStatusCard: document.getElementById('exportStatusCard'),
    exportProgressBar: document.getElementById('exportProgressBar'),
    exportProgressText: document.getElementById('exportProgressText'),
    exportTimeRemaining: document.getElementById('exportTimeRemaining'),
    exportStatusDesc: document.getElementById('exportStatusDesc'),

    resultPanel: document.getElementById('resultPanel'),
    resultVideoPreview: document.getElementById('resultVideoPreview'),
    downloadResultBtn: document.getElementById('downloadResultBtn'),
    startOverBtn: document.getElementById('startOverBtn')
  };

  state.videoElement = state.ui.videoElement;

  // 1. أحداث السحب والإفلات لملف الفيديو
  const dropzone = state.ui.dropzone;
  const videoInput = state.ui.videoInput;

  dropzone.addEventListener('click', () => videoInput.click());
  videoInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleVideoFile(e.target.files[0]);
    }
  });

  ['dragenter', 'dragover'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleVideoFile(e.dataTransfer.files[0]);
    }
  });

  // 2. أحداث اختيار وتغيير اللوجو
  state.ui.changeLogoBtn.addEventListener('click', () => state.ui.logoInput.click());
  state.ui.logoInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleLogoFile(e.target.files[0]);
    }
  });

  state.ui.resetDefaultLogoBtn.addEventListener('click', () => {
    loadDefaultLogo();
  });

  // 3. التحكم في تشغيل الفيديو وشريط الوقت
  state.ui.playPauseBtn.addEventListener('click', togglePlayPause);
  
  state.ui.timeScrubber.addEventListener('input', (e) => {
    if (!state.videoElement || state.isExporting) return;
    const targetTime = (e.target.value / 100) * state.videoDuration;
    state.videoElement.currentTime = targetTime;
    updatePlaybackUi();
  });

  state.videoElement.addEventListener('ended', () => {
    if (!state.isExporting) {
      state.isPlaying = false;
      state.ui.playPauseBtn.innerHTML = '<span>▶</span> إعادة تشغيل';
    }
  });

  // 4. عناصر التحكم والأشرطة المنزلقة (Sliders)
  state.ui.logoSizeSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    CONFIG.logoWidthPercent = val / 100;
    state.ui.logoSizeValue.textContent = `${val}%`;
    resetLogoPosition();
  });

  state.ui.speedSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    // ضبط التردد الزمني للحركة
    CONFIG.minIntervalSeconds = Math.max(2, 6 - val * 0.8);
    CONFIG.maxIntervalSeconds = Math.max(3.5, 9 - val * 0.8);
    state.ui.speedValue.textContent = `${val}x`;
  });

  state.ui.opacityMinSlider.addEventListener('input', (e) => {
    const minVal = parseFloat(e.target.value) / 100;
    if (minVal < CONFIG.maxOpacity) {
      CONFIG.minOpacity = minVal;
      state.ui.opacityMinValue.textContent = `${Math.round(minVal * 100)}%`;
    }
  });

  state.ui.opacityMaxSlider.addEventListener('input', (e) => {
    const maxVal = parseFloat(e.target.value) / 100;
    if (maxVal > CONFIG.minOpacity) {
      CONFIG.maxOpacity = maxVal;
      state.ui.opacityMaxValue.textContent = `${Math.round(maxVal * 100)}%`;
    }
  });

  state.ui.circularClipToggle.addEventListener('change', (e) => {
    CONFIG.enableCircularClip = e.target.checked;
  });

  state.ui.dropShadowToggle.addEventListener('change', (e) => {
    CONFIG.enableDropShadow = e.target.checked;
  });

  // 5. زر التصدير والإلغاء
  state.ui.exportBtn.addEventListener('click', startExport);
  state.ui.cancelExportBtn.addEventListener('click', cancelExport);

  // 6. زر البدء من جديد
  state.ui.startOverBtn.addEventListener('click', () => {
    if (confirm('هل ترغب في البدء من جديد واختيار فيديو آخر؟')) {
      location.reload();
    }
  });

  // تحميل اللوجو الافتراضي
  loadDefaultLogo();

  // بدء حلقة الرسم على الكانفس
  requestAnimationFrame(renderFrame);
}

// تشغيل التطبيق بمجرد اكتمال تحميل الصفحة
document.addEventListener('DOMContentLoaded', initApp);
