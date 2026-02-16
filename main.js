import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, push, onChildAdded, onChildRemoved, onValue, remove, set, onDisconnect, get, query, orderByKey, limitToLast } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

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

// مراجع Firebase (سيتم تعيينها بعد الدخول للغرفة)
let drawingsRef;
let configRef;
let chatRef;
let presenceRef;
let pollRef;

// العناصر
const canvas = document.getElementById('whiteboard');
const canvasWrapper = document.getElementById('canvasWrapper');
const ctx = canvas.getContext('2d');
const toolsPanel = document.getElementById('toolsPanel'); // الهيدر
const toggleMenuBtn = document.getElementById('toggleMenuBtn');
const brushSize = document.getElementById('brushSize'); // إضافة مرجع للمتحكم

// الحالة
let isTeacher = true;
let isAuthenticated = false;
let isDrawing = false;
let isPanning = false;
let isEraser = false;
let currentColor = '#000000';
let currentSize = 3;
let points = []; // مصفوفة لتخزين النقاط لتحسين نعومة الخط
let localDrawingsCache = []; // تخزين محلي للرسومات لإعادة الرسم عند تغيير الحجم
let initialPinchDistance = null; // للممحاة
let initialSizeBeforePinch = 3;
let myUserId = Date.now().toString(); // معرف بسيط للمستخدم للشات
let currentUserName = 'مستخدم'; // اسم المستخدم الافتراضي
let currentRoomId = null; // تخزين رقم الغرفة الحالية

// متغيرات التكبير والتحريك (Zoom & Pan)
let scale = 1;
let panX = 0;
let panY = 0;
let startPan = { x: 0, y: 0 };

// الألوان
const colors = ['#000000', '#ef4444', '#22c55e', '#3b82f6', '#eab308', '#a855f7', '#ec4899', '#64748b', '#ffffff'];
const bgColors = ['#ffffff', '#f0f9ff', '#f0fdf4', '#fff1f2', '#1e293b', '#000000'];
const neonColors = ['transparent', '#ef4444', '#22c55e', '#3b82f6', '#facc15', '#d946ef', '#06b6d4'];

// ثابت كلمة سر المعلم
const TEACHER_PASS = '500';

// 0. نظام الحماية (كلمة السر)
const loginOverlay = document.getElementById('loginOverlay');
const roomIdInput = document.getElementById('roomIdInput');
const usernameInput = document.getElementById('usernameInput');
const roleInput = document.getElementById('roleInput');
const teacherPasswordInput = document.getElementById('teacherPasswordInput');
const loginBtn = document.getElementById('loginBtn');
const loginError = document.getElementById('loginError');

// إظهار حقل كلمة السر فقط للمستر
roleInput.onchange = () => {
    teacherPasswordInput.style.display = roleInput.value === 'teacher' ? 'block' : 'none';
};

async function handleLogin() {
    const roomId = roomIdInput.value.trim();
    const username = usernameInput.value.trim();
    const role = roleInput.value;
    const teacherPass = teacherPasswordInput.value.trim();

    if (!username) {
        showError('يرجى كتابة الاسم');
        return;
    }

    if (role === 'teacher') {
        if (teacherPass !== TEACHER_PASS) {
            showError('كلمة سر المستر خطأ!');
            return;
        }
        isTeacher = true;
    } else {
        isTeacher = false;
    }
    
    currentUserName = username;
    startRoom(roomId);
}

function showError(msg) {
    loginError.textContent = msg;
    loginError.style.display = 'block';
}
loginBtn.onclick = handleLogin;

// 1. بدء الغرفة وإعداد الواجهة
function startRoom(roomId) {
    isAuthenticated = true;
    loginOverlay.style.display = 'none';

    currentRoomId = roomId; // حفظ رقم الغرفة للاستخدام لاحقاً
    if (!isTeacher) {
        document.body.classList.add('student-mode');
    } else {
        document.body.classList.remove('student-mode');
    }

    // تعيين المسارات بناءً على اسم الغرفة
    const roomPath = `rooms/${roomId}`;
    drawingsRef = ref(db, `${roomPath}/drawings`);
    configRef = ref(db, `${roomPath}/config`);
    chatRef = ref(db, `${roomPath}/chat`);
    presenceRef = ref(db, `${roomPath}/connections`);
    pollRef = ref(db, `${roomPath}/poll`);

    initUI();
    setupFirebaseListeners();
}

function setBrushLimits(isForEraser) {
    const max = isForEraser ? 100 : 20;
    brushSize.max = max;
    if (brushSize.value > max) {
        const newSize = parseInt(max, 10);
        brushSize.value = newSize;
        document.getElementById('sizeDisplay').textContent = newSize;
        currentSize = newSize;
    }
}

function initUI() {
    // ألوان القلم
    const penContainer = document.getElementById('penColors');
    colors.forEach(c => {
        const dot = document.createElement('div');
        dot.className = 'color-dot';
        dot.style.background = c;
        dot.onclick = () => {
            currentColor = c;
            isEraser = false; // إلغاء الممحاة عند اختيار لون
            setBrushLimits(false); // false = not for eraser
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
            isEraser = (btn.id === 'eraserBtn');

            setBrushLimits(isEraser);
            
            // تفعيل وضع التحريك إذا تم اختيار اليد
            if (btn.id === 'panBtn') {
                canvas.style.cursor = 'grab';
            }
        };
    });

    // رفع الصور
    const imgInput = document.getElementById('imgInput');
    document.getElementById('uploadImgBtn').onclick = () => isTeacher && imgInput.click();
    
    imgInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file && isTeacher) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                set(configRef, { bgImage: evt.target.result }); // حفظ الصورة في القاعدة
            };
            reader.readAsDataURL(file);
        }
    };

    // الشات
    document.getElementById('toggleChatBtn').onclick = () => {
        document.getElementById('chatContainer').classList.toggle('closed');
    };
    document.getElementById('closeChat').onclick = () => {
        document.getElementById('chatContainer').classList.add('closed');
    };
    document.getElementById('sendChatBtn').onclick = sendChat;
    
    // رفع صور الشات
    const chatImgInput = document.getElementById('chatImgInput');
    document.getElementById('chatImgBtn').onclick = () => chatImgInput.click();
    chatImgInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (evt) => sendChat(null, evt.target.result);
            reader.readAsDataURL(file);
        }
    };

    // قائمة المتصلين
    document.getElementById('userCountBtn').onclick = () => {
        document.getElementById('usersPanel').classList.toggle('closed');
    };
    document.getElementById('closeUsersBtn').onclick = () => {
        document.getElementById('usersPanel').classList.add('closed');
    };

    // أدوات التصويت (للمعلم فقط)
    if (isTeacher) {
        const createPollBtn = document.getElementById('createPollBtn');
        createPollBtn.style.display = 'flex';
        createPollBtn.onclick = () => document.getElementById('pollModal').classList.remove('closed');

        document.getElementById('startPollYesNo').onclick = () => createPoll(['نعم', 'لا']);
        document.getElementById('startPollABCD').onclick = () => createPoll(['A', 'B', 'C', 'D']);
        
        document.getElementById('endPollBtn').style.display = 'block';
        document.getElementById('endPollBtn').onclick = () => {
            set(pollRef, null); // حذف التصويت
        };
    }
    document.getElementById('closePollModal').onclick = () => document.getElementById('pollModal').classList.add('closed');
}

// زر التراجع (Undo)
document.getElementById('undoBtn').onclick = () => {
    if (!isTeacher) return;
    const lastQuery = query(drawingsRef, orderByKey(), limitToLast(1));
    get(lastQuery).then((snapshot) => {
        snapshot.forEach((childSnapshot) => {
            remove(childSnapshot.ref);
        });
    });
};

// 2. نظام الرسم عالي الجودة (High DPI)
function resizeCanvas() {
    // تحديد نسبة أبعاد ثابتة (16:9) لضمان تطابق الرسم على جميع الأجهزة
    const targetRatio = 16 / 9;
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const winRatio = winW / winH;

    let finalW, finalH;

    if (winRatio > targetRatio) {
        // الشاشة أعرض من 16:9 (مثل الكمبيوتر)، نضبط الارتفاع ونحسب العرض
        finalH = winH;
        finalW = finalH * targetRatio;
    } else {
        // الشاشة أطول (مثل الموبايل)، نضبط العرض ونحسب الارتفاع
        finalW = winW;
        finalH = finalW / targetRatio;
    }

    // تعيين أبعاد العنصر الظاهرية (CSS)
    canvasWrapper.style.width = `${finalW}px`;
    canvasWrapper.style.height = `${finalH}px`;

    // تعيين الدقة الداخلية الثابتة (Full HD) لضمان جودة عالية وتوحيد الإحداثيات
    canvas.width = 1920;
    canvas.height = 1080;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // إعادة رسم كل شيء عند تغيير الحجم
    if (localDrawingsCache.length > 0) {
        localDrawingsCache.forEach(d => drawCurve(d.points, d.color, d.size, d.isEraser, false));
    }
}
window.onresize = resizeCanvas;
// تأخير بسيط لضمان تحميل العناصر
setTimeout(resizeCanvas, 100);

// 3. خوارزمية الرسم الناعم (Quadratic Curves)
function drawCurve(pointsList, color, size, isEraserMode, emit) {
    if (pointsList.length < 2) return;

    ctx.beginPath();
    ctx.strokeStyle = color;
    // ضبط حجم الخط ليتناسب مع الدقة العالية (1920px)
    // نضرب الحجم في معامل ليكون مناسباً للعين
    ctx.lineWidth = size * (canvas.width / 1000); 
    ctx.globalCompositeOperation = isEraserMode ? 'destination-out' : 'source-over';

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
    ctx.globalCompositeOperation = 'source-over'; // إعادة الوضع الطبيعي

    if (emit && isTeacher) {
        // نرسل الخط كاملاً للقاعدة
        // لتقليل البيانات، يمكننا إرسال نقاط التحكم فقط، لكن للتبسيط سنرسل المسار
        push(drawingsRef, {
            points: pointsList,
            color: color,
            size: size,
            isEraser: isEraserMode
        });
    }
}

// 4. معالجة الأحداث
const getCoords = (e) => {
    const rect = canvas.getBoundingClientRect();
    // حساب الإحداثيات بناءً على التحويلات (Zoom/Pan)
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    // المعادلة السحرية التي تعمل مع CSS Transform
    // (الموقع الفعلي - موقع العنصر) * (نسبة الحجم الداخلي / الحجم الظاهري)
    return { 
        x: (clientX - rect.left) / rect.width, 
        y: (clientY - rect.top) / rect.height 
    };
};

const startDraw = (e) => {
    if (!isTeacher || !isAuthenticated) return;

    // منطق التحريك (Pan)
    if (document.getElementById('panBtn').classList.contains('active')) { // تم إزالة التحريك بالزر الأيمن للماوس
        isPanning = true;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        startPan = { x: clientX - panX, y: clientY - panY };
        canvas.style.cursor = 'grabbing';
        return;
    }
    
    // منطق التكبير بالأصابع للممحاة
    if (e.touches && e.touches.length === 2 && isEraser) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        initialPinchDistance = Math.hypot(dx, dy);
        initialSizeBeforePinch = parseInt(document.getElementById('brushSize').value);
        return; // لا نرسم أثناء التكبير
    }

    isDrawing = true;
    points = [getCoords(e)];
};

const moveDraw = (e) => {
    if (!isTeacher || !isAuthenticated) return;
    e.preventDefault(); // منع سحب الشاشة

    // تنفيذ التحريك
    if (isPanning) {
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        panX = clientX - startPan.x;
        panY = clientY - startPan.y;
        updateTransform();
        return;
    }

    // منطق التكبير بالأصابع
    if (e.touches && e.touches.length === 2 && isEraser && initialPinchDistance) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const currentDist = Math.hypot(dx, dy);
        const scale = currentDist / initialPinchDistance;
        let newSize = Math.min(100, Math.max(1, initialSizeBeforePinch * scale));
        
        document.getElementById('brushSize').value = newSize;
        document.getElementById('sizeDisplay').textContent = Math.round(newSize);
        currentSize = newSize;
        return;
    }

    if (!isDrawing) return;

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
        ctx.lineWidth = currentSize * (canvas.width / 1000); // استخدام الحجم الحالي لتحسين الأداء
        ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
    }
};

const endDraw = () => {
    initialPinchDistance = null; // تصفير التكبير
    if (isPanning) {
        isPanning = false;
        canvas.style.cursor = document.getElementById('panBtn').classList.contains('active') ? 'grab' : 'default';
        return;
    }
    if (!isDrawing || !isTeacher || !isAuthenticated) return;
    isDrawing = false;
    // عند رفع القلم، نرسل المسار المحسن والناعم إلى Firebase
    if (points.length > 0) {
        // إذا كانت نقطة واحدة (ضغطة)، نكررها لرسم نقطة
        if (points.length === 1) {
            points.push({ x: points[0].x, y: points[0].y });
        }
        drawCurve(points, currentColor, currentSize, isEraser, true);
    }
    points = [];
};

// منطق التكبير بالعجلة (Zoom)
canvasWrapper.addEventListener('wheel', (e) => {
    if (e.ctrlKey || document.getElementById('panBtn').classList.contains('active')) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = scale * delta;
        // حدود التكبير
        if (newScale > 0.5 && newScale < 5) {
            scale = newScale;
            updateTransform();
        }
    }
}, { passive: false });

function updateTransform() {
    // تطبيق التحويل على الكانفاس
    canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
}

// ربط الأحداث
canvas.addEventListener('mousedown', startDraw);
canvas.addEventListener('mousemove', moveDraw);
canvas.addEventListener('mouseup', endDraw);
canvas.addEventListener('touchstart', startDraw, {passive: false});
canvas.addEventListener('touchmove', moveDraw, {passive: false});
canvas.addEventListener('touchend', endDraw);

// 5. الاستماع لبيانات Firebase (داخل دالة لضمان عدم العمل قبل الدخول)
function setupFirebaseListeners() {
    // استقبال الرسم
    onChildAdded(drawingsRef, (snap) => {
        const val = snap.val();
        localDrawingsCache.push({ key: snap.key, ...val }); // تخزين المفتاح للحذف لاحقاً
        requestAnimationFrame(() => {
            drawCurve(val.points, val.color, val.size, val.isEraser, false);
        });
    });

    // استقبال حذف رسمة (للتراجع)
    onChildRemoved(drawingsRef, (snap) => {
        const key = snap.key;
        localDrawingsCache = localDrawingsCache.filter(item => item.key !== key);
        
        // إعادة رسم السبورة بالكامل بدون العنصر المحذوف
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        localDrawingsCache.forEach(d => drawCurve(d.points, d.color, d.size, d.isEraser, false));
    });

    // استقبال الإعدادات
    onValue(configRef, (snap) => {
        if (snap.exists()) {
            const config = snap.val();
            if (config.neonColor) updateNeon(config.neonColor);
            if (config.bgColor) {
                canvasWrapper.style.background = config.bgColor;
                canvasWrapper.style.backgroundImage = 'none';
            }
            if (config.bgImage) {
                canvasWrapper.style.backgroundImage = `url(${config.bgImage})`;
                canvasWrapper.style.backgroundSize = 'contain';
            }
        }
    });

    // مسح السبورة
    onValue(drawingsRef, (snap) => {
        if (!snap.exists()) {
            localDrawingsCache = [];
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    });

    // الشات
    onChildAdded(chatRef, (snap) => {
        const msg = snap.val() || {};
        const key = snap.key;

        if (localStorage.getItem('deleted_' + key)) return;

        const div = document.createElement('div');
        div.setAttribute('data-key', key);
        div.className = `msg ${msg.senderId === myUserId ? 'self' : 'other'}`;
        
        if (msg.image) div.innerHTML = `<img src="${msg.image}" class="chat-msg-img">`;
        if (msg.text) {
            const textSpan = document.createElement('div');
            textSpan.textContent = msg.text;
            div.appendChild(textSpan);
        }

        div.oncontextmenu = (e) => {
            e.preventDefault();
            selectedMsgKey = key;
            const contextMenu = document.getElementById('contextMenu');
            contextMenu.style.display = 'flex';
            contextMenu.style.left = e.pageX + 'px';
            contextMenu.style.top = e.pageY + 'px';
        };

        const container = document.getElementById('chatMessages');
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;

        const chatContainer = document.getElementById('chatContainer');
        if (chatContainer && chatContainer.classList.contains('closed') && msg.senderId !== myUserId) {
            const toast = document.getElementById('notificationToast');
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 3000);
        }
    });

    onChildRemoved(chatRef, (snap) => {
        const el = document.querySelector(`[data-key="${snap.key}"]`);
        if (el) el.remove();
    });

    // الحضور
    const userRef = push(presenceRef);
    onValue(ref(db, '.info/connected'), (snap) => {
        if (snap.val() === true) {
            onDisconnect(userRef).remove();
            set(userRef, { name: currentUserName, id: myUserId });
        }
    });
    
    onValue(presenceRef, (snap) => {
        const users = snap.val() || {};
        const count = Object.keys(users).length;
        document.getElementById('userCountBtn').textContent = `👥 ${count}`;
        
        // تحديث قائمة المتصلين
        const list = document.getElementById('usersList');
        list.innerHTML = '';
        Object.values(users).forEach(user => {
            const div = document.createElement('div');
            div.className = 'user-item';
            div.textContent = user.name || 'مجهول';
            list.appendChild(div);
        });
    });

    // التصويت
    onValue(pollRef, (snap) => {
        const poll = snap.val();
        if (poll && poll.active) {
            showPollUI(poll);
        } else {
            document.getElementById('activePollPanel').classList.add('closed');
        }
    });
}

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

// نظام الشات
function sendChat(e, imgData = null) {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    
    if (text || imgData) {
        push(chatRef, { 
            text: text, 
            image: imgData,
            senderId: myUserId,
            timestamp: Date.now()
        });
        input.value = '';
    }
}

// حذف الرسائل
let selectedMsgKey = null;
const contextMenu = document.getElementById('contextMenu');

document.addEventListener('click', () => contextMenu.style.display = 'none');

document.getElementById('deleteForMe').onclick = () => {
    if (selectedMsgKey) {
        localStorage.setItem('deleted_' + selectedMsgKey, 'true');
        document.querySelector(`[data-key="${selectedMsgKey}"]`).remove();
    }
};

document.getElementById('deleteForEveryone').onclick = () => {
    if (selectedMsgKey) {
        // يمكن فقط للمعلم أو المرسل الحذف
        remove(ref(db, 'chat/' + selectedMsgKey));
    }
};

// أدوات إضافية
brushSize.oninput = (e) => {
    const newSize = e.target.value;
    document.getElementById('sizeDisplay').textContent = newSize;
    currentSize = parseInt(newSize, 10); // تحديث متغير الحجم الحالي لتحسين الأداء
};
document.getElementById('customColor').oninput = (e) => {
    currentColor = e.target.value;
};

// دوال التصويت
function createPoll(options) {
    const question = document.getElementById('pollQuestionInput').value.trim() || 'سؤال سريع';
    const pollData = {
        question: question,
        options: options,
        active: true,
        votes: {}
    };
    set(pollRef, pollData);
    document.getElementById('pollModal').classList.add('closed');
    document.getElementById('pollQuestionInput').value = '';
}

function showPollUI(poll) {
    const panel = document.getElementById('activePollPanel');
    const container = document.getElementById('pollOptionsContainer');
    const questionDisplay = document.getElementById('pollQuestionDisplay');
    
    panel.classList.remove('closed');
    questionDisplay.innerHTML = `${poll.question} <span style="font-size:0.8em; color:#aaa">(${Object.keys(poll.votes || {}).length} صوت)</span>`;
    container.innerHTML = '';

    // حساب النتائج
    const votes = poll.votes || {};
    const totalVotes = Object.keys(votes).length;
    const results = {};
    poll.options.forEach(opt => results[opt] = 0);
    Object.values(votes).forEach(v => {
        if (results[v] !== undefined) results[v]++;
    });

    // عرض الخيارات
    poll.options.forEach(opt => {
        const wrapper = document.createElement('div');
        wrapper.style.marginBottom = '10px';

        const btn = document.createElement('div');
        btn.className = 'poll-option-btn';
        btn.textContent = `${opt} (${results[opt]})`;
        
        // إذا لم يصوت المستخدم بعد، اجعل الزر قابل للنقر
        if (!votes[myUserId] && !isTeacher) {
            btn.onclick = () => {
                set(ref(db, `rooms/${currentRoomId}/poll/votes/${myUserId}`), opt);
            };
        } else {
            btn.style.cursor = 'default';
            if (votes[myUserId] === opt) btn.style.background = 'var(--primary)';
        }

        const bar = document.createElement('div');
        bar.className = 'poll-bar';
        const percentage = totalVotes > 0 ? (results[opt] / totalVotes) * 100 : 0;
        bar.style.width = `${percentage}%`;

        wrapper.appendChild(btn);
        wrapper.appendChild(bar);
        container.appendChild(wrapper);
    });
}