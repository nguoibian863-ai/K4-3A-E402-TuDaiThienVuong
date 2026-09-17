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

// Backend không phản hồi -> hiện rỗng, không bịa data giả để tránh nhầm với data thật.
const FALLBACK_ACTIVITIES = [];

// true khi có hoạt động mới chưa được AI xếp vào danh sách ôn (B7)
let reviewStale = true;

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json();
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
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

  function base64ToUint8Array(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

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
    if (!ok && typeof LECTURE_PDF_BASE64 !== 'undefined') {
      ok = await loadPdf(base64ToUint8Array(LECTURE_PDF_BASE64), DEFAULT_DECK_NAME);
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
      } else if (result.status === 'out_of_scope') {
        showToast('🤖 Câu hỏi không liên quan đoạn đã bôi đen.');
      } else if (result.status === 'insufficient_context') {
        showToast('🤖 Đoạn bôi đen chưa đủ ngữ cảnh để trả lời.');
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
      loadActivities();
      showToast(`📍 Đã lưu tiến độ: học đến Trang ${currentHighlightPageNo}. Hỏi chatbot ở Giai đoạn 2 để quay lại đây.`);
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
    loadActivities();
    showToast(`💾 Đã lưu ghi chú & đánh giá ${currentLiveRating}/5 vào Learning Activity Database!`);
  });

  // ---- Nhật ký buổi học (Bước 5): đọc từ backend, fallback data giả nếu offline ----
  const liveActivityStream = document.getElementById('live-activity-stream');

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
    liveActivityStream.innerHTML = '';
    if (!items || items.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'review-empty-state';
      empty.textContent = 'Chưa có hoạt động nào trong buổi học này.';
      liveActivityStream.appendChild(empty);
      return;
    }
    items.forEach(item => {
      const meta = activityTypeMeta[item.type] || activityTypeMeta.question;
      const card = document.createElement('div');
      card.className = `stream-card ${meta.className}`;

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
      liveActivityStream.appendChild(card); // backend trả mới nhất trước -> mới nhất ở trên cùng
    });
    liveActivityStream.scrollTop = 0;
  }

  async function loadActivities() {
    if (!lessonId) {
      renderActivityLog([]);
      return;
    }
    try {
      const items = await apiGet(`/sessions/${SESSION_ID}/activities?lesson_id=${encodeURIComponent(lessonId)}`);
      renderActivityLog(items);
    } catch (err) {
      console.warn('loadActivities: dùng data giả vì backend không phản hồi.', err);
      renderActivityLog(FALLBACK_ACTIVITIES);
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

  function scrollChatToBottom() {
    p2Messages.scrollTop = p2Messages.scrollHeight;
  }

  // role: 'user' (bên phải) | 'ai' (bên trái) | 'system' (dải giữa)
  function addChatMessage(role, { text = '', loading = false, badge = '', author = '' } = {}) {
    if (role === 'system') {
      const divider = document.createElement('div');
      divider.className = 'p2-system-msg';
      divider.textContent = text;
      p2Messages.appendChild(divider);
      scrollChatToBottom();
      return divider;
    }
    const isUser = role === 'user';
    const row = document.createElement('div');
    row.className = `msg-row ${isUser ? 'msg-student' : 'msg-teacher'} p2-msg`;
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
    bubble.textContent = text;
    content.appendChild(authorEl);
    content.appendChild(bubble);
    row.appendChild(avatar);
    row.appendChild(content);
    p2Messages.appendChild(row);
    scrollChatToBottom();
    return bubble;
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
      addChip('Hôm nay tôi cần ôn gì?', () => requestReviewList('Hôm nay tôi cần ôn gì?'));
      addChip('📍 Tôi đã học đến đâu?', () => requestChat('Tôi đã học đến đâu?'));
      addChip('🔗 Tôi đã lưu những trang nào?', () => requestChat('Tôi đã lưu những trang nào?'));
    }
  }

  function setMode(mode) {
    p2Mode = mode;
    if (mode === 'feynman') {
      p2ModeTag.textContent = 'Dạy lại cho AI';
      p2ChatStatus.textContent = `Bạn là "Giáo viên" · Chủ đề: ${selectedConcept}`;
      p2Input.placeholder = 'Giải thích khái niệm bằng lời của bạn...';
    } else {
      p2ModeTag.textContent = 'Ôn tập';
      p2ChatStatus.textContent = 'Hỏi AI hôm nay cần ôn gì, chọn khái niệm để dạy lại cho AI';
      p2Input.placeholder = 'Hỏi AI: Hôm nay tôi cần ôn gì?';
    }
    renderQuickActions();
  }

  function exitFeynmanMode() {
    selectedConcept = null;
    feynmanHistory = [];
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

  function addCardMessage(cardEl) {
    const bubble = addChatMessage('ai');
    bubble.classList.add('p2-card-bubble');
    bubble.appendChild(cardEl);
    scrollChatToBottom();
    return bubble;
  }

  async function requestReviewList(userText) {
    if (p2Busy) return;
    if (userText) addChatMessage('user', { text: userText });
    setBusy(true);
    const loading = addChatMessage('ai', { text: 'Đang phân tích ghi chú và câu hỏi buổi học...', loading: true });
    try {
      const data = await apiPost(`/sessions/${SESSION_ID}/review`, { lesson_id: lessonId });
      reviewStale = false;
      loading.closest('.msg-row').remove();
      addCardMessage(buildReviewCard(data));
    } catch (err) {
      console.warn('Gọi /review thất bại', err);
      loading.textContent = 'Không kết nối được backend AI. Kiểm tra server (FastAPI) rồi thử lại.';
      loading.classList.remove('msg-loading');
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
    const bubble = addChatMessage('ai', { text: 'Đang suy nghĩ...', loading: true, author: 'AI (Học viên)' });
    try {
      const result = await apiPost('/feynman/reply', {
        session_id: SESSION_ID,
        lesson_id: lessonId,
        concept: selectedConcept,
        history: feynmanHistory,
        message,
      });
      bubble.textContent = result.reply;
      bubble.classList.remove('msg-loading');
      if (result.used_fallback) return; // không đưa lượt lỗi vào lịch sử
      if (message) feynmanHistory.push({ role: 'teacher', content: message });
      feynmanHistory.push({ role: 'student', content: result.reply });
      const label = feedbackTypeMeta[result.feedback_type];
      if (label && message) {
        const badgeEl = document.createElement('span');
        badgeEl.className = 'p2-feedback-badge';
        badgeEl.textContent = label;
        bubble.parentElement.querySelector('.msg-author').appendChild(badgeEl);
      }
    } catch (err) {
      console.warn('Gọi /feynman/reply thất bại', err);
      bubble.textContent = 'Không kết nối được backend AI. Kiểm tra server rồi thử lại.';
      bubble.classList.remove('msg-loading');
    }
  }

  async function startFeynmanSession(concept) {
    selectedConcept = concept;
    feynmanHistory = [];
    setMode('feynman');
    addChatMessage('system', { text: `👨‍🏫 Bắt đầu dạy lại "${concept}" — bạn là Giáo viên, AI là Học viên` });
    setBusy(true);
    await requestStudentReply('');
    setBusy(false);
    renderQuickActions();
    p2Input.focus();
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
    const loading = addChatMessage('ai', { text: 'Đang tổng kết phiên dạy...', loading: true });
    try {
      const result = await apiPost('/feynman/summary', {
        session_id: SESSION_ID,
        lesson_id: lessonId,
        concept: selectedConcept,
        history: feynmanHistory,
      });
      loading.closest('.msg-row').remove();
      addCardMessage(buildSummaryCard(result));
    } catch (err) {
      console.warn('Gọi /feynman/summary thất bại', err);
      loading.textContent = 'Không kết nối được backend AI để tổng kết.';
      loading.classList.remove('msg-loading');
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
    if (p2Mode === 'feynman') {
      addChatMessage('user', { text, author: 'Bạn (Giáo viên)' });
      setBusy(true);
      await requestStudentReply(text);
      setBusy(false);
      renderQuickActions();
      p2Input.focus();
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

  async function requestChat(text) {
    if (p2Busy) return;
    addChatMessage('user', { text });
    setBusy(true);
    const bubble = addChatMessage('ai', { text: 'Đang xem lại quá trình học của bạn...', loading: true });
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
      bubble.textContent = 'Không kết nối được backend AI. Kiểm tra server rồi thử lại.';
      bubble.classList.remove('msg-loading');
      setBusy(false);
      renderQuickActions();
      return;
    }
    p2ChatHistory.push({ role: 'user', content: text });
    if (result.intent === 'review_list' && !result.used_fallback) {
      bubble.closest('.msg-row').remove();
      p2ChatHistory.push({ role: 'assistant', content: result.reply });
      setBusy(false);
      requestReviewList('');
      return;
    }
    bubble.textContent = result.reply;
    bubble.classList.remove('msg-loading');
    addSlideLinks(bubble, result.links);
    if (!result.used_fallback) p2ChatHistory.push({ role: 'assistant', content: result.reply });
    setBusy(false);
    renderQuickActions();
    p2Input.focus();
  }

  p2Send.addEventListener('click', handleP2Send);
  p2Input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleP2Send();
  });

  function resetPhase2Chat() {
    p2Messages.innerHTML = '';
    p2ChatHistory = [];
    exitFeynmanMode();
    if (simScreenAfterClass.classList.contains('active')) onEnterPhase2();
  }

  // Vào Giai đoạn 2: chỉ chào, chờ người dùng tự hỏi (không tự gửi "hôm nay ôn gì")
  function onEnterPhase2() {
    if (!p2Messages.childElementCount) {
      addChatMessage('ai', { text: 'Chào bạn! Hỏi mình về quá trình học nhé, ví dụ "Hôm nay tôi cần ôn gì?", "Tôi đã học đến đâu?", "Tôi đã ghi chú gì về latent space?" — mình sẽ trả lời kèm link tới đúng trang slide.' });
      setMode('review');
    }
  }

  setMode('review');

  // =========================================================================
  // 5. TOAST NOTIFICATION UTILITY
  // =========================================================================
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
