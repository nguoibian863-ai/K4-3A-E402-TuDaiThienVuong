/**
 * VLearn Smart Workflow - Interactive Prototype Logic
 * Batch 04 - Hackathon AI
 */

// =========================================================================
// 0. CONFIG + API HELPERS
// =========================================================================
const API_BASE = window.VLEARN_API_BASE || 'http://localhost:8000';
const SESSION_ID = 'demo-session-1';
let lessonName = 'Chưa tải slide';
// Mã bộ slide đang mở = 16 ký tự hex đầu của SHA-256 file PDF. Mọi ghi chú / câu hỏi /
// tiến độ đều gắn mã này để đổi sang slide khác không bị trộn dữ liệu theo số trang.
let lessonId = null;
const DEFAULT_DECK_NAME = 'Buoi3_PromptEngineering_v2_compressed';
const LAST_DECK_KEY = 'vlearn:lastDeckId';

// Dữ liệu mẫu demo ban đầu (nếu buổi học mới chưa có ghi chú)
const FALLBACK_ACTIVITIES = [
  {
    id: 'demo-note-1',
    type: 'note',
    slide: 3,
    highlight: 'Query, Key, Value trong cơ chế Self-Attention',
    note: 'Chưa hiểu rõ công thức tính ma trận Attention score.',
    rating: 2,
    time_label: '10:05'
  },
  {
    id: 'demo-note-2',
    type: 'note',
    slide: 4,
    highlight: 'Multi-head Attention chia thành h không gian biểu diễn khác nhau',
    note: 'Cần xem lại vì sao phải chia ra h head thay vì dùng 1 ma trận lớn.',
    rating: 3,
    time_label: '10:14'
  },
  {
    id: 'demo-prog-1',
    type: 'progress',
    slide: 4,
    highlight: 'Đã học đến phần Multi-head Attention',
    time_label: '10:18'
  }
];

// true khi có hoạt động mới chưa được AI xếp vào danh sách ôn (B7)
let reviewStale = true;

// Delegate trung tâm thông báo để có thể gọi từ bất kỳ đâu (kể cả ngoài DOMContentLoaded)
let pushNotification = function({ category = 'system', title = 'Thông báo', message = '', showToastNotification = true, meta = null }) {
  console.log('[Notification fallback]', category, title, message);
};

let lastApiErrorNotifTime = 0;
function notifyApiError(actionName) {
  const now = Date.now();
  if (now - lastApiErrorNotifTime > 6000) {
    lastApiErrorNotifTime = now;
    pushNotification({
      category: 'system',
      title: 'Lỗi kết nối máy chủ',
      message: `Không thể kết nối đến backend AI (${actionName}). Kiểm tra server rồi thử lại.`
    });
  }
}

async function apiPost(path, body) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
    return await res.json();
  } catch (err) {
    notifyApiError(`POST ${path}`);
    throw err;
  }
}

async function apiGet(path) {
  try {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
    return await res.json();
  } catch (err) {
    notifyApiError(`GET ${path}`);
    throw err;
  }
}

async function apiDelete(path) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`);
    return await res.json();
  } catch (err) {
    notifyApiError(`DELETE ${path}`);
    throw err;
  }
}

async function saveActivity(payload) {
  if (!lessonId) return false;
  const body = { session_id: SESSION_ID, lesson: lessonName, lesson_id: lessonId, ...payload };
  try {
    await apiPost('/activities', body);
    reviewStale = true;
    return true;
  } catch (err) {
    console.warn('saveActivity: backend không phản hồi, chỉ lưu tạm trên trình duyệt.', err);
    return false;
  }
}

async function submitCorrection(concept, action, newRating) {
  try {
    await apiPost('/corrections', {
      session_id: SESSION_ID,
      lesson_id: lessonId,
      concept,
      action,
      new_rating: newRating ?? null,
    });
  } catch (err) {
    console.warn('submitCorrection: backend không phản hồi.', err);
  }
}

// ---- Mã bộ slide + lưu slide đã tải lên trong trình duyệt (IndexedDB) ----
async function computeLessonId(bytes) {
  if (window.crypto && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest).slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Dự phòng khi trình duyệt không có crypto.subtle: FNV-1a 64-bit (khác mã SHA-256)
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < bytes.length; i++) {
    h ^= BigInt(bytes[i]);
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return `fnv${h.toString(16).padStart(16, '0')}`;
}

function openDeckDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('vlearn-decks', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('decks', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putStoredDeck(id, name, bytes) {
  try {
    const db = await openDeckDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('decks', 'readwrite');
      tx.objectStore('decks').put({ id, name, bytes, savedAt: Date.now() });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('Không lưu được slide vào IndexedDB (link mở tab mới sẽ không có slide này).', err);
  }
}

async function getStoredDeck(id) {
  try {
    const db = await openDeckDb();
    const record = await new Promise((resolve, reject) => {
      const req = db.transaction('decks', 'readonly').objectStore('decks').get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return record;
  } catch (err) {
    console.warn('Không đọc được slide từ IndexedDB.', err);
    return null;
  }
}

function readLastDeckId() {
  try {
    return localStorage.getItem(LAST_DECK_KEY);
  } catch (err) {
    return null;
  }
}

function writeLastDeckId(id) {
  try {
    localStorage.setItem(LAST_DECK_KEY, id);
  } catch (err) {
    // chế độ riêng tư / chặn storage: bỏ qua, chỉ mất tính năng nhớ bộ slide
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // =========================================================================
  // 1. ĐIỀU HƯỚNG 2 GIAI ĐOẠN (nút "Trong lớp" / "Sau buổi học" trên header)
  // =========================================================================
  const navStage1 = document.getElementById('nav-stage-1');
  const navStage2 = document.getElementById('nav-stage-2');

  navStage1.addEventListener('click', () => switchSimPhase('inclass'));
  navStage2.addEventListener('click', () => switchSimPhase('afterclass'));

  const ratingLabels = {
    1: '1/5 (Chưa hiểu)',
    2: '2/5 (Chưa hiểu rõ)',
    3: '3/5 (Hiểu một phần)',
    4: '4/5 (Khá tốt)',
    5: '5/5 (Hiểu rõ)'
  };

  // =========================================================================
  // 2. CHUYỂN GIAI ĐOẠN 1 (TRONG LỚP) / GIAI ĐOẠN 2 (SAU BUỔI HỌC)
  // =========================================================================

  const simTabInClass = document.getElementById('sim-tab-inclass');
  const simTabAfterClass = document.getElementById('sim-tab-afterclass');
  const simScreenInClass = document.getElementById('sim-screen-inclass');
  const simScreenAfterClass = document.getElementById('sim-screen-afterclass');

  function switchSimPhase(phase) {
    navStage1.classList.toggle('active', phase === 'inclass');
    navStage2.classList.toggle('active', phase !== 'inclass');
    if (phase === 'inclass') {
      simTabInClass.classList.add('active');
      simTabAfterClass.classList.remove('active');
      simScreenInClass.classList.add('active');
      simScreenAfterClass.classList.remove('active');
    } else {
      simTabAfterClass.classList.add('active');
      simTabInClass.classList.remove('active');
      simScreenAfterClass.classList.add('active');
      simScreenInClass.classList.remove('active');
      onEnterPhase2();
    }
  }

  simTabInClass.addEventListener('click', () => switchSimPhase('inclass'));
  simTabAfterClass.addEventListener('click', () => switchSimPhase('afterclass'));

  document.getElementById('btn-go-phase-2').addEventListener('click', () => {
    switchSimPhase('afterclass');
    showToast('🌙 Đã sang Giai đoạn 2: Buổi tối ôn tập cá nhân hóa & dạy lại cho AI!');
  });

  // =========================================================================
  // 2b. SLIDE PDF THẬT — cuộn liên tục nhiều trang, lazy-render theo viewport
  // =========================================================================
  const pdfFileInput = document.getElementById('pdf-file-input');
  const pdfEmptyState = document.getElementById('pdf-empty-state');
  const pdfScrollContainer = document.getElementById('pdf-scroll-container');
  const slideLessonTitle = document.getElementById('slide-lesson-title');
  const slidePageIndicator = document.getElementById('slide-page-indicator');
  const slideThumbList = document.getElementById('slide-thumb-list');
  const btnPrevSlide = document.getElementById('btn-prev-slide');
  const btnNextSlide = document.getElementById('btn-next-slide');

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  let pdfDoc = null;
  let currentPageNo = 1; // trang đang xem nhiều nhất trên màn hình (chỉ để hiển thị)
  let pageEntries = []; // [{pageNo, wrap, canvas, textLayer, rendered}]
  // Đoạn đã lưu (ghi chú / link slide / tiến độ) để tô màu lại ngay trên slide
  let savedHighlights = []; // [{slide, highlight, type, note, rating}]
  let renderObserver = null;
  let visibilityObserver = null;

  async function renderPageEntry(entry) {
    if (entry.rendered) return;
    entry.rendered = true; // đặt trước để tránh render trùng khi observer bắn nhiều lần

    const page = await pdfDoc.getPage(entry.pageNo);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = entry.wrap.clientWidth / baseViewport.width;
    const viewport = page.getViewport({ scale });
    const ratio = window.devicePixelRatio || 1;

    entry.canvas.width = Math.floor(viewport.width * ratio);
    entry.canvas.height = Math.floor(viewport.height * ratio);
    entry.canvas.style.width = `${viewport.width}px`;
    entry.canvas.style.height = `${viewport.height}px`;
    entry.wrap.style.height = `${viewport.height}px`;

    await page.render({
      canvasContext: entry.canvas.getContext('2d'),
      viewport,
      transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null,
    }).promise;

    entry.textLayer.style.setProperty('--scale-factor', scale);
    const textContent = await page.getTextContent();
    try {
      await pdfjsLib.renderTextLayer({
        textContentSource: textContent,
        container: entry.textLayer,
        viewport,
        textDivs: [],
      }).promise;
    } catch (err) {
      console.warn('renderTextLayer failed', err);
    }
    applySavedHighlights(entry);
  }

  const HIGHLIGHT_TYPES = new Set(['note', 'bookmark', 'progress']);

  function highlightTitle(item) {
    if (item.type === 'note') {
      const note = item.note ? `: ${item.note}` : '';
      return `📊 Ghi chú (hiểu ${item.rating}/5)${note}`;
    }
    if (item.type === 'bookmark') return '🔗 Đã lưu link slide';
    return '📍 Đã học đến đây';
  }

  // Tô màu các đoạn đã lưu trên lớp chữ của 1 trang. So khớp bỏ qua khoảng trắng vì
  // chữ bôi đen có thể trải qua nhiều span / xuống dòng của pdf.js.
  function applySavedHighlights(entry) {
    if (!entry.rendered) return;
    const spans = Array.from(entry.textLayer.querySelectorAll('span[role="presentation"]'));
    spans.forEach((span) => {
      if (span.querySelector('mark')) span.textContent = span.textContent;
    });

    const items = savedHighlights.filter((it) => it.slide === entry.pageNo);
    if (!items.length || !spans.length) return;

    let flat = '';
    const map = []; // vị trí trong flat -> [chỉ số span, chỉ số ký tự]
    spans.forEach((span, si) => {
      const text = span.textContent;
      for (let ci = 0; ci < text.length; ci++) {
        if (/\s/.test(text[ci])) continue;
        flat += text[ci];
        map.push([si, ci]);
      }
    });

    // Mỗi ký tự có thể thuộc nhiều mục (vd vừa ghi chú vừa lưu tiến độ) -> gom theo ký tự
    const marksBySpan = new Map(); // chỉ số span -> mảng (theo ký tự) các mục phủ lên
    items.forEach((item) => {
      const needle = (item.highlight || '').replace(/\s+/g, '');
      if (!needle) return;
      const at = flat.indexOf(needle);
      if (at < 0) return;
      for (let k = at; k < at + needle.length; k++) {
        const [si, ci] = map[k];
        if (!marksBySpan.has(si)) marksBySpan.set(si, []);
        const perChar = marksBySpan.get(si);
        (perChar[ci] = perChar[ci] || []).push(item);
      }
    });

    marksBySpan.forEach((perChar, si) => {
      const span = spans[si];
      const text = span.textContent;
      const keyAt = (ci) => (perChar[ci] || []).map((it) => it.type).sort().join(',');
      // Khoảng trắng kẹp giữa 2 ký tự cùng loại tô thì tô luôn, để vệt màu liền không đứt theo từ
      for (let ci = 0; ci < text.length; ci++) {
        if (!/\s/.test(text[ci]) || !perChar[ci - 1]) continue;
        let next = ci;
        while (next < text.length && /\s/.test(text[next])) next++;
        if (next < text.length && keyAt(next) === keyAt(ci - 1)) {
          for (let k = ci; k < next; k++) perChar[k] = perChar[ci - 1];
        }
        ci = next - 1;
      }
      span.textContent = '';
      let pos = 0;
      while (pos < text.length) {
        const key = keyAt(pos);
        let end = pos + 1;
        while (end < text.length && keyAt(end) === key) end++;
        const chunk = text.slice(pos, end);
        if (!key) {
          span.appendChild(document.createTextNode(chunk));
        } else {
          const covering = perChar[pos];
          const mark = document.createElement('mark');
          const types = [...new Set(covering.map((it) => it.type))];
          mark.className = ['saved-hl', ...types.map((t) => `saved-hl-${t}`)].join(' ');
          mark.title = covering.map(highlightTitle).join('\n') + '\n(Nhấp để xem hoặc xóa ghi chú)';
          mark.textContent = chunk;
          mark.addEventListener('click', (e) => {
            e.stopPropagation();
            const noteItem = covering.find((it) => it.type === 'note') || covering[0];
            if (noteItem) {
              openDeleteNoteModal(noteItem);
            }
          });
          span.appendChild(mark);
        }
        pos = end;
      }
    });
  }

  function setSavedHighlights(items) {
    const withText = (items || []).filter((it) => HIGHLIGHT_TYPES.has(it.type) && it.highlight);
    // Tiến độ chỉ có ý nghĩa ở lần lưu mới nhất (backend trả mới nhất trước)
    const latestProgress = withText.find((it) => it.type === 'progress');
    savedHighlights = withText.filter((it) => it.type !== 'progress' || it === latestProgress);
    pageEntries.forEach(applySavedHighlights);
  }

  function renderThumbList() {
    slideThumbList.innerHTML = '';
    const total = pdfDoc.numPages;
    const start = Math.max(1, Math.min(currentPageNo - 2, total - 4));
    const end = Math.min(total, start + 4);
    for (let p = start; p <= end; p++) {
      const card = document.createElement('div');
      card.className = `thumb-card${p === currentPageNo ? ' current' : ''}`;
      const no = document.createElement('span');
      no.className = 'thumb-no';
      no.textContent = String(p);
      const wire = document.createElement('div');
      wire.className = 'thumb-wire';
      wire.textContent = `Trang ${p}`;
      card.appendChild(no);
      card.appendChild(wire);
      if (p === currentPageNo) {
        const dot = document.createElement('span');
        dot.className = 'active-dot';
        card.appendChild(dot);
      }
      card.addEventListener('click', () => scrollToPage(p));
      slideThumbList.appendChild(card);
    }
  }

  function setCurrentPage(pageNo) {
    if (pageNo === currentPageNo) return;
    currentPageNo = pageNo;
    slidePageIndicator.innerHTML = `Trang <strong>${pageNo}</strong> / ${pdfDoc.numPages}`;
    btnPrevSlide.disabled = pageNo === 1;
    btnNextSlide.disabled = pageNo === pdfDoc.numPages;
    renderThumbList();
  }

  function scrollToPage(pageNo) {
    const entry = pageEntries[pageNo - 1];
    if (!entry) return;
    entry.wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    hideLiveActionBar();
  }

  btnPrevSlide.addEventListener('click', () => scrollToPage(currentPageNo - 1));
  btnNextSlide.addEventListener('click', () => scrollToPage(currentPageNo + 1));

  async function buildPageWraps() {
    pdfScrollContainer.innerHTML = '';
    pageEntries = [];
    if (renderObserver) renderObserver.disconnect();
    if (visibilityObserver) visibilityObserver.disconnect();

    // Ước lượng chiều cao mỗi trang theo tỉ lệ trang 1 (slide thường đồng nhất
    // khổ) TRƯỚC khi tạo các div, để trang chưa vẽ vẫn chiếm đúng chỗ — nếu
    // không, tất cả 100 trang co về ~0px và IntersectionObserver tưởng nhầm
    // toàn bộ đều lọt vào khung nhìn, vẽ hết cùng lúc.
    const firstPage = await pdfDoc.getPage(1);
    const firstViewport = firstPage.getViewport({ scale: 1 });
    const estimatedWidth = pdfScrollContainer.clientWidth || 800;
    const estimatedHeight = estimatedWidth * (firstViewport.height / firstViewport.width);

    for (let p = 1; p <= pdfDoc.numPages; p++) {
      const wrap = document.createElement('div');
      wrap.className = 'pdf-page-wrap';
      wrap.dataset.pageNo = String(p);
      wrap.style.height = `${estimatedHeight}px`;

      const badge = document.createElement('span');
      badge.className = 'pdf-page-num-badge';
      badge.textContent = `Trang ${p}`;

      const canvas = document.createElement('canvas');
      const textLayer = document.createElement('div');
      textLayer.className = 'textLayer';

      wrap.appendChild(badge);
      wrap.appendChild(canvas);
      wrap.appendChild(textLayer);
      pdfScrollContainer.appendChild(wrap);

      pageEntries.push({ pageNo: p, wrap, canvas, textLayer, rendered: false });
    }

    // Vẽ trang khi gần lọt vào khung nhìn (preload trước/sau ~1 màn hình)
    renderObserver = new IntersectionObserver(
      (observed) => {
        observed.forEach((it) => {
          if (!it.isIntersecting) return;
          const pageNo = Number(it.target.dataset.pageNo);
          renderPageEntry(pageEntries[pageNo - 1]);
        });
      },
      { root: pdfScrollContainer, rootMargin: '800px 0px', threshold: 0 }
    );

    // Theo dõi trang đang hiện rõ nhất để cập nhật số trang / sidebar.
    // Observer chỉ báo các trang vừa đổi trạng thái, nên phải nhớ tỉ lệ của MỌI trang
    // rồi chọn trang lớn nhất — nếu chỉ so trong 1 lượt báo sẽ chọn nhầm trang vừa lọt vào.
    const visibleRatios = new Map();
    visibilityObserver = new IntersectionObserver(
      (observed) => {
        observed.forEach((it) => {
          const pageNo = Number(it.target.dataset.pageNo);
          if (it.isIntersecting) visibleRatios.set(pageNo, it.intersectionRatio);
          else visibleRatios.delete(pageNo);
        });
        let bestPage = null;
        let bestRatio = -1;
        visibleRatios.forEach((ratio, pageNo) => {
          if (ratio > bestRatio || (ratio === bestRatio && pageNo < bestPage)) {
            bestRatio = ratio;
            bestPage = pageNo;
          }
        });
        if (bestPage) setCurrentPage(bestPage);
      },
      { root: pdfScrollContainer, threshold: [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1] }
    );

    pageEntries.forEach((entry) => {
      renderObserver.observe(entry.wrap);
      visibilityObserver.observe(entry.wrap);
    });
  }

  // persist: cất slide vào IndexedDB để tab mới (link "📖 Trang X") mở lại đúng bộ slide
  async function loadPdf(data, name, { persist = false } = {}) {
    let newLessonId;
    try {
      newLessonId = await computeLessonId(data);
      // pdf.js có thể chuyển (detach) buffer sang worker -> đưa bản sao
      pdfDoc = await pdfjsLib.getDocument({ data: data.slice() }).promise;
    } catch (err) {
      console.warn('Load PDF failed', err);
      showToast('⚠️ Không mở được file PDF này.');
      return false;
    }
    if (persist) await putStoredDeck(newLessonId, name, data);
    writeLastDeckId(newLessonId);
    const lessonChanged = newLessonId !== lessonId;
    lessonId = newLessonId;
    lessonName = name.replace(/\.pdf$/i, '');
    slideLessonTitle.textContent = lessonName;
    pdfEmptyState.style.display = 'none';
    pdfScrollContainer.style.display = 'block';
    currentPageNo = 0; // ép setCurrentPage(1) chạy dù đang là giá trị mặc định
    await buildPageWraps();
    setCurrentPage(1);
    if (lessonChanged) onLessonChanged();
    return true;
  }

  // Đổi sang bộ slide khác: dữ liệu học (nhật ký, danh sách ôn, chat) phải theo bộ slide mới
  function onLessonChanged() {
    reviewStale = true;
    currentHighlightText = '';
    hideLiveActionBar();
    loadActivities();
    resetPhase2Chat();
  }

  pdfFileInput.addEventListener('change', async () => {
    const file = pdfFileInput.files[0];
    if (!file) return;
    const data = new Uint8Array(await file.arrayBuffer());
    const ok = await loadPdf(data, file.name, { persist: true });
    if (ok) showToast(`📄 Đã mở "${lessonName}" (${pdfDoc.numPages} trang). Bôi đen chỗ cần lưu ý!`);
  });

  // Slide bài giảng hard-code sẵn (lecture-pdf-data.js) — tự mở khi vào trang, chạy được
  // cả khi mở file:// trực tiếp (không cần server). Vẫn bấm "Tải slide PDF" để đổi file khác.
  // Tab mở từ nút "📖 Trang X" (URL #slide=N): chờ PDF tải xong rồi cuộn tới trang đó
  let pendingSlideJump = null;

  function jumpToSlide(slideNo) {
    const entry = pageEntries[slideNo - 1];
    if (!entry) return;
    setTimeout(() => {
      entry.wrap.scrollIntoView({ behavior: 'auto', block: 'start' });
      entry.wrap.classList.add('pdf-page-flash');
      setTimeout(() => entry.wrap.classList.remove('pdf-page-flash'), 2000);
    }, 100);
  }

  let pendingDeckId = null; // mã bộ slide trong link "#slide=N&deck=..."

  // Mở trang: ưu tiên bộ slide trong link, rồi bộ slide dùng lần trước, cuối cùng slide mặc định
  async function loadInitialDeck() {
    const wantedId = pendingDeckId || readLastDeckId();
    let ok = false;
    if (wantedId) {
      const stored = await getStoredDeck(wantedId);
      if (stored) ok = await loadPdf(stored.bytes, stored.name);
    }
    if (!ok) {
      try {
        const res = await fetch(`${API_BASE}/data/${DEFAULT_DECK_NAME}.pdf`);
        if (res.ok) {
          const buf = new Uint8Array(await res.arrayBuffer());
          ok = await loadPdf(buf, DEFAULT_DECK_NAME, { persist: true });
        }
      } catch (err) {
        console.warn('Không tải được slide mặc định', err);
      }
    }
    if (!ok) return;

    if (pendingDeckId && pendingDeckId !== lessonId) {
      showToast('⚠️ Trình duyệt này chưa có bộ slide của link. Bấm "📄 Tải slide PDF" để mở đúng file rồi thử lại.');
      pendingSlideJump = null;
      return;
    }
    if (pendingSlideJump) {
      jumpToSlide(pendingSlideJump);
      showToast(`📖 Đang xem lại Trang ${pendingSlideJump} — ${lessonName}`);
      pendingSlideJump = null;
    } else {
      showToast(`📄 Đã mở "${lessonName}" (${pdfDoc.numPages} trang). Bôi đen chỗ cần lưu ý!`);
    }
  }

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (!pdfDoc) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      // Đổi khung hình -> vẽ lại các trang đã render (kích thước theo bề rộng mới)
      pageEntries.forEach((entry) => {
        if (entry.rendered) {
          entry.rendered = false;
          renderPageEntry(entry);
        }
      });
    }, 250);
  });

  // Step 2 in Simulation: bôi đen thật trên slide -> hiện Floating Action Bar
  const liveActionBar = document.getElementById('live-action-bar');
  const liveBtnQa = document.getElementById('live-btn-qa');
  const liveBtnNote = document.getElementById('live-btn-note');

  const liveStep3Drawer = document.getElementById('live-step-3-drawer');
  const closeStep3Drawer = document.getElementById('close-step-3-drawer');
  const liveStep4Modal = document.getElementById('live-step-4-modal');
  const closeStep4Modal = document.getElementById('close-step-4-modal');

  // Đoạn text + số trang học viên vừa bôi đen thật (dùng lại cho B3/B4)
  let currentHighlightText = '';
  let currentHighlightPageNo = 1;

  function hideLiveActionBar() {
    liveActionBar.style.display = 'none';
  }

  document.addEventListener('mouseup', (event) => {
    // Bấm vào chính popup thì không xử lý lại selection
    if (liveActionBar.contains(event.target)) return;

    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : '';
    const anchorNode = selection && selection.anchorNode;
    const anchorEl = anchorNode
      ? (anchorNode.nodeType === Node.TEXT_NODE ? anchorNode.parentElement : anchorNode)
      : null;
    const pageWrapEl = anchorEl ? anchorEl.closest('.pdf-page-wrap') : null;

    if (!pdfDoc || !text || selection.rangeCount === 0 || !pageWrapEl) {
      hideLiveActionBar();
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    currentHighlightText = text;
    currentHighlightPageNo = Number(pageWrapEl.dataset.pageNo);
    liveActionBar.style.display = 'flex';
    liveActionBar.style.top = `${rect.top - liveActionBar.offsetHeight - 12}px`;
    liveActionBar.style.left = `${rect.left + rect.width / 2}px`;
    liveActionBar.style.transform = 'translateX(-50%)';
    liveActionBar.style.animation = 'none';
    requestAnimationFrame(() => {
      liveActionBar.style.animation = 'popIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)';
    });
  });

  // LIVE STEP 2 -> STEP 3: Click Hỏi đáp — chat nhiều lượt, giữ ngữ cảnh
  const liveQaInput = document.getElementById('live-qa-input');
  const liveQaSend = document.getElementById('live-qa-send');
  const liveQaMessages = document.getElementById('live-qa-messages');
  const liveQaHighlightText = document.getElementById('live-qa-highlight-text');
  const liveQaDrawerSubtitle = document.getElementById('live-qa-drawer-subtitle');

  let qaHistory = []; // [{question, answer}] — reset mỗi khi mở drawer với đoạn bôi đen mới
  let qaHighlightAtOpen = '';

  function addQaMessage(role, text, { loading = false } = {}) {
    const row = document.createElement('div');
    row.className = `qa-msg-row qa-msg-${role}`;
    const avatar = document.createElement('div');
    avatar.className = 'qa-msg-avatar';
    avatar.textContent = role === 'user' ? '🙋' : '🤖';
    const bubble = document.createElement('div');
    bubble.className = `qa-msg-bubble${loading ? ' qa-msg-loading' : ''}`;
    bubble.textContent = text;
    row.appendChild(avatar);
    row.appendChild(bubble);
    liveQaMessages.appendChild(row);
    liveQaMessages.scrollTop = liveQaMessages.scrollHeight;
    return bubble;
  }

  liveBtnQa.addEventListener('click', (e) => {
    e.stopPropagation();
    hideLiveActionBar();
    liveStep3Drawer.classList.add('open');
    liveStep4Modal.classList.remove('open');
    liveQaInput.value = '';
    liveQaHighlightText.textContent = currentHighlightText;
    liveQaDrawerSubtitle.textContent = `Giải thích theo ngữ cảnh Trang ${currentHighlightPageNo}`;
    // Đoạn bôi đen mới -> bắt đầu hội thoại mới, không mang ngữ cảnh cũ sang
    if (currentHighlightText !== qaHighlightAtOpen) {
      qaHighlightAtOpen = currentHighlightText;
      qaHistory = [];
      liveQaMessages.innerHTML = '';
    }
  });

  closeStep3Drawer.addEventListener('click', () => {
    liveStep3Drawer.classList.remove('open');
  });

  // Bước 3: gửi câu hỏi -> lưu vào Database (thật) + gọi AI Explain thật (nhiều lượt)
  liveQaSend.addEventListener('click', async () => {
    const question = liveQaInput.value.trim();
    if (!question) {
      showToast('⚠️ Nhập câu hỏi trước khi gửi.');
      return;
    }
    if (!currentHighlightText) {
      showToast('⚠️ Chưa bôi đen đoạn nào trên slide.');
      return;
    }
    liveQaSend.disabled = true;
    liveQaInput.value = '';
    addQaMessage('user', question);
    const loadingBubble = addQaMessage('ai', 'Đang trả lời...', { loading: true });

    await saveActivity({
      type: 'question',
      slide: currentHighlightPageNo,
      highlight: currentHighlightText,
      question,
    });
    loadActivities();

    try {
      const result = await apiPost('/explain', {
        highlight: currentHighlightText,
        question,
        lesson: lessonName,
        history: qaHistory,
      });
      loadingBubble.textContent = result.answer;
      loadingBubble.classList.remove('qa-msg-loading');
      qaHistory.push({ question, answer: result.answer });
      if (result.used_fallback) {
        showToast('⚠️ AI không phản hồi, đang hiện thông báo tạm thời.');
        pushNotification({
          category: 'system',
          title: 'Dữ liệu dự phòng',
          message: 'AI không phản hồi, đang hiển thị câu trả lời dự phòng cục bộ.'
        });
      } else if (result.status === 'out_of_scope') {
        showToast('🤖 Câu hỏi không liên quan đoạn đã bôi đen.');
        pushNotification({
          category: 'ai',
          title: 'AI không đủ căn cứ',
          message: 'Câu hỏi không nằm trong phạm vi nội dung đoạn slide đã bôi đen.'
        });
      } else if (result.status === 'insufficient_context') {
        showToast('🤖 Đoạn bôi đen chưa đủ ngữ cảnh để trả lời.');
        pushNotification({
          category: 'ai',
          title: 'AI không đủ căn cứ',
          message: 'Đoạn slide đã chọn chưa đủ ngữ cảnh để AI đưa ra câu trả lời chính xác.'
        });
      }
    } catch (err) {
      console.warn('Gọi /explain thất bại', err);
      loadingBubble.textContent = 'Không kết nối được backend AI. Kiểm tra server rồi thử lại.';
      loadingBubble.classList.remove('qa-msg-loading');
    } finally {
      liveQaSend.disabled = false;
    }
  });

  // LIVE STEP 2 -> STEP 4: Click Ghi chú
  const liveNoteQuote = document.getElementById('live-note-quote');

  liveBtnNote.addEventListener('click', (e) => {
    e.stopPropagation();
    hideLiveActionBar();
    liveNoteQuote.textContent = currentHighlightText;
    liveStep4Modal.classList.add('open');
    liveStep3Drawer.classList.remove('open');
    showToast('📝 Ghi chú (Bước 4): Chọn 1 trong 2 cách lưu!');
  });

  closeStep4Modal.addEventListener('click', () => {
    liveStep4Modal.classList.remove('open');
  });

  // Step 4 Modal: 2 Save Choices Selection
  const cardSaveLink = document.getElementById('card-save-link');
  const cardSaveStudy = document.getElementById('card-save-study');

  cardSaveLink.addEventListener('click', () => {
    cardSaveLink.classList.add('active');
    cardSaveStudy.classList.remove('active');
  });

  cardSaveStudy.addEventListener('click', () => {
    cardSaveStudy.classList.add('active');
    cardSaveLink.classList.remove('active');
  });

  // Ghi chú: đếm ký tự trực tiếp (textarea giờ để trống, không gán cứng)
  const liveNoteTextarea = document.getElementById('live-note-textarea');
  const liveNoteCharIndicator = document.getElementById('live-note-char-indicator');
  liveNoteTextarea.addEventListener('input', () => {
    liveNoteCharIndicator.textContent = `${liveNoteTextarea.value.length}/500 ký tự`;
  });

  // Step 4 Modal Rating Stars
  const liveStarGroup = document.getElementById('live-star-group');
  const liveStarCaption = document.getElementById('live-star-caption');
  let currentLiveRating = 2;

  liveStarGroup.querySelectorAll('.star-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const val = parseInt(btn.getAttribute('data-val'));
      currentLiveRating = val;
      liveStarGroup.querySelectorAll('.star-btn').forEach(b => {
        b.classList.toggle('active', parseInt(b.getAttribute('data-val')) === val);
      });
      liveStarCaption.querySelector('.curr-val-label').textContent = ratingLabels[val];
      document.getElementById('btn-do-save-study').textContent = `💾 Lưu và đánh giá mức độ ${val}/5`;
    });
  });

  // Step 4 Live Save Buttons -> lưu vào Database (thật) -> Nhật ký (Bước 5) đọc lại từ API
  const btnDoSaveLink = document.getElementById('btn-do-save-link');
  const btnDoSaveStudy = document.getElementById('btn-do-save-study');

  btnDoSaveLink.addEventListener('click', async (e) => {
    e.stopPropagation();
    liveStep4Modal.classList.remove('open');
    const ok = await saveActivity({
      type: 'progress',
      slide: currentHighlightPageNo,
      highlight: currentHighlightText,
    });
    if (ok) {
      window.getSelection().removeAllRanges();
      loadActivities();
      showToast(`📍 Đã lưu tiến độ: học đến Trang ${currentHighlightPageNo}. Hỏi chatbot ở Giai đoạn 2 để quay lại đây.`);
      pushNotification({
        category: 'learning',
        title: 'Đã lưu tiến độ học tập',
        message: `Đã đánh dấu tiến độ học đến Trang ${currentHighlightPageNo}.`
      });
    } else {
      showToast('⚠️ Chưa lưu được tiến độ (backend không phản hồi hoặc DB chưa cập nhật).');
    }
  });

  btnDoSaveStudy.addEventListener('click', async (e) => {
    e.stopPropagation();
    liveStep4Modal.classList.remove('open');
    const noteContent = liveNoteTextarea.value.trim();
    await saveActivity({
      type: 'note',
      slide: currentHighlightPageNo,
      highlight: currentHighlightText,
      note: noteContent,
      rating: currentLiveRating,
    });
    window.getSelection().removeAllRanges();
    loadActivities();
    showToast(`💾 Đã lưu ghi chú & đánh giá ${currentLiveRating}/5 vào Learning Activity Database!`);
    pushNotification({
      category: 'learning',
      title: 'Đã lưu ghi chú',
      message: `Đã lưu ghi chú Trang ${currentHighlightPageNo} với mức hiểu ${currentLiveRating}/5 vào Nhật ký học tập.`
    });
  });

  // ---- Nhật ký buổi học (Bước 5): đọc từ backend, fallback data giả nếu offline ----
  const liveActivityStream = document.getElementById('live-activity-stream');

  let currentActivitiesList = [];
  let pendingDeleteActivityItem = null;
  let pendingDeleteConvId = null;

  // DOM Elements cho Modal Xóa Ghi Chú & Màn hình thông báo kết quả
  const modalDeleteNote = document.getElementById('modal-delete-note');
  const deleteNoteConfirmView = document.getElementById('delete-note-confirm-view');
  const deleteNoteSuccessView = document.getElementById('delete-note-success-view');
  const closeDeleteNoteModalBtn = document.getElementById('close-delete-note-modal');
  const closeDeleteSuccessModalBtn = document.getElementById('close-delete-success-modal');
  const btnCancelDeleteNote = document.getElementById('btn-cancel-delete-note');
  const btnConfirmDeleteNote = document.getElementById('btn-confirm-delete-note');
  const btnCloseDeleteSuccess = document.getElementById('btn-close-delete-success');
  const deleteSuccessSummaryBox = document.getElementById('delete-success-summary-box');
  let deleteSuccessTimer = null;

  // DOM Elements cho Modal Xóa Cuộc Trò Chuyện
  const modalDeleteConv = document.getElementById('modal-delete-conv');
  const closeDeleteConvModalBtn = document.getElementById('close-delete-conv-modal');
  const btnCancelDeleteConv = document.getElementById('btn-cancel-delete-conv');
  const btnConfirmDeleteConv = document.getElementById('btn-confirm-delete-conv');
  const deleteConvName = document.getElementById('delete-conv-name');

  const activityTypeMeta = {
    question: { tag: 'tag-blue', icon: '🤖', label: 'Hỏi đáp', className: 'stream-qa' },
    bookmark: { tag: 'tag-purple', icon: '🔗', label: 'Ghi chú (link slide)', className: 'stream-link' },
    note: { tag: 'tag-amber', icon: '📊', label: null, className: 'stream-eval' }, // label built dynamically (rating)
    progress: { tag: 'tag-green', icon: '📍', label: 'Đã học đến', className: 'stream-progress' },
  };

  function activityMessage(item) {
    if (item.type === 'question') return `"${item.question}"`;
    if (item.type === 'bookmark') return `Slide ${item.slide} - ${item.highlight || ''}`.trim();
    if (item.type === 'note') return item.note ? `"${item.note}"` : '(không có ghi chú)';
    if (item.type === 'progress') {
      return item.highlight ? `Trang ${item.slide} — "${item.highlight}"` : `Trang ${item.slide}`;
    }
    return '';
  }

  function renderActivityLog(items) {
    currentActivitiesList = Array.isArray(items) ? items : [];
    liveActivityStream.innerHTML = '';
    if (!currentActivitiesList || currentActivitiesList.length === 0) {
      const emptyWrap = document.createElement('div');
      emptyWrap.className = 'review-empty-wrap text-center';
      const empty = document.createElement('p');
      empty.className = 'review-empty-state';
      empty.textContent = 'Chưa có ghi chú nào trong buổi học này.';
      const btnSeed = document.createElement('button');
      btnSeed.type = 'button';
      btnSeed.className = 'btn-create-sample-note';
      btnSeed.textContent = '➕ Nạp ghi chú mẫu để thử nghiệm xóa';
      btnSeed.addEventListener('click', () => {
        renderActivityLog(FALLBACK_ACTIVITIES);
        setSavedHighlights(FALLBACK_ACTIVITIES);
        showToast('📝 Đã nạp 3 ghi chú mẫu vào Nhật ký buổi học!');
      });
      emptyWrap.appendChild(empty);
      emptyWrap.appendChild(btnSeed);
      liveActivityStream.appendChild(emptyWrap);
      return;
    }
    currentActivitiesList.forEach(item => {
      const meta = activityTypeMeta[item.type] || activityTypeMeta.question;
      const card = document.createElement('div');
      card.className = `stream-card ${meta.className}`;
      if (item.id) card.dataset.activityId = item.id;

      const timeEl = document.createElement('div');
      timeEl.className = 'stream-time';
      timeEl.textContent = item.time_label || (item.created_at ? new Date(item.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '');

      const body = document.createElement('div');
      body.className = 'stream-body';

      const tag = document.createElement('span');
      tag.className = `stream-tag ${meta.tag}`;
      tag.textContent = item.type === 'note'
        ? `${meta.icon} Ghi chú (đánh giá ${item.rating}/5)`
        : `${meta.icon} ${meta.label}`;

      const msg = document.createElement('p');
      msg.className = 'stream-msg';
      msg.textContent = activityMessage(item);

      body.appendChild(tag);
      body.appendChild(msg);
      card.appendChild(timeEl);
      card.appendChild(body);

      // Nút Xóa ghi chú / hoạt động
      const btnDel = document.createElement('button');
      btnDel.className = 'btn-delete-stream-item';
      btnDel.title = item.type === 'note' ? 'Xóa ghi chú này' : 'Xóa hoạt động này';
      btnDel.setAttribute('aria-label', `Xóa: ${activityMessage(item).slice(0, 30)}`);
      btnDel.textContent = '🗑️';
      btnDel.addEventListener('click', (e) => {
        e.stopPropagation();
        openDeleteNoteModal(item);
      });
      card.appendChild(btnDel);

      liveActivityStream.appendChild(card); // backend trả mới nhất trước -> mới nhất ở trên cùng
    });
    liveActivityStream.scrollTop = 0;
  }

  function openDeleteNoteModal(item) {
    if (!item) return;
    if (deleteSuccessTimer) {
      clearTimeout(deleteSuccessTimer);
      deleteSuccessTimer = null;
    }
    pendingDeleteActivityItem = item;
    const meta = activityTypeMeta[item.type] || activityTypeMeta.note;

    // Luôn reset về màn hình xác nhận trước
    if (deleteNoteConfirmView) deleteNoteConfirmView.style.display = 'block';
    if (deleteNoteSuccessView) deleteNoteSuccessView.style.display = 'none';

    const tagEl = document.getElementById('delete-note-tag');
    const pageEl = document.getElementById('delete-note-page');
    const quoteEl = document.getElementById('delete-note-quote');
    const textEl = document.getElementById('delete-note-text');

    if (tagEl) {
      tagEl.className = `preview-tag ${meta.tag}`;
      tagEl.textContent = item.type === 'note'
        ? `${meta.icon} Ghi chú (đánh giá ${item.rating || 2}/5)`
        : `${meta.icon} ${meta.label || 'Hoạt động'}`;
    }
    if (pageEl) {
      pageEl.textContent = item.slide ? `Trang ${item.slide}` : '';
    }
    if (quoteEl) {
      if (item.highlight) {
        quoteEl.textContent = `“${item.highlight}”`;
        quoteEl.style.display = 'block';
      } else {
        quoteEl.style.display = 'none';
      }
    }
    if (textEl) {
      const msg = activityMessage(item);
      textEl.textContent = msg || '(Không có nội dung chi tiết)';
    }

    if (modalDeleteNote) {
      modalDeleteNote.classList.add('open');
      if (btnCancelDeleteNote) setTimeout(() => btnCancelDeleteNote.focus(), 80);
    }
  }

  function closeDeleteNoteModal() {
    if (deleteSuccessTimer) {
      clearTimeout(deleteSuccessTimer);
      deleteSuccessTimer = null;
    }
    pendingDeleteActivityItem = null;
    if (modalDeleteNote) modalDeleteNote.classList.remove('open');
  }

  async function confirmDeleteNote() {
    if (!pendingDeleteActivityItem) return;
    const item = pendingDeleteActivityItem;

    if (item.id && !String(item.id).startsWith('demo-')) {
      try {
        await apiDelete(`/activities/${item.id}`);
      } catch (err) {
        console.warn('Lỗi gọi API xóa activity, fallback lọc local:', err);
      }
    }

    currentActivitiesList = currentActivitiesList.filter(
      (x) => x !== item && (!item.id || x.id !== item.id)
    );
    renderActivityLog(currentActivitiesList);
    setSavedHighlights(currentActivitiesList);

    // Đánh dấu đã tương tác hoạt động để lưu trạng thái
    if (lessonId) {
      try { localStorage.setItem(`vlearn_act_touched_${lessonId}`, 'true'); } catch (e) {}
    }

    // 1. Thêm thông báo chính thức vào Trung tâm thông báo (Màn hình thông báo)
    pushNotification({
      category: 'learning',
      title: 'Đã xóa ghi chú',
      message: `Đã xóa ghi chú${item.slide ? ` Trang ${item.slide}` : ''}: "${(item.note || item.highlight || '').slice(0, 45)}" khỏi Nhật ký học tập.`
    });

    // 2. Hiện Toast thông báo góc dưới
    showToast('🗑️ Đã xóa ghi chú khỏi Nhật ký buổi học!');

    // 3. Chuyển sang Màn hình thông báo kết quả xóa (Success Notification Screen) ngay trong Modal
    if (deleteNoteConfirmView && deleteNoteSuccessView) {
      deleteNoteConfirmView.style.display = 'none';
      deleteNoteSuccessView.style.display = 'block';

      if (deleteSuccessSummaryBox) {
        deleteSuccessSummaryBox.innerHTML = `
          <div><strong>Loại:</strong> ${item.type === 'note' ? '📊 Ghi chú cá nhân' : '📍 Hoạt động buổi học'}</div>
          ${item.slide ? `<div><strong>Vị trí:</strong> Trang slide ${item.slide}</div>` : ''}
          ${item.highlight ? `<div><strong>Đoạn trích:</strong> “${item.highlight.slice(0, 70)}${item.highlight.length > 70 ? '...' : ''}”</div>` : ''}
          ${item.note ? `<div><strong>Nội dung:</strong> "${item.note}"</div>` : ''}
          <div style="color: #059669; font-weight: 600; margin-top: 6px;">✓ Đã gỡ khỏi lộ trình ôn tập AI và cập nhật Trung tâm thông báo</div>
        `;
      }

      if (btnCloseDeleteSuccess) {
        setTimeout(() => btnCloseDeleteSuccess.focus(), 60);
      }

      // Tự động đóng modal sau 4 giây nếu người dùng không bấm
      if (deleteSuccessTimer) clearTimeout(deleteSuccessTimer);
      deleteSuccessTimer = setTimeout(() => {
        closeDeleteNoteModal();
      }, 4000);
    } else {
      closeDeleteNoteModal();
    }
  }

  if (closeDeleteNoteModalBtn) closeDeleteNoteModalBtn.addEventListener('click', closeDeleteNoteModal);
  if (closeDeleteSuccessModalBtn) closeDeleteSuccessModalBtn.addEventListener('click', closeDeleteNoteModal);
  if (btnCancelDeleteNote) btnCancelDeleteNote.addEventListener('click', closeDeleteNoteModal);
  if (btnConfirmDeleteNote) btnConfirmDeleteNote.addEventListener('click', confirmDeleteNote);
  if (btnCloseDeleteSuccess) btnCloseDeleteSuccess.addEventListener('click', closeDeleteNoteModal);
  if (modalDeleteNote) {
    modalDeleteNote.addEventListener('click', (e) => {
      if (e.target === modalDeleteNote) closeDeleteNoteModal();
    });
  }

  async function loadActivities() {
    if (!lessonId) {
      renderActivityLog(FALLBACK_ACTIVITIES);
      setSavedHighlights(FALLBACK_ACTIVITIES);
      return;
    }
    try {
      const requestedLessonId = lessonId;
      const items = await apiGet(`/sessions/${SESSION_ID}/activities?lesson_id=${encodeURIComponent(lessonId)}`);
      if (requestedLessonId !== lessonId) return; // đã đổi bộ slide trong lúc chờ
      if (items && items.length > 0) {
        renderActivityLog(items);
        setSavedHighlights(items);
      } else {
        const touched = localStorage.getItem(`vlearn_act_touched_${lessonId}`);
        if (!touched) {
          renderActivityLog(FALLBACK_ACTIVITIES);
          setSavedHighlights(FALLBACK_ACTIVITIES);
        } else {
          renderActivityLog([]);
          setSavedHighlights([]);
        }
      }
    } catch (err) {
      console.warn('loadActivities: dùng data giả vì backend không phản hồi.', err);
      renderActivityLog(FALLBACK_ACTIVITIES);
      setSavedHighlights(FALLBACK_ACTIVITIES);
    }
  }

  // =========================================================================
  // 3b. GIAI ĐOẠN 2 — 1 KHUNG CHAT: hỏi ôn gì (B6) -> danh sách ôn (B7, AI thật)
  //     -> dạy lại cho AI (B8-9, Feynman AI thật) -> tổng kết + lưu mức hiểu (B10)
  // =========================================================================
  const groupMeta = {
    high: { color: 'red', label: 'Ưu tiên cao' },
    medium: { color: 'yellow', label: 'Cần xem lại' },
    low: { color: 'green', label: 'Ôn nhẹ' },
  };
  const feedbackTypeMeta = {
    deeper_question: '🎯 Hỏi sâu hơn',
    real_scenario: '📊 Tình huống thực tế',
    point_out_gap: '⚠️ Chỉ ra chỗ thiếu/sai',
    hint: '💡 Gợi ý khi bí',
  };

  const chatSidebar = document.getElementById('chat-sidebar');
  const chatSidebarBackdrop = document.getElementById('chat-sidebar-backdrop');
  const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
  const btnCloseSidebar = document.getElementById('btn-close-sidebar');
  const btnNewChat = document.getElementById('btn-new-chat');
  const sidebarConvList = document.getElementById('sidebar-conv-list');
  const p2ActiveChatTitle = document.getElementById('p2-active-chat-title');
  const btnRenameChat = document.getElementById('btn-rename-chat');

  const p2Messages = document.getElementById('p2-messages');
  const p2Input = document.getElementById('p2-input');
  const p2Send = document.getElementById('p2-send');
  const p2QuickActions = document.getElementById('p2-quick-actions');
  const p2ChatStatus = document.getElementById('p2-chat-status');
  const p2ModeTag = document.getElementById('p2-mode-tag');

  let p2Mode = 'review'; // 'review' | 'feynman'
  let p2Busy = false;
  let selectedConcept = null;
  let feynmanHistory = []; // [{role: 'teacher' | 'student', content}]

  // Lộ trình 8 bước (plan.md). Chạy song song với phiên Feynman cũ, bật/tắt bằng công tắc.
  const v3Toggle = document.getElementById('v3-toggle');
  const ksPanel = document.getElementById('ks-panel');
  const ksList = document.getElementById('ks-list');
  const ksNextQ = document.getElementById('ks-next-q');
  let useV3 = v3Toggle ? v3Toggle.checked : true;
  let v3State = {}; // {knowledge, probes, streak}

  const ksMeta = {
    understood: { icon: '✓', label: 'hiểu', cls: 'ks-ok' },
    unclear: { icon: '⏳', label: 'chưa rõ', cls: 'ks-mid' },
    misconception: { icon: '✗', label: 'đang nhầm', cls: 'ks-bad' },
  };
  const verdictMeta = {
    correct: { label: 'Khớp slide', cls: 'ev-ok' },
    incomplete: { label: 'Đúng nhưng thiếu', cls: 'ev-mid' },
    wrong: { label: 'Lệch với slide', cls: 'ev-bad' },
    insufficient_evidence: { label: 'Không đủ bằng chứng', cls: 'ev-none' },
  };
  const nextQMeta = {
    clarification: 'làm rõ',
    why: 'hỏi vì sao',
    challenge: 'thử thách',
    transfer: 'chuyển giao',
  };

  // =========================================================================
  // MODEL VÀ QUẢN LÝ ĐA HỘI THOẠI (CONVERSATIONS MANAGEMENT)
  // =========================================================================
  let conversations = [];
  let activeConversationId = null;

  function getConvStorageKey() {
    return `vlearn_conversations_${lessonId || 'default'}`;
  }

  function getActiveConversation() {
    if (!activeConversationId && conversations.length > 0) {
      activeConversationId = conversations[0].id;
    }
    return conversations.find((c) => c.id === activeConversationId) || null;
  }

  function createNewConversationData(title = 'Cuộc trò chuyện mới', initialGreeting = true) {
    const id = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const msgs = [];
    if (initialGreeting) {
      msgs.push({
        id: `msg_${Date.now()}`,
        role: 'ai',
        text: 'Chào bạn! Hỏi mình về quá trình học nhé, ví dụ "Hôm nay tôi cần ôn gì?", "Tôi đã học đến đâu?", "Tôi đã ghi chú gì về latent space?" — mình sẽ trả lời kèm link tới đúng trang slide.',
        timestamp: Date.now(),
      });
    }
    return {
      id,
      title,
      concept: null,
      mode: 'review',
      lessonId: lessonId || '',
      sessionId: SESSION_ID,
      updatedAt: Date.now(),
      messages: msgs,
      p2ChatHistory: [],
      feynmanHistory: [],
      v3State: {},
    };
  }

  function saveConversations() {
    const active = getActiveConversation();
    if (active) {
      active.mode = p2Mode;
      active.concept = selectedConcept;
      active.feynmanHistory = feynmanHistory || [];
      active.v3State = v3State || {};
      active.p2ChatHistory = p2ChatHistory || [];
      active.updatedAt = Date.now();
    }
    try {
      localStorage.setItem(getConvStorageKey(), JSON.stringify(conversations));
    } catch (err) {
      console.warn('Lỗi khi lưu hội thoại vào localStorage:', err);
    }
  }

  function loadConversations() {
    try {
      const raw = localStorage.getItem(getConvStorageKey());
      if (raw) {
        conversations = JSON.parse(raw);
        if (!Array.isArray(conversations)) conversations = [];
      } else {
        conversations = [];
      }
    } catch (e) {
      conversations = [];
    }

    if (conversations.length === 0) {
      const def = createNewConversationData('Cuộc trò chuyện mới', true);
      conversations.push(def);
      activeConversationId = def.id;
      saveConversations();
    } else {
      if (!activeConversationId || !conversations.some((c) => c.id === activeConversationId)) {
        conversations.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        activeConversationId = conversations[0].id;
      }
    }
    renderSidebarConversations();
    loadActiveConversationToUI();
  }

  function autoNameConversationIfNeeded(conceptOrText) {
    const active = getActiveConversation();
    if (!active) return;
    if (!active.title || active.title === 'Cuộc trò chuyện mới' || active.title === 'Ôn tập & Dạy lại cho AI') {
      let clean = String(conceptOrText).trim().replace(/^[^\w\s\u00C0-\u1EF9]+/, '').trim();
      if (clean.length > 26) clean = clean.substring(0, 24) + '...';
      if (clean) {
        active.title = clean;
        if (p2ActiveChatTitle) p2ActiveChatTitle.textContent = clean;
        saveConversations();
        renderSidebarConversations();
      }
    }
  }

  function renderSidebarConversations() {
    if (!sidebarConvList) return;
    sidebarConvList.innerHTML = '';
    conversations.forEach((c) => {
      const item = document.createElement('div');
      item.className = `conv-item${c.id === activeConversationId ? ' active' : ''}`;
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      item.setAttribute('aria-label', `Cuộc trò chuyện: ${c.title || 'Cuộc trò chuyện mới'}`);

      const left = document.createElement('div');
      left.className = 'conv-item-left';

      const icon = document.createElement('span');
      icon.className = 'conv-item-icon';
      icon.textContent = c.mode === 'feynman' ? '👨‍🏫' : '💬';

      const info = document.createElement('div');
      info.className = 'conv-item-info';

      const title = document.createElement('span');
      title.className = 'conv-item-title';
      title.textContent = c.title || 'Cuộc trò chuyện mới';

      const meta = document.createElement('div');
      meta.className = 'conv-item-meta';

      if (c.concept) {
        const tag = document.createElement('span');
        tag.className = 'conv-tag-concept';
        tag.textContent = c.concept;
        meta.appendChild(tag);
      }

      const time = document.createElement('span');
      time.className = 'conv-time';
      const d = new Date(c.updatedAt || Date.now());
      time.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      meta.appendChild(time);

      info.append(title, meta);
      left.append(icon, info);

      const actions = document.createElement('div');
      actions.className = 'conv-item-actions';

      const btnRename = document.createElement('button');
      btnRename.className = 'btn-conv-action btn-conv-rename';
      btnRename.title = 'Đổi tên cuộc trò chuyện';
      btnRename.textContent = '✏️';
      btnRename.setAttribute('aria-label', 'Đổi tên');
      btnRename.addEventListener('click', (e) => {
        e.stopPropagation();
        promptRenameConversation(c.id);
      });

      const btnDel = document.createElement('button');
      btnDel.className = 'btn-conv-action btn-conv-delete';
      btnDel.title = 'Xóa cuộc trò chuyện';
      btnDel.textContent = '🗑️';
      btnDel.setAttribute('aria-label', 'Xóa');
      btnDel.addEventListener('click', (e) => {
        e.stopPropagation();
        openDeleteConvModal(c.id);
      });

      actions.append(btnRename, btnDel);
      item.append(left, actions);

      item.addEventListener('click', () => selectConversation(c.id));
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectConversation(c.id);
        }
      });

      sidebarConvList.appendChild(item);
    });
  }

  function promptRenameConversation(convId) {
    const c = conversations.find((x) => x.id === convId);
    if (!c) return;
    const current = c.title || '';
    const newTitle = window.prompt('Nhập tên mới cho cuộc trò chuyện:', current);
    if (newTitle !== null && newTitle.trim() && newTitle.trim() !== current) {
      c.title = newTitle.trim();
      if (convId === activeConversationId && p2ActiveChatTitle) {
        p2ActiveChatTitle.textContent = c.title;
      }
      saveConversations();
      renderSidebarConversations();
    }
  }

  function openDeleteConvModal(convId) {
    const c = conversations.find((x) => x.id === convId);
    if (!c) return;
    pendingDeleteConvId = convId;
    if (deleteConvName) deleteConvName.textContent = c.title || 'Cuộc trò chuyện';
    if (modalDeleteConv) {
      modalDeleteConv.classList.add('open');
      if (btnCancelDeleteConv) setTimeout(() => btnCancelDeleteConv.focus(), 80);
    }
  }

  function closeDeleteConvModal() {
    pendingDeleteConvId = null;
    if (modalDeleteConv) modalDeleteConv.classList.remove('open');
  }

  function confirmDeleteConv() {
    if (!pendingDeleteConvId) return;
    const convId = pendingDeleteConvId;
    closeDeleteConvModal();

    const idx = conversations.findIndex((x) => x.id === convId);
    if (idx === -1) return;
    const deletedTitle = conversations[idx].title || 'Cuộc trò chuyện';
    conversations.splice(idx, 1);
    if (conversations.length === 0) {
      const newConv = createNewConversationData('Cuộc trò chuyện mới', true);
      conversations.push(newConv);
      activeConversationId = newConv.id;
    } else if (activeConversationId === convId) {
      activeConversationId = conversations[0].id;
    }
    saveConversations();
    renderSidebarConversations();
    loadActiveConversationToUI();

    pushNotification({
      category: 'ai',
      title: 'Đã xóa cuộc trò chuyện',
      message: `Đã xóa cuộc trò chuyện "${deletedTitle}" khỏi danh sách ôn tập.`
    });

    showToast(`🗑️ Đã xóa "${deletedTitle}"`);
  }

  if (closeDeleteConvModalBtn) closeDeleteConvModalBtn.addEventListener('click', closeDeleteConvModal);
  if (btnCancelDeleteConv) btnCancelDeleteConv.addEventListener('click', closeDeleteConvModal);
  if (btnConfirmDeleteConv) btnConfirmDeleteConv.addEventListener('click', confirmDeleteConv);
  if (modalDeleteConv) {
    modalDeleteConv.addEventListener('click', (e) => {
      if (e.target === modalDeleteConv) closeDeleteConvModal();
    });
  }

  function selectConversation(convId) {
    if (activeConversationId === convId) {
      toggleSidebar(false);
      return;
    }
    saveConversations();
    activeConversationId = convId;
    renderSidebarConversations();
    loadActiveConversationToUI();
    toggleSidebar(false);
    if (p2Input) p2Input.focus();
  }

  function createNewConversation() {
    saveConversations();
    const newConv = createNewConversationData('Cuộc trò chuyện mới', true);
    conversations.unshift(newConv);
    activeConversationId = newConv.id;
    saveConversations();
    renderSidebarConversations();
    loadActiveConversationToUI();
    toggleSidebar(false);
    if (p2Input) p2Input.focus();
  }

  function loadActiveConversationToUI() {
    const active = getActiveConversation();
    if (!active) return;
    selectedConcept = active.concept || null;
    feynmanHistory = active.feynmanHistory || [];
    v3State = active.v3State || {};
    p2ChatHistory = active.p2ChatHistory || [];
    setMode(active.mode || 'review');
    if (p2ActiveChatTitle) {
      p2ActiveChatTitle.textContent = active.title || 'Cuộc trò chuyện mới';
    }
    renderKnowledgeState(null);
    renderMessagesFromActiveConv();
    renderQuickActions();
  }

  function renderMessagesFromActiveConv() {
    p2Messages.innerHTML = '';
    const active = getActiveConversation();
    if (!active || !active.messages || active.messages.length === 0) {
      renderChatEmptyState();
      return;
    }
    active.messages.forEach((msg) => {
      renderStoredMessage(msg);
    });
    scrollChatToBottom();
  }

  function renderChatEmptyState() {
    p2Messages.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'chat-empty-state';

    const icon = document.createElement('div');
    icon.className = 'empty-icon';
    icon.textContent = '🌙';

    const title = document.createElement('div');
    title.className = 'empty-title';
    title.textContent = 'Bắt đầu phiên ôn tập cùng AI';

    const desc = document.createElement('div');
    desc.className = 'empty-desc';
    desc.textContent = 'Hỏi AI về tiến độ học tập, nhờ xếp danh sách các khái niệm cần củng cố, hoặc chọn khái niệm để dạy lại cho AI theo phương pháp Feynman.';

    const sugWrap = document.createElement('div');
    sugWrap.className = 'empty-suggestions';

    const suggestions = [
      { icon: '📋', text: 'Hôm nay tôi cần ôn gì?', action: () => requestReviewList('Hôm nay tôi cần ôn gì?') },
      { icon: '📍', text: 'Tôi đã học đến đâu?', action: () => requestChat('Tôi đã học đến đâu?') },
      { icon: '🔗', text: 'Tôi đã lưu những trang nào?', action: () => requestChat('Tôi đã lưu những trang nào?') },
    ];

    suggestions.forEach((sug) => {
      const btn = document.createElement('button');
      btn.className = 'btn-suggestion';
      btn.innerHTML = `<span class="sug-icon">${sug.icon}</span><span>${sug.text}</span>`;
      btn.addEventListener('click', () => {
        if (p2Busy) return;
        sug.action();
      });
      sugWrap.appendChild(btn);
    });

    empty.append(icon, title, desc, sugWrap);
    p2Messages.appendChild(empty);
  }

  function renderStoredMessage(msg) {
    if (msg.role === 'system') {
      const divider = document.createElement('div');
      divider.className = 'p2-system-msg';
      divider.textContent = msg.text;
      p2Messages.appendChild(divider);
      return;
    }

    const isUser = msg.role === 'user';
    const row = document.createElement('div');
    row.className = `msg-row ${isUser ? 'msg-student' : 'msg-teacher'} p2-msg${msg.isError ? ' p2-msg-error' : ''}`;

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.textContent = isUser ? '🙋' : '🤖';

    const content = document.createElement('div');
    content.className = 'msg-content';

    const authorEl = document.createElement('div');
    authorEl.className = 'msg-author';
    authorEl.textContent = msg.author || (isUser ? 'Bạn' : 'AI');
    if (msg.badge) {
      const badgeEl = document.createElement('span');
      badgeEl.className = 'p2-feedback-badge';
      badgeEl.textContent = msg.badge;
      authorEl.appendChild(badgeEl);
    }

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';

    if (msg.cardType === 'review' && msg.cardData) {
      bubble.classList.add('p2-card-bubble');
      bubble.appendChild(buildReviewCard(msg.cardData));
    } else if (msg.cardType === 'summary' && msg.cardData) {
      bubble.classList.add('p2-card-bubble');
      bubble.appendChild(buildSummaryCard(msg.cardData));
    } else if (msg.cardType === 'v3_reply' && msg.cardData) {
      renderV3ReplyContent(bubble, msg.cardData);
    } else if (msg.isError) {
      showChatError(bubble, msg.text, msg.retryPayload, false);
    } else {
      bubble.textContent = msg.text || '';
      if (msg.links && msg.links.length) {
        addSlideLinks(bubble, msg.links);
      }
    }

    content.append(authorEl, bubble);
    row.append(avatar, content);
    p2Messages.appendChild(row);
  }

  function renderV3ReplyContent(bubble, data) {
    if (!data) return;
    if (data.encourage) {
      const enc = document.createElement('div');
      enc.className = 'v3-encourage';
      enc.textContent = data.encourage;
      bubble.appendChild(enc);
    }
    if (data.mirror) {
      const mir = document.createElement('div');
      mir.className = 'v3-mirror';
      mir.textContent = data.mirror;
      bubble.appendChild(mir);
    }
    if (data.reply) {
      const main = document.createElement('div');
      main.className = 'v3-reply';
      main.textContent = data.reply;
      bubble.appendChild(main);
    }
    if (data.evidence) {
      bubble.appendChild(buildEvidenceCard(data.evidence));
    }
    if (data.enforced && data.enforced.length) {
      bubble.appendChild(buildEnforcedBox(data.enforced));
    }
  }

  function scrollChatToBottom() {
    p2Messages.scrollTop = p2Messages.scrollHeight;
  }

  // role: 'user' (bên phải) | 'ai' (bên trái) | 'system' (dải giữa)
  function addChatMessage(role, {
    text = '',
    loading = false,
    badge = '',
    author = '',
    isError = false,
    retryPayload = null,
    cardType = null,
    cardData = null,
    links = null,
    persist = true,
  } = {}) {
    const emptyState = p2Messages.querySelector('.chat-empty-state');
    if (emptyState) emptyState.remove();

    if (role === 'system') {
      const divider = document.createElement('div');
      divider.className = 'p2-system-msg';
      divider.textContent = text;
      p2Messages.appendChild(divider);
      scrollChatToBottom();

      if (persist) {
        const active = getActiveConversation();
        if (active) {
          active.messages = active.messages || [];
          active.messages.push({
            id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
            role: 'system',
            text,
            timestamp: Date.now(),
          });
          saveConversations();
          renderSidebarConversations();
        }
      }
      return divider;
    }

    const isUser = role === 'user';
    const row = document.createElement('div');
    row.className = `msg-row ${isUser ? 'msg-student' : 'msg-teacher'} p2-msg${isError ? ' p2-msg-error' : ''}`;

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.textContent = isUser ? '🙋' : '🤖';

    const content = document.createElement('div');
    content.className = 'msg-content';

    const authorEl = document.createElement('div');
    authorEl.className = 'msg-author';
    authorEl.textContent = author || (isUser ? 'Bạn' : 'AI');
    if (badge) {
      const badgeEl = document.createElement('span');
      badgeEl.className = 'p2-feedback-badge';
      badgeEl.textContent = badge;
      authorEl.appendChild(badgeEl);
    }

    const bubble = document.createElement('div');
    bubble.className = `msg-bubble${loading ? ' msg-loading' : ''}`;

    if (loading) {
      bubble.innerHTML = '<span class="typing-indicator" aria-label="Đang suy nghĩ..."><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></span>';
    } else {
      bubble.textContent = text;
    }

    content.append(authorEl, bubble);
    row.append(avatar, content);
    p2Messages.appendChild(row);
    scrollChatToBottom();

    if (persist && !loading) {
      const active = getActiveConversation();
      if (active) {
        active.messages = active.messages || [];
        active.messages.push({
          id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          role,
          text,
          badge,
          author,
          isError,
          retryPayload,
          cardType,
          cardData,
          links,
          timestamp: Date.now(),
        });
        saveConversations();
        renderSidebarConversations();
      }
    }

    return bubble;
  }

  function showChatError(bubble, errText, retryPayload, persist = true) {
    if (!bubble) return;
    const row = bubble.closest('.msg-row');
    if (row) row.classList.add('p2-msg-error');
    bubble.classList.remove('msg-loading');
    bubble.innerHTML = '';

    const errContent = document.createElement('div');
    errContent.className = 'p2-bubble-error';

    const msgP = document.createElement('div');
    msgP.textContent = `⚠️ ${errText || 'Không kết nối được backend AI. Kiểm tra server rồi thử lại.'}`;

    const btnRetry = document.createElement('button');
    btnRetry.className = 'btn-retry-chat';
    btnRetry.innerHTML = '🔄 Thử lại';
    btnRetry.addEventListener('click', async () => {
      if (p2Busy) return;
      if (row) row.remove();
      const active = getActiveConversation();
      if (active && active.messages) {
        active.messages = active.messages.filter((m) => m.retryPayload !== retryPayload);
        saveConversations();
      }
      if (retryPayload) {
        if (retryPayload.type === 'chat') {
          await requestChat(retryPayload.text, false);
        } else if (retryPayload.type === 'review') {
          await requestReviewList(retryPayload.text, false);
        } else if (retryPayload.type === 'feynman') {
          await askStudent(retryPayload.text);
        } else if (retryPayload.type === 'feynman_summary') {
          await endFeynmanSession();
        }
      }
    });

    errContent.append(msgP, btnRetry);
    bubble.appendChild(errContent);
    scrollChatToBottom();

    if (persist) {
      const active = getActiveConversation();
      if (active) {
        active.messages = active.messages || [];
        active.messages.push({
          id: `msg_${Date.now()}_err`,
          role: 'ai',
          text: errText || 'Không kết nối được backend AI.',
          isError: true,
          retryPayload,
          timestamp: Date.now(),
        });
        saveConversations();
      }
    }
  }

  function setBusy(busy) {
    p2Busy = busy;
    p2Input.disabled = busy;
    p2Send.disabled = busy;
    p2QuickActions.querySelectorAll('button').forEach((b) => { b.disabled = busy; });
  }

  function renderQuickActions() {
    p2QuickActions.innerHTML = '';
    const addChip = (label, onClick) => {
      const chip = document.createElement('button');
      chip.className = 'p2-chip';
      chip.textContent = label;
      chip.disabled = p2Busy;
      chip.addEventListener('click', onClick);
      p2QuickActions.appendChild(chip);
    };
    if (p2Mode === 'feynman') {
      const hasTeaching = feynmanHistory.some((m) => m.role === 'teacher');
      if (hasTeaching) addChip('🏁 Kết thúc phiên & tổng kết', endFeynmanSession);
      addChip('↩️ Thoát, xem lại danh sách ôn', () => {
        exitFeynmanMode();
        requestReviewList('Xem lại danh sách ôn tập');
      });
    } else {
      addChip('📋 Hôm nay tôi cần ôn gì?', () => requestReviewList('Hôm nay tôi cần ôn gì?'));
      addChip('📍 Tôi đã học đến đâu?', () => requestChat('Tôi đã học đến đâu?'));
      addChip('🔗 Tôi đã lưu những trang nào?', () => requestChat('Tôi đã lưu những trang nào?'));
    }
  }

  function setMode(mode) {
    p2Mode = mode;
    const active = getActiveConversation();
    if (active) {
      active.mode = mode;
    }
    if (mode === 'feynman') {
      p2ModeTag.textContent = 'Dạy lại cho AI';
      p2ChatStatus.textContent = `Bạn là "Giáo viên" · Chủ đề: ${selectedConcept || (active && active.concept) || 'Khái niệm ôn tập'}`;
      p2Input.placeholder = 'Giải thích khái niệm bằng lời của bạn... (Enter gửi, Shift+Enter xuống dòng)';
    } else {
      p2ModeTag.textContent = 'Ôn tập';
      p2ChatStatus.textContent = 'Hỏi AI hôm nay cần ôn gì, chọn khái niệm để dạy lại cho AI';
      p2Input.placeholder = 'Hỏi AI: Hôm nay tôi cần ôn gì? (Enter gửi, Shift+Enter xuống dòng)';
    }
    renderQuickActions();
  }

  function exitFeynmanMode() {
    selectedConcept = null;
    feynmanHistory = [];
    v3State = {};
    if (ksPanel) ksPanel.hidden = true;
    const active = getActiveConversation();
    if (active) {
      active.concept = null;
      active.mode = 'review';
      saveConversations();
      renderSidebarConversations();
    }
    setMode('review');
  }

  // ---------- B6-B7: danh sách ôn tập (AI thật) ----------
  function buildReviewCard(data) {
    const card = document.createElement('div');
    card.className = 'p2-card';
    const list = (data && data.review_list) || [];

    const intro = document.createElement('p');
    intro.className = 'p2-card-intro';
    intro.textContent = list.length
      ? `Hôm nay bạn nên ôn ${list.length} khái niệm, xếp theo mức độ ưu tiên:`
      : 'Chưa có ghi chú hay câu hỏi nào cần ôn. Quay lại Giai đoạn 1 để học và bôi đen chỗ chưa hiểu nhé.';
    card.appendChild(intro);

    if (data && data.used_fallback) {
      const notice = document.createElement('p');
      notice.className = 'review-fallback-notice';
      notice.textContent = 'Đang xếp theo mức tự đánh giá (AI không phản hồi lần này).';
      card.appendChild(notice);
    }

    list.forEach((entry, idx) => {
      const meta = groupMeta[entry.final_group] || groupMeta.medium;
      const row = document.createElement('div');
      row.className = `plan-card priority-${meta.color}`;

      const left = document.createElement('div');
      left.className = 'plan-left';
      const badge = document.createElement('span');
      badge.className = 'plan-badge-no';
      badge.textContent = String(entry.order ?? idx + 1);

      const info = document.createElement('div');
      info.className = 'plan-info';
      const title = document.createElement('strong');
      title.textContent = entry.concept;
      const ratingSpan = document.createElement('span');
      ratingSpan.className = 'plan-rating';
      ratingSpan.textContent = 'Xếp theo: ';
      const pill = document.createElement('span');
      pill.className = `rating-pill ${meta.color}`;
      pill.textContent = meta.label;
      ratingSpan.appendChild(pill);
      info.appendChild(title);
      info.appendChild(ratingSpan);

      if (entry.adjusted) {
        const note = document.createElement('div');
        note.className = 'plan-adjusted-note';
        const arrow = groupRank(entry.final_group) > groupRank(entry.base_group) ? '↑' : '↓';
        note.textContent = `🤖 AI điều chỉnh ${arrow}: ${entry.reason || ''}`;
        info.appendChild(note);
      }

      const actions = document.createElement('div');
      actions.className = 'plan-actions';

      (entry.slides || []).slice(0, 3).forEach((slideNo) => {
        const btnSlide = document.createElement('button');
        btnSlide.className = 'btn-goto-slide';
        btnSlide.textContent = `📖 Trang ${slideNo}`;
        btnSlide.title = 'Quay lại slide này ở Giai đoạn 1';
        btnSlide.addEventListener('click', () => goToSlideFromReview(slideNo));
        actions.appendChild(btnSlide);
      });

      if (entry.adjusted) {
        const btnReject = document.createElement('button');
        btnReject.className = 'btn-choice btn-choice-link';
        btnReject.textContent = 'Không đúng';
        btnReject.addEventListener('click', async () => {
          if (p2Busy) return;
          await submitCorrection(entry.concept, 'reject_adjustment');
          addChatMessage('system', { text: `↩️ Đã ghi nhận: giữ nguyên mức tự đánh giá cho "${entry.concept}"` });
        });
        actions.appendChild(btnReject);
      }

      const btnTeach = document.createElement('button');
      btnTeach.className = 'btn-choose-teach';
      btnTeach.textContent = '👨‍🏫 Dạy lại cho AI';
      btnTeach.addEventListener('click', () => {
        if (p2Busy) return;
        startFeynmanSession(entry.concept);
      });
      actions.appendChild(btnTeach);

      info.appendChild(actions);
      left.appendChild(badge);
      left.appendChild(info);
      row.appendChild(left);
      card.appendChild(row);
    });

    const extras = [
      [(data && data.flags) || [], '⚠️ Thiếu thông tin để xếp nhóm', () => 'ghi chú quá ngắn/mơ hồ'],
      [(data && data.excluded) || [], '🚫 Đã loại — ngoài phạm vi bài học', () => 'ngoài phạm vi bài học'],
    ];
    extras.forEach(([items, label, describe]) => {
      if (!items.length) return;
      const details = document.createElement('details');
      details.className = 'review-collapsible';
      const summary = document.createElement('summary');
      summary.textContent = `${label} (${items.length})`;
      const ul = document.createElement('ul');
      items.forEach((it) => {
        const li = document.createElement('li');
        li.textContent = `${it.item_id}: ${describe(it)}`;
        ul.appendChild(li);
      });
      details.appendChild(summary);
      details.appendChild(ul);
      card.appendChild(details);
    });

    return card;
  }

  function addCardMessage(cardEl, { cardType = null, cardData = null } = {}) {
    const bubble = addChatMessage('ai', { isCard: true, cardType, cardData });
    bubble.classList.add('p2-card-bubble');
    bubble.appendChild(cardEl);
    scrollChatToBottom();
    return bubble;
  }

  async function requestReviewList(userText, addToHistory = true) {
    if (p2Busy) return;
    if (userText && addToHistory) {
      addChatMessage('user', { text: userText });
      autoNameConversationIfNeeded(userText);
    }
    setBusy(true);
    pushNotification({
      category: 'ai',
      title: 'AI đang phân tích',
      message: 'Hệ thống đang tổng hợp dữ liệu học tập để lập danh sách ôn tập...',
      showToastNotification: false
    });
    const loading = addChatMessage('ai', { loading: true, persist: false });
    try {
      const data = await apiPost(`/sessions/${SESSION_ID}/review`, { lesson_id: lessonId });
      reviewStale = false;
      loading.closest('.msg-row').remove();
      addCardMessage(buildReviewCard(data), { cardType: 'review', cardData: data });

      const count = (data.items || []).length;
      pushNotification({
        category: 'ai',
        title: 'AI đã hoàn tất',
        message: `Đã hoàn tất phân tích và xếp lịch ${count} nội dung ôn tập.`
      });

      const highItems = (data.items || []).filter(it => it.group === 'high');
      if (highItems.length > 0) {
        pushNotification({
          category: 'learning',
          title: 'Nội dung cần ôn tập',
          message: `Có ${highItems.length} khái niệm ưu tiên cao cần củng cố lại sớm trong danh sách ôn tập!`
        });
      }
    } catch (err) {
      console.warn('Gọi /review thất bại', err);
      showChatError(loading, 'Không kết nối được backend AI (FastAPI) để tải danh sách ôn tập.', {
        type: 'review',
        text: userText || 'Hôm nay tôi cần ôn gì?',
      });
    } finally {
      setBusy(false);
      renderQuickActions();
    }
  }

  function groupRank(g) {
    return { low: 0, medium: 1, high: 2 }[g] ?? 1;
  }

  // Mở slide ở tab mới (giữ nguyên khung chat ôn tập ở tab hiện tại)
  function goToSlideFromReview(slideNo) {
    const url = `${window.location.href.split('#')[0]}#slide=${slideNo}&deck=${lessonId}`;
    window.open(url, '_blank', 'noopener');
  }

  // ---------- B8-B9: dạy lại cho AI (Feynman, AI thật) ----------
  async function requestStudentReply(message) {
    pushNotification({
      category: 'ai',
      title: 'AI đang suy nghĩ',
      message: 'Học viên AI đang lắng nghe và phản hồi bài giảng của bạn...',
      showToastNotification: false
    });
    const bubble = addChatMessage('ai', { loading: true, author: 'AI (Học viên)', persist: false });
    try {
      const result = await apiPost('/feynman/reply', {
        session_id: SESSION_ID,
        lesson_id: lessonId,
        concept: selectedConcept,
        history: feynmanHistory,
        message,
      });
      bubble.closest('.msg-row').remove();
      const label = feedbackTypeMeta[result.feedback_type];
      addChatMessage('ai', {
        text: result.reply,
        author: 'AI (Học viên)',
        badge: label && message ? label : '',
      });

      pushNotification({
        category: 'ai',
        title: 'AI đã phản hồi',
        message: 'Học viên AI đã đưa ra phản hồi mới cho bài giảng của bạn.'
      });

      if (result.used_fallback) {
        pushNotification({
          category: 'system',
          title: 'Dữ liệu dự phòng',
          message: 'Học viên AI đang dùng câu trả lời dự phòng do máy chủ chưa phản hồi.'
        });
        return;
      }
      if (message) feynmanHistory.push({ role: 'teacher', content: message });
      feynmanHistory.push({ role: 'student', content: result.reply });
      saveConversations();
    } catch (err) {
      console.warn('Gọi /feynman/reply thất bại', err);
      showChatError(bubble, 'Không kết nối được backend AI.', {
        type: 'feynman',
        text: message,
      });
    }
  }

  // ---------- Lộ trình 8 bước: render knowledge state + phần đối chiếu slide ----------
  function renderKnowledgeState(nextQuestionType) {
    const knowledge = (v3State && v3State.knowledge) || {};
    const names = Object.keys(knowledge);
    if (!ksPanel) return;
    ksPanel.hidden = !useV3 || names.length === 0;
    if (ksPanel.hidden) return;
    ksList.textContent = '';
    const order = { misconception: 0, unclear: 1, understood: 2 };
    names.sort((a, b) => order[knowledge[a]] - order[knowledge[b]] || a.localeCompare(b));
    for (const name of names) {
      const meta = ksMeta[knowledge[name]];
      if (!meta) continue;
      const row = document.createElement('div');
      row.className = `ks-item ${meta.cls}`;
      const icon = document.createElement('span');
      icon.className = 'ks-icon';
      icon.textContent = meta.icon;
      const text = document.createElement('span');
      text.className = 'ks-name';
      text.textContent = name;
      const tag = document.createElement('span');
      tag.className = 'ks-tag';
      tag.textContent = meta.label;
      row.append(icon, text, tag);
      ksList.appendChild(row);
    }
    if (ksNextQ) {
      ksNextQ.textContent = nextQuestionType
        ? `câu hỏi tiếp theo: ${nextQMeta[nextQuestionType] || nextQuestionType}`
        : '';
    }
  }

  function buildEvidenceCard(evidence) {
    const meta = verdictMeta[evidence.verdict] || verdictMeta.insufficient_evidence;
    const card = document.createElement('div');
    card.className = `ev-card ${meta.cls}`;

    const head = document.createElement('div');
    head.className = 'ev-head';
    const badge = document.createElement('span');
    badge.className = 'ev-badge';
    badge.textContent = `📄 ${meta.label}`;
    head.appendChild(badge);
    card.appendChild(head);

    const addPoints = (items, cls, label) => {
      if (!items || !items.length) return;
      const block = document.createElement('div');
      block.className = `ev-points ${cls}`;
      const title = document.createElement('div');
      title.className = 'ev-points-title';
      title.textContent = label;
      block.appendChild(title);
      const list = document.createElement('ul');
      for (const point of items) {
        const li = document.createElement('li');
        li.textContent = point;
        list.appendChild(li);
      }
      block.appendChild(list);
      card.appendChild(block);
    };
    addPoints(evidence.correct_points, 'ev-points-ok', '✓ Phần đã đúng');
    addPoints(evidence.wrong_points, 'ev-points-bad', '✗ Phần chưa chính xác');
    addPoints(evidence.missing_points, 'ev-points-miss', '○ Ý quan trọng còn thiếu');

    const citations = evidence.citations && evidence.citations.length
      ? evidence.citations
      : (evidence.quote ? [{ slide: evidence.slide, quote: evidence.quote }] : []);
    if (citations.length) {
      const wrap = document.createElement('div');
      wrap.className = 'ev-cites';
      const title = document.createElement('div');
      title.className = 'ev-points-title';
      title.textContent = `📎 Dẫn chứng trong slide (${citations.length})`;
      wrap.appendChild(title);
      for (const cite of citations) {
        const row = document.createElement('div');
        row.className = 'ev-cite';
        if (cite.slide) {
          const link = document.createElement('button');
          link.className = 'ev-slide-link';
          link.textContent = `Trang ${cite.slide}`;
          link.addEventListener('click', () => goToSlideFromReview(cite.slide));
          row.appendChild(link);
        }
        const quote = document.createElement('blockquote');
        quote.className = 'ev-quote';
        quote.textContent = cite.quote;
        row.appendChild(quote);
        wrap.appendChild(row);
      }
      card.appendChild(wrap);
    }

    if (evidence.note) {
      const note = document.createElement('div');
      note.className = 'ev-note';
      note.textContent = evidence.note;
      card.appendChild(note);
    }
    return card;
  }

  function buildEnforcedBox(enforced) {
    const box = document.createElement('details');
    box.className = 'enforced-box';
    const summary = document.createElement('summary');
    summary.textContent = `🔒 Hệ thống đã chỉnh ${enforced.length} chỗ trong câu trả lời của AI`;
    box.appendChild(summary);
    const list = document.createElement('ul');
    for (const line of enforced) {
      const item = document.createElement('li');
      item.textContent = line;
      list.appendChild(item);
    }
    box.appendChild(list);
    return box;
  }

  async function requestStudentReplyV3(message) {
    pushNotification({
      category: 'ai',
      title: 'AI đang suy nghĩ',
      message: 'Học viên AI đang đối chiếu bài giảng với slide...',
      showToastNotification: false
    });
    const bubble = addChatMessage('ai', { loading: true, author: 'AI (Học viên)', persist: false });
    try {
      const result = await apiPost('/feynman/v3/reply', {
        session_id: SESSION_ID,
        lesson_id: lessonId,
        concept: selectedConcept,
        history: feynmanHistory,
        message,
        state: v3State,
      });
      bubble.closest('.msg-row').remove();

      addChatMessage('ai', {
        text: result.reply,
        author: 'AI (Học viên)',
        cardType: 'v3_reply',
        cardData: {
          encourage: result.encourage,
          mirror: result.mirror,
          reply: result.reply,
          evidence: result.evidence,
          enforced: result.enforced,
        },
      });

      pushNotification({
        category: 'ai',
        title: 'AI đã phản hồi',
        message: 'Học viên AI đã đưa ra phản hồi mới cho bài giảng của bạn.'
      });

      if (result.evidence && (result.evidence.verdict === 'insufficient_evidence' || (result.evidence.flags && result.evidence.flags.length > 0))) {
        pushNotification({
          category: 'ai',
          title: 'AI không đủ căn cứ',
          message: 'Bài giảng chứa nội dung chưa có trong slide hoặc slide chưa đủ dữ kiện để AI đối chiếu.'
        });
      }

      if (result.used_fallback) {
        pushNotification({
          category: 'system',
          title: 'Dữ liệu dự phòng',
          message: 'Học viên AI đang dùng câu trả lời dự phòng do máy chủ chưa phản hồi.'
        });
        return;
      }
      v3State = result.state || v3State;
      if (message) feynmanHistory.push({ role: 'teacher', content: message });
      feynmanHistory.push({ role: 'student', content: result.reply });
      saveConversations();
      renderKnowledgeState(result.next_question_type);
      scrollChatToBottom();
    } catch (err) {
      console.warn('Gọi /feynman/v3/reply thất bại', err);
      showChatError(bubble, 'Không kết nối được backend AI.', {
        type: 'feynman',
        text: message,
      });
    }
  }

  function askStudent(message) {
    return useV3 ? requestStudentReplyV3(message) : requestStudentReply(message);
  }

  if (v3Toggle) {
    v3Toggle.addEventListener('change', () => {
      useV3 = v3Toggle.checked;
      v3State = {};
      renderKnowledgeState(null);
      if (p2Mode === 'feynman') {
        addChatMessage('system', {
          text: useV3
            ? '🔄 Đã bật lộ trình 8 bước — phiên bắt đầu lại từ đầu'
            : '🔄 Đã tắt lộ trình 8 bước — quay về phiên dạy lại thường',
        });
        feynmanHistory = [];
        setBusy(true);
        askStudent('').finally(() => setBusy(false));
      }
    });
  }

  async function startFeynmanSession(concept) {
    selectedConcept = concept;
    feynmanHistory = [];
    v3State = {};
    renderKnowledgeState(null);
    setMode('feynman');
    autoNameConversationIfNeeded(concept);
    const active = getActiveConversation();
    if (active) {
      active.concept = concept;
      active.mode = 'feynman';
      saveConversations();
      renderSidebarConversations();
    }
    addChatMessage('system', { text: `👨‍🏫 Bắt đầu dạy lại "${concept}" — bạn là Giáo viên, AI là Học viên` });
    setBusy(true);
    await askStudent('');
    setBusy(false);
    renderQuickActions();
    if (p2Input) p2Input.focus();
  }

  // ---------- B10: tổng kết + lưu mức hiểu ----------
  function buildSummaryCard(result) {
    const card = document.createElement('div');
    card.className = 'p2-card';

    const heading = document.createElement('p');
    heading.className = 'p2-card-intro';
    heading.textContent = `🏆 Tổng kết phiên dạy "${selectedConcept}"`;
    card.appendChild(heading);

    const addGroup = (cls, title, items, emptyText) => {
      const group = document.createElement('div');
      group.className = `mastery-group ${cls}`;
      const t = document.createElement('div');
      t.className = 'group-title';
      const s = document.createElement('strong');
      s.textContent = title;
      t.appendChild(s);
      const ul = document.createElement('ul');
      (items.length ? items : [emptyText]).forEach((txt) => {
        const li = document.createElement('li');
        li.textContent = txt;
        ul.appendChild(li);
      });
      group.appendChild(t);
      group.appendChild(ul);
      card.appendChild(group);
    };
    addGroup('understand-well', '✅ Đã hiểu tốt:', result.understood, '(Chưa có ý nào đủ rõ)');
    addGroup('need-review', '🔄 Cần xem lại thêm:', result.need_review, '(Không có)');

    const reason = document.createElement('p');
    reason.className = 'summary-reason';
    reason.textContent = result.reason;
    card.appendChild(reason);

    const delta = document.createElement('div');
    delta.className = 'p2-rating-row';
    const label = document.createElement('span');
    label.className = 'delta-label';
    label.textContent = `Mức hiểu: ${result.current_rating ? ratingLabels[result.current_rating] : 'Chưa tự chấm'} ➔ mới (AI đề xuất, bạn chỉnh được):`;
    delta.appendChild(label);

    const stars = document.createElement('div');
    stars.className = 'star-group';
    let chosen = result.suggested_rating;
    const paint = () => stars.querySelectorAll('.star-btn').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.val) === chosen);
    });
    for (let v = 1; v <= 5; v++) {
      const b = document.createElement('button');
      b.className = 'star-btn';
      b.dataset.val = String(v);
      b.textContent = String(v);
      b.addEventListener('click', () => { chosen = v; paint(); });
      stars.appendChild(b);
    }
    paint();
    delta.appendChild(stars);
    card.appendChild(delta);

    const btnSave = document.createElement('button');
    btnSave.className = 'btn-return-plan';
    btnSave.textContent = 'Lưu mức hiểu & cập nhật danh sách ôn tập';
    btnSave.addEventListener('click', async () => {
      if (!chosen) {
        showToast('⚠️ Chọn mức hiểu mới (1-5) trước khi lưu.');
        return;
      }
      if (p2Busy || btnSave.disabled) return;
      btnSave.disabled = true;
      stars.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      const concept = selectedConcept;
      await submitCorrection(concept, 're_rate', chosen);
      addChatMessage('system', { text: `✅ Đã lưu "${concept}" ở mức ${ratingLabels[chosen]}` });
      pushNotification({
        category: 'learning',
        title: 'Cập nhật mức hiểu',
        message: `Khái niệm "${concept}" đã được cập nhật sang mức hiểu: ${ratingLabels[chosen]} (${chosen}/5).`
      });
      exitFeynmanMode();
      requestReviewList('');
    });
    card.appendChild(btnSave);
    return card;
  }

  async function endFeynmanSession() {
    if (p2Busy || !selectedConcept) return;
    addChatMessage('user', { text: '🏁 Kết thúc phiên & tổng kết' });
    setBusy(true);
    pushNotification({
      category: 'ai',
      title: 'AI đang tổng kết',
      message: `Hệ thống đang phân tích toàn bộ phiên thảo luận để tổng kết mức hiểu "${selectedConcept}"...`,
      showToastNotification: false
    });
    const loading = addChatMessage('ai', { loading: true, persist: false });
    try {
      const result = await apiPost('/feynman/summary', {
        session_id: SESSION_ID,
        lesson_id: lessonId,
        concept: selectedConcept,
        history: feynmanHistory,
      });
      loading.closest('.msg-row').remove();
      addCardMessage(buildSummaryCard(result), { cardType: 'summary', cardData: result });

      pushNotification({
        category: 'ai',
        title: 'AI đã tổng kết',
        message: `Bản đánh giá tổng kết mức độ hiểu cho khái niệm "${selectedConcept}" đã sẵn sàng.`
      });
    } catch (err) {
      console.warn('Gọi /feynman/summary thất bại', err);
      showChatError(loading, 'Không kết nối được backend AI để tổng kết.', {
        type: 'feynman_summary',
      });
    } finally {
      setBusy(false);
      renderQuickActions();
    }
  }

  // ---------- Ô nhập chung ----------
  async function handleP2Send() {
    const text = p2Input.value.trim();
    if (!text || p2Busy) return;
    p2Input.value = '';
    p2Input.style.height = 'auto';
    if (p2Mode === 'feynman') {
      addChatMessage('user', { text, author: 'Bạn (Giáo viên)' });
      setBusy(true);
      await askStudent(text);
      setBusy(false);
      renderQuickActions();
      if (p2Input) p2Input.focus();
    } else {
      requestChat(text);
    }
  }

  // Hỏi đáp tự do về quá trình học (học đến đâu, đã ghi chú gì...) — AI trả lời kèm link trang
  let p2ChatHistory = []; // [{role: 'user' | 'assistant', content}]

  function addSlideLinks(bubble, links) {
    if (!links || !links.length) return;
    const row = document.createElement('div');
    row.className = 'plan-actions';
    links.forEach((link) => {
      const btn = document.createElement('button');
      btn.className = 'btn-goto-slide';
      btn.textContent = `📖 ${link.label}`;
      btn.title = `Mở Trang ${link.slide} ở tab mới`;
      btn.addEventListener('click', () => goToSlideFromReview(link.slide));
      row.appendChild(btn);
    });
    bubble.appendChild(row);
    scrollChatToBottom();
  }

  async function requestChat(text, addToHistory = true) {
    if (p2Busy) return;
    if (addToHistory) {
      addChatMessage('user', { text });
      autoNameConversationIfNeeded(text);
    }
    setBusy(true);
    const bubble = addChatMessage('ai', { loading: true, persist: false });
    let result = null;
    try {
      result = await apiPost('/chat', {
        session_id: SESSION_ID,
        lesson_id: lessonId,
        message: text,
        history: p2ChatHistory,
      });
    } catch (err) {
      console.warn('Gọi /chat thất bại', err);
      showChatError(bubble, 'Không kết nối được backend AI. Kiểm tra server rồi thử lại.', {
        type: 'chat',
        text,
      });
      setBusy(false);
      renderQuickActions();
      return;
    }

    bubble.closest('.msg-row').remove();
    p2ChatHistory.push({ role: 'user', content: text });

    if (result.intent === 'review_list' && !result.used_fallback) {
      p2ChatHistory.push({ role: 'assistant', content: result.reply });
      setBusy(false);
      requestReviewList('', false);
      return;
    }

    addChatMessage('ai', {
      text: result.reply,
      links: result.links,
    });

    if (!result.used_fallback) p2ChatHistory.push({ role: 'assistant', content: result.reply });
    saveConversations();
    setBusy(false);
    renderQuickActions();
    if (p2Input) p2Input.focus();
  }

  // Controls & Listeners
  if (p2Send) p2Send.addEventListener('click', handleP2Send);
  if (p2Input) {
    p2Input.addEventListener('input', () => {
      p2Input.style.height = 'auto';
      p2Input.style.height = `${Math.min(p2Input.scrollHeight, 130)}px`;
    });
    p2Input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleP2Send();
      }
    });
  }

  function toggleSidebar(open) {
    if (!chatSidebar) return;
    const willOpen = open !== undefined ? open : !chatSidebar.classList.contains('open');
    chatSidebar.classList.toggle('open', willOpen);
    if (chatSidebarBackdrop) {
      chatSidebarBackdrop.classList.toggle('active', willOpen);
    }
  }

  if (btnToggleSidebar) btnToggleSidebar.addEventListener('click', () => toggleSidebar(true));
  if (btnCloseSidebar) btnCloseSidebar.addEventListener('click', () => toggleSidebar(false));
  if (chatSidebarBackdrop) chatSidebarBackdrop.addEventListener('click', () => toggleSidebar(false));
  if (btnNewChat) btnNewChat.addEventListener('click', createNewConversation);
  if (btnRenameChat) {
    btnRenameChat.addEventListener('click', () => {
      if (activeConversationId) promptRenameConversation(activeConversationId);
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      toggleSidebar(false);
      closeDeleteNoteModal();
      closeDeleteConvModal();
    }
  });

  function resetPhase2Chat() {
    p2Messages.innerHTML = '';
    p2ChatHistory = [];
    selectedConcept = null;
    feynmanHistory = [];
    v3State = {};
    if (ksPanel) ksPanel.hidden = true;
    loadConversations();
    if (simScreenAfterClass.classList.contains('active')) onEnterPhase2();
  }

  // Vào Giai đoạn 2: nạp lại hội thoại và focus ô nhập
  function onEnterPhase2() {
    loadConversations();
    setTimeout(() => {
      if (p2Input) p2Input.focus();
    }, 100);
  }

  // Tải hội thoại ban đầu
  loadConversations();

  // =========================================================================
  // 5. NOTIFICATION CENTER & TOAST UTILITY
  // =========================================================================
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showToast(message) {
    const existing = document.querySelector('.toast-notice');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-notice';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  const NOTIF_ICONS = {
    system: '⚠️',
    learning: '📚',
    ai: '🤖',
  };

  const NOTIF_STORAGE_KEY = 'vlearn_notifications';
  let notifications = [];
  let currentNotifFilter = 'all';

  const btnNotificationBell = document.getElementById('btn-notification-bell');
  const notificationBadge = document.getElementById('notification-badge');
  const notificationPopover = document.getElementById('notification-popover');
  const notifUnreadCount = document.getElementById('notif-unread-count');
  const btnMarkAllRead = document.getElementById('btn-mark-all-read');
  const btnClearAllNotifs = document.getElementById('btn-clear-all-notifs');
  const notifList = document.getElementById('notif-list');
  const notifTabs = document.querySelectorAll('.notif-tab');

  function formatNotifTime(ts) {
    if (!ts) return '';
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return 'Vừa xong';
    if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
    return `${Math.floor(diff / 86400)} ngày trước`;
  }

  function saveNotifications() {
    try {
      localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(notifications));
    } catch (err) {
      console.warn('Không thể lưu notifications vào localStorage', err);
    }
  }

  function loadNotifications() {
    try {
      const raw = localStorage.getItem(NOTIF_STORAGE_KEY);
      notifications = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(notifications)) notifications = [];
    } catch (err) {
      console.warn('Lỗi đọc notifications từ localStorage', err);
      notifications = [];
    }
    renderNotificationUI();
  }

  function renderNotificationUI() {
    const unreadCount = notifications.filter((n) => !n.read).length;

    // Cập nhật Badge trên chuông
    if (notificationBadge) {
      if (unreadCount > 0) {
        notificationBadge.hidden = false;
        notificationBadge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
      } else {
        notificationBadge.hidden = true;
      }
    }

    // Cập nhật Text số lượng chưa đọc trong Header popover
    if (notifUnreadCount) {
      notifUnreadCount.textContent = `${unreadCount} chưa đọc`;
    }

    // Lọc danh sách theo Tab hiện tại
    const filtered = currentNotifFilter === 'all'
      ? notifications
      : notifications.filter((n) => n.category === currentNotifFilter);

    if (!notifList) return;

    if (filtered.length === 0) {
      const filterLabels = {
        system: 'hệ thống',
        learning: 'học tập',
        ai: 'AI',
      };
      const scopeText = currentNotifFilter !== 'all' ? ` trong mục ${filterLabels[currentNotifFilter] || ''}` : '';
      notifList.innerHTML = `
        <div class="notif-empty">
          <span class="notif-empty-icon">🔔</span>
          <span>Chưa có thông báo nào${scopeText}</span>
        </div>
      `;
      return;
    }

    notifList.innerHTML = filtered.map((n) => {
      const icon = NOTIF_ICONS[n.category] || '🔔';
      const unreadCls = n.read ? '' : 'unread';
      return `
        <div class="notif-item notif-item-${n.category} ${unreadCls}" data-id="${n.id}">
          <div class="notif-icon-box">${icon}</div>
          <div class="notif-body">
            <div class="notif-title-row">
              <span class="notif-title">${escapeHtml(n.title)}</span>
              <span class="notif-time">${formatNotifTime(n.timestamp)}</span>
            </div>
            <div class="notif-msg">${escapeHtml(n.message)}</div>
          </div>
          <button class="btn-delete-single-notif" data-id="${n.id}" title="Xóa thông báo">✕</button>
        </div>
      `;
    }).join('');

    // Gắn sự kiện đánh dấu đọc và xóa item
    notifList.querySelectorAll('.notif-item').forEach((el) => {
      el.addEventListener('click', (e) => {
        // Nếu click vào nút xóa thì không trigger đọc
        if (e.target.closest('.btn-delete-single-notif')) return;
        const id = el.getAttribute('data-id');
        markNotificationAsRead(id);
      });
    });

    notifList.querySelectorAll('.btn-delete-single-notif').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        deleteNotification(id);
      });
    });
  }

  function markNotificationAsRead(id) {
    const item = notifications.find((n) => n.id === id);
    if (item && !item.read) {
      item.read = true;
      saveNotifications();
      renderNotificationUI();
    }
  }

  function markAllNotificationsAsRead() {
    let changed = false;
    notifications.forEach((n) => {
      if (!n.read) {
        n.read = true;
        changed = true;
      }
    });
    if (changed) {
      saveNotifications();
      renderNotificationUI();
      showToast('✓ Đã đánh dấu tất cả thông báo là đã đọc');
    }
  }

  function deleteNotification(id) {
    notifications = notifications.filter((n) => n.id !== id);
    saveNotifications();
    renderNotificationUI();
  }

  function clearAllNotifications() {
    if (notifications.length === 0) return;
    notifications = [];
    saveNotifications();
    renderNotificationUI();
    showToast('🗑️ Đã xóa sạch danh sách thông báo');
  }

  function toggleNotificationPopover(forceOpen) {
    if (!notificationPopover) return;
    const isHidden = notificationPopover.hidden;
    const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : isHidden;
    notificationPopover.hidden = !shouldOpen;
    if (btnNotificationBell) {
      btnNotificationBell.setAttribute('aria-expanded', String(shouldOpen));
    }
  }

  // Khởi tạo pushNotification thực thi
  pushNotification = function({ category = 'system', title = 'Thông báo', message = '', showToastNotification = true, meta = null }) {
    const newNotif = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      category,
      title,
      message,
      timestamp: Date.now(),
      read: false,
      meta,
    };
    notifications.unshift(newNotif);
    if (notifications.length > 50) {
      notifications = notifications.slice(0, 50);
    }
    saveNotifications();
    renderNotificationUI();

    if (showToastNotification) {
      const icon = NOTIF_ICONS[category] || '🔔';
      showToast(`${icon} ${title}: ${message}`);
    }
    return newNotif;
  };

  // Event Listeners cho Notification Popover
  if (btnNotificationBell) {
    btnNotificationBell.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleNotificationPopover();
    });
  }

  if (notificationPopover) {
    notificationPopover.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  if (btnMarkAllRead) {
    btnMarkAllRead.addEventListener('click', (e) => {
      e.stopPropagation();
      markAllNotificationsAsRead();
    });
  }

  if (btnClearAllNotifs) {
    btnClearAllNotifs.addEventListener('click', (e) => {
      e.stopPropagation();
      clearAllNotifications();
    });
  }

  notifTabs.forEach((tab) => {
    tab.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetCategory = tab.getAttribute('data-tab') || 'all';
      currentNotifFilter = targetCategory;
      notifTabs.forEach((t) => {
        const isActive = t === tab;
        t.classList.toggle('active', isActive);
        t.setAttribute('aria-selected', String(isActive));
      });
      renderNotificationUI();
    });
  });

  // Đóng Popover khi click ra ngoài
  document.addEventListener('click', (e) => {
    const centerWrap = document.getElementById('notification-center-wrap');
    if (centerWrap && !centerWrap.contains(e.target) && notificationPopover && !notificationPopover.hidden) {
      toggleNotificationPopover(false);
    }
  });

  // Đóng Popover khi nhấn Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && notificationPopover && !notificationPopover.hidden) {
      toggleNotificationPopover(false);
    }
  });

  // Sự kiện mạng Online / Offline
  window.addEventListener('offline', () => {
    pushNotification({
      category: 'system',
      title: 'Mất kết nối mạng',
      message: 'Thiết bị đang ngoại tuyến. Dữ liệu mới có thể chưa được đồng bộ với máy chủ.',
    });
  });

  window.addEventListener('online', () => {
    pushNotification({
      category: 'system',
      title: 'Đã kết nối lại',
      message: 'Kết nối mạng Internet đã được khôi phục bình thường.',
    });
  });

  // Tải danh sách thông báo từ localStorage
  loadNotifications();

  // Deep-link qua URL hash: #afterclass (Giai đoạn 2), #slide=10&deck=<mã bộ slide>
  const slideHash = window.location.hash.match(/^#slide=(\d+)(?:&deck=([\w-]+))?$/);
  if (slideHash) {
    switchSimPhase('inclass');
    pendingSlideJump = Number(slideHash[1]);
    pendingDeckId = slideHash[2] || null;
  } else if (window.location.hash === '#afterclass') {
    switchSimPhase('afterclass');
  }

  // Mở slide; nhật ký buổi học tự tải theo bộ slide sau khi có lessonId
  loadInitialDeck();

});
