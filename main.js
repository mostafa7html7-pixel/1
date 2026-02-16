import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, push, onChildAdded, onValue, remove, set } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// إعدادات Firebase
const firebaseConfig = {
    apiKey: "AIzaSyD092yeOowtCLW0fDcIzaEXrnxvrN4X5T8",
    authDomain: "abqarieno.firebaseapp.com",
    databaseURL: "https://abqarieno-default-rtdb.firebaseio.com",
    projectId: "abqarieno",
    storageBucket: "abqarieno.firebasestorage.app",
    messagingSenderId: "790682500839",
    appId: "1:790682500839:web:005ac4476e3210b7e06c42"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const drawingsRef = ref(db, 'drawings_v2'); // استخدام مسار جديد لتجنب تداخل البيانات القديمة
const configRef = ref(db, 'boardConfig');

// العناصر
const canvas = document.getElementById('whiteboard');
const canvasWrapper = document.getElementById('canvasWrapper');
const ctx = canvas.getContext('2d');
const toolsPanel = document.getElementById('toolsPanel'); // الهيدر
const toggleMenuBtn = document.getElementById('toggleMenuBtn');

// الحالة
let isTeacher = true;
let isDrawing = false;
let currentColor = '#000000';
let currentSize = 3;
let points = []; // مصفوفة لتخزين النقاط لتحسين نعومة الخط
let localDrawingsCache = []; // تخزين محلي للرسومات لإعادة الرسم عند تغيير الحجم

// الألوان
const colors = ['#000000', '#ef4444', '#22c55e', '#3b82f6', '#eab308', '#a855f7', '#ec4899', '#64748b', '#ffffff'];
const bgColors = ['#ffffff', '#f0f9ff', '#f0fdf4', '#fff1f2', '#1e293b', '#000000'];
const neonColors = ['transparent', '#ef4444', '#22c55e', '#3b82f6', '#facc15', '#d946ef', '#06b6d4'];

// 1. إعداد واجهة المستخدم
function initUI() {
    // ألوان القلم
    const penContainer = document.getElementById('penColors');
    colors.forEach(c => {
        const dot = document.createElement('div');
        dot.className = 'color-dot';
        dot.style.background = c;
        dot.onclick = () => {
            currentColor = c;
            document.querySelectorAll('#penColors .color-dot').forEach(d => d.classList.remove('active'));
            dot.classList.add('active');
        };
        penContainer.appendChild(dot);
    });

    // ألوان الخلفية
    const bgContainer = document.getElementById('bgColors');
    bgColors.forEach(c => {
        const dot = document.createElement('div');
        dot.className = 'color-dot';
        dot.style.background = c;
        dot.style.border = '1px solid #ccc';
        dot.onclick = () => isTeacher && set(configRef, { bgColor: c });
        bgContainer.appendChild(dot);
    });

    // ألوان النيون
    const neonContainer = document.getElementById('neonColors');
    neonColors.forEach(c => {
        const dot = document.createElement('div');
        dot.className = 'color-dot';
        dot.style.background = c === 'transparent' ? '#333' : c; // لون رمادي للشفاف
        dot.onclick = () => {
            if (isTeacher) {
                set(configRef, { neonColor: c });
            }
        };
        neonContainer.appendChild(dot);
    });

    // تبديل القائمة
    toggleMenuBtn.onclick = () => toolsPanel.classList.toggle('closed');

    // تغيير المؤشر
    document.querySelectorAll('.cursor-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.cursor-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            canvas.style.cursor = btn.dataset.cursor;
        };
    });
}
initUI();

// 2. نظام الرسم عالي الجودة (High DPI)
function resizeCanvas() {
    const rect = canvasWrapper.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    
    ctx.scale(ratio, ratio);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // إعادة رسم كل شيء عند تغيير الحجم
    if (localDrawingsCache.length > 0) {
        localDrawingsCache.forEach(d => drawCurve(d.points, d.color, d.size, false));
    }
}
window.onresize = resizeCanvas;
// تأخير بسيط لضمان تحميل العناصر
setTimeout(resizeCanvas, 100);

// 3. خوارزمية الرسم الناعم (Quadratic Curves)
function drawCurve(pointsList, color, size, emit) {
    if (pointsList.length < 2) return;

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = size;

    // تحويل الإحداثيات النسبية (0-1) إلى بكسل فعلي
    // إذا كانت النقطة أكبر من 1 فهي بكسل (نظام قديم) وإلا فهي نسبة (نظام جديد)
    const toPx = (pt) => ({
        x: pt.x <= 1 ? pt.x * canvas.width : pt.x,
        y: pt.y <= 1 ? pt.y * canvas.height : pt.y
    });

    const p0 = toPx(pointsList[0]);

    // نقطة البداية
    ctx.moveTo(p0.x, p0.y);

    // رسم منحنيات بيزيه بين النقاط
    for (let i = 1; i < pointsList.length - 2; i++) {
        const p1 = toPx(pointsList[i]);
        const p2 = toPx(pointsList[i + 1]);
        const xc = (p1.x + p2.x) / 2;
        const yc = (p1.y + p2.y) / 2;
        ctx.quadraticCurveTo(p1.x, p1.y, xc, yc);
    }

    // رسم آخر نقطتين كخط مستقيم لإغلاق المسار
    if (pointsList.length > 2) {
        const last = toPx(pointsList[pointsList.length - 1]);
        const secondLast = toPx(pointsList[pointsList.length - 2]);
        ctx.quadraticCurveTo(secondLast.x, secondLast.y, last.x, last.y);
    }

    ctx.stroke();

    if (emit && isTeacher) {
        // نرسل الخط كاملاً للقاعدة
        // لتقليل البيانات، يمكننا إرسال نقاط التحكم فقط، لكن للتبسيط سنرسل المسار
        push(drawingsRef, {
            points: pointsList,
            color: color,
            size: size
        });
    }
}

// 4. معالجة الأحداث
const getCoords = (e) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    // نرجع إحداثيات نسبية (0.0 إلى 1.0) لضمان التوافق بين الأجهزة
    return { 
        x: (clientX - rect.left) / canvas.width, 
        y: (clientY - rect.top) / canvas.height 
    };
};

const startDraw = (e) => {
    if (!isTeacher) return;
    isDrawing = true;
    points = [getCoords(e)];
};

const moveDraw = (e) => {
    if (!isDrawing || !isTeacher) return;
    e.preventDefault(); // منع سحب الشاشة
    const newPoint = getCoords(e);
    
    // فلتر المسافة (Throttling) لتقليل عدد النقاط وتسريع الرسم
    const lastPoint = points[points.length - 1];
    // نحسب المسافة بالنسبة المئوية
    const dist = Math.hypot(newPoint.x - lastPoint.x, newPoint.y - lastPoint.y);
    
    if (dist > 0.001) { // حساسية عالية جداً
        points.push(newPoint);
        
        // رسم "معاينة" محلية سريعة جداً بدون إرسال لقاعدة البيانات أثناء الحركة
        // نحتاج تحويل النقاط لبكسل للرسم المحلي
        const pxLast = { x: lastPoint.x * canvas.width, y: lastPoint.y * canvas.height };
        const pxNew = { x: newPoint.x * canvas.width, y: newPoint.y * canvas.height };

        ctx.beginPath();
        ctx.moveTo(pxLast.x, pxLast.y);
        ctx.lineTo(pxNew.x, pxNew.y);
        ctx.strokeStyle = currentColor;
        ctx.lineWidth = document.getElementById('brushSize').value;
        ctx.stroke();
    }
};

const endDraw = () => {
    if (!isDrawing || !isTeacher) return;
    isDrawing = false;
    // عند رفع القلم، نرسل المسار المحسن والناعم إلى Firebase
    if (points.length > 1) {
        drawCurve(points, currentColor, document.getElementById('brushSize').value, true);
    }
    points = [];
};

// ربط الأحداث
canvas.addEventListener('mousedown', startDraw);
canvas.addEventListener('mousemove', moveDraw);
canvas.addEventListener('mouseup', endDraw);
canvas.addEventListener('touchstart', startDraw, {passive: false});
canvas.addEventListener('touchmove', moveDraw, {passive: false});
canvas.addEventListener('touchend', endDraw);

// 5. الاستماع لبيانات Firebase
// استقبال الرسم
onChildAdded(drawingsRef, (snap) => {
    const val = snap.val();
    localDrawingsCache.push(val); // حفظ في الذاكرة المحلية
    // نستخدم requestAnimationFrame لمنع تجميد المتصفح
    requestAnimationFrame(() => {
        drawCurve(val.points, val.color, val.size, false);
    });
});

// استقبال الإعدادات (نيون + خلفية)
onValue(configRef, (snap) => {
    if (snap.exists()) {
        const config = snap.val();
        if (config.neonColor) {
            updateNeon(config.neonColor);
        }
        if (config.bgColor) {
            canvasWrapper.style.background = config.bgColor;
        }
    }
});

function updateNeon(color) {
    if (color === 'transparent') {
        canvasWrapper.style.boxShadow = 'none';
        canvasWrapper.style.borderColor = 'transparent';
    } else {
        canvasWrapper.style.borderColor = color;
        canvasWrapper.style.boxShadow = `0 0 20px ${color}, inset 0 0 20px ${color}`;
    }
}

// مسح السبورة
document.getElementById('clearBtn').onclick = () => {
    if (isTeacher) {
        remove(drawingsRef);
    }
};

onValue(drawingsRef, (snap) => {
    if (!snap.exists()) {
        localDrawingsCache = []; // مسح الذاكرة المحلية
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
});

// أدوات إضافية
document.getElementById('brushSize').oninput = (e) => {
    document.getElementById('sizeDisplay').textContent = e.target.value;
};
document.getElementById('customColor').oninput = (e) => {
    currentColor = e.target.value;
};
document.getElementById('modeBtn').onclick = function() {
    isTeacher = !isTeacher;
    this.textContent = isTeacher ? "مستر" : "طالب";
    this.style.background = isTeacher ? "linear-gradient(to right, #3b82f6, #2563eb)" : "#64748b";
};