/**
 * VLearn Smart Workflow - Interactive Prototype Logic
 * Batch 04 - Hackathon AI
 */

document.addEventListener('DOMContentLoaded', () => {
  // =========================================================================
  // 1. TOP-LEVEL NAVIGATION & VIEW SWITCHING
  // =========================================================================
  const btnModeDiagram = document.getElementById('btn-mode-diagram');
  const btnModeSim = document.getElementById('btn-mode-sim');
  const viewDiagram = document.getElementById('view-diagram');
  const viewSim = document.getElementById('view-sim');

  const navStage1 = document.getElementById('nav-stage-1');
  const navStage2 = document.getElementById('nav-stage-2');

  function switchMode(mode) {
    if (mode === 'diagram') {
      btnModeDiagram.classList.add('active');
      btnModeDiagram.setAttribute('aria-selected', 'true');
      btnModeSim.classList.remove('active');
      btnModeSim.setAttribute('aria-selected', 'false');

      viewDiagram.classList.add('active');
      viewSim.classList.remove('active');
    } else {
      btnModeSim.classList.add('active');
      btnModeSim.setAttribute('aria-selected', 'true');
      btnModeDiagram.classList.remove('active');
      btnModeDiagram.setAttribute('aria-selected', 'false');

      viewSim.classList.add('active');
      viewDiagram.classList.remove('active');
    }
  }

  btnModeDiagram.addEventListener('click', () => switchMode('diagram'));
  btnModeSim.addEventListener('click', () => switchMode('sim'));

  // Quick jump between Stage 1 & Stage 2
  navStage1.addEventListener('click', () => {
    navStage1.classList.add('active');
    navStage2.classList.remove('active');
    if (viewDiagram.classList.contains('active')) {
      document.getElementById('diagram-stage-1').scrollIntoView({ behavior: 'smooth' });
    } else {
      switchSimPhase('inclass');
    }
  });

  navStage2.addEventListener('click', () => {
    navStage2.classList.add('active');
    navStage1.classList.remove('active');
    if (viewDiagram.classList.contains('active')) {
      document.getElementById('diagram-stage-2').scrollIntoView({ behavior: 'smooth' });
    } else {
      switchSimPhase('afterclass');
    }
  });

  // =========================================================================
  // 2. VIEW 1: DIAGRAM WORKFLOW INTERACTIONS (BƯỚC 2 -> BƯỚC 3 & BƯỚC 4)
  // =========================================================================

  const triggerStep3 = document.getElementById('trigger-step-3');
  const triggerStep4 = document.getElementById('trigger-step-4');
  const step3Card = document.getElementById('step-3-card');
  const step4Card = document.getElementById('step-4-card');
  const demoHighlightText = document.getElementById('demo-highlight-text');

  // Clicking the highlighted text activates the action bar with pulse
  demoHighlightText.addEventListener('click', () => {
    const bar = document.getElementById('step2-action-bar');
    bar.style.transform = 'scale(1.05)';
    setTimeout(() => {
      bar.style.transform = 'scale(1)';
    }, 200);
    showToast('💡 Đã chọn đoạn text! Chọn "Hỏi đáp" (Bước 3) hoặc "Ghi chú" (Bước 4)');
  });

  // Requirement: Bấm Hỏi đáp -> hiện ra Bước 3
  triggerStep3.addEventListener('click', (e) => {
    e.stopPropagation();
    highlightStepCard(step3Card);
    step3Card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast('🤖 Bước 3 kích hoạt: AI Explain giải thích theo ngữ cảnh Slide 12!');
  });

  // Requirement: Bấm Ghi chú -> hiện ra Bước 4
  triggerStep4.addEventListener('click', (e) => {
    e.stopPropagation();
    highlightStepCard(step4Card);
    step4Card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast('📝 Bước 4 kích hoạt: Mở form ghi chú & 2 hình thức lưu!');
  });

  function highlightStepCard(card) {
    card.style.transition = 'all 0.3s ease';
    card.style.boxShadow = '0 0 0 3px #3b82f6, 0 10px 25px rgba(59, 130, 246, 0.3)';
    card.style.transform = 'translateY(-6px)';
    setTimeout(() => {
      card.style.boxShadow = '';
      card.style.transform = '';
    }, 1800);
  }

  // AI Explain feedback thumbs
  const btnThumbUp = document.getElementById('btn-thumb-up');
  const btnThumbDown = document.getElementById('btn-thumb-down');
  if (btnThumbUp && btnThumbDown) {
    btnThumbUp.addEventListener('click', () => {
      btnThumbUp.classList.add('active');
      btnThumbDown.classList.remove('active');
      showToast('👍 Đã ghi nhận phản hồi hữu ích!');
    });
    btnThumbDown.addEventListener('click', () => {
      btnThumbDown.classList.add('active');
      btnThumbUp.classList.remove('active');
      showToast('👎 Đã ghi nhận: Sẽ bổ sung ví dụ trực quan hơn.');
    });
  }

  // AI Explain -> Quick save to note
  const btnSaveAiToNote = document.getElementById('btn-save-ai-to-note');
  if (btnSaveAiToNote) {
    btnSaveAiToNote.addEventListener('click', () => {
      highlightStepCard(step4Card);
      step4Card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      showToast('📝 Đã chuyển nội dung AI Explain vào Bước 4 (Ghi chú)!');
    });
  }

  // Step 4 Rating Selector in Diagram
  const ratingStarsContainer = document.getElementById('rating-stars-container');
  const ratingTextStatus = document.getElementById('rating-text-status');
  const ratingLabels = {
    1: '1/5 (Chưa hiểu)',
    2: '2/5 (Chưa hiểu rõ)',
    3: '3/5 (Hiểu một phần)',
    4: '4/5 (Khá tốt)',
    5: '5/5 (Hiểu rõ)'
  };

  let currentDiagramRating = 2;

  if (ratingStarsContainer) {
    ratingStarsContainer.querySelectorAll('.rate-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = parseInt(btn.getAttribute('data-val'));
        currentDiagramRating = val;
        ratingStarsContainer.querySelectorAll('.rate-btn').forEach(b => {
          b.classList.toggle('active', parseInt(b.getAttribute('data-val')) === val);
        });
        ratingTextStatus.textContent = ratingLabels[val];
      });
    });
  }

  // Step 4 Save Action -> Update Step 5 (Activity Log)
  const btnSaveAndEval = document.getElementById('btn-save-and-evaluate');
  const btnSaveSlideLink = document.getElementById('btn-save-slide-link');
  const diagramActivityList = document.getElementById('diagram-activity-list');

  if (btnSaveAndEval) {
    btnSaveAndEval.addEventListener('click', () => {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      
      const newLi = document.createElement('li');
      newLi.className = 'act-item highlight-entry';
      newLi.innerHTML = `
        <span class="act-time">${timeStr}</span>
        <div class="act-body">
          <span class="act-type badge-eval">📊 Ghi chú (đánh giá ${currentDiagramRating}/5)</span>
          <p class="act-detail">"Đã lưu vào hệ thống ôn tập: Query, Key, Value"</p>
        </div>
      `;
      diagramActivityList.prepend(newLi);

      const step5Card = document.getElementById('step-5-card');
      highlightStepCard(step5Card);
      showToast(`💾 Đã lưu vào Learning Activity Database với mức độ ${currentDiagramRating}/5!`);
    });
  }

  if (btnSaveSlideLink) {
    btnSaveSlideLink.addEventListener('click', () => {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      
      const newLi = document.createElement('li');
      newLi.className = 'act-item';
      newLi.innerHTML = `
        <span class="act-time">${timeStr}</span>
        <div class="act-body">
          <span class="act-type badge-link">🔗 Ghi chú (link slide)</span>
          <p class="act-detail">Bookmark Slide 12 - Query, Key, Value</p>
        </div>
      `;
      diagramActivityList.prepend(newLi);
      showToast('🔗 Đã lưu link slide 12 vào Nhật ký buổi học!');
    });
  }

  // Stage 2 Trigger from Diagram Step 6 & 7
  const btnTriggerReviewList = document.getElementById('btn-trigger-review-list');
  const step7Card = document.getElementById('step-7-card');
  if (btnTriggerReviewList) {
    btnTriggerReviewList.addEventListener('click', () => {
      highlightStepCard(step7Card);
      step7Card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      showToast('🤖 AI đã phân tích ghi chú: Đề xuất ôn tập ưu tiên Query, Key, Value (2/5)!');
    });
  }

  const btnStartFeynman = document.getElementById('btn-start-feynman');
  const step8Card = document.getElementById('step-8-card');
  if (btnStartFeynman) {
    btnStartFeynman.addEventListener('click', () => {
      highlightStepCard(step8Card);
      step8Card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      showToast('👨‍🏫 Bắt đầu phiên Feynman: Đóng vai giáo viên dạy AI!');
    });
  }

  const btnDemoReply = document.getElementById('btn-demo-reply');
  const step9Card = document.getElementById('step-9-card');
  const step10Card = document.getElementById('step-10-card');
  if (btnDemoReply) {
    btnDemoReply.addEventListener('click', () => {
      highlightStepCard(step9Card);
      setTimeout(() => {
        highlightStepCard(step10Card);
        step10Card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        showToast('🏆 Hoàn tất phiên dạy AI! Điểm đánh giá nâng từ 2/5 lên 4/5.');
      }, 1000);
    });
  }

  const btnBackReviewList = document.getElementById('btn-back-review-list');
  if (btnBackReviewList) {
    btnBackReviewList.addEventListener('click', () => {
      highlightStepCard(step7Card);
      step7Card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }


  // =========================================================================
  // 3. VIEW 2: LIVE SIMULATION SYSTEM (VLEARN LECTURE ROOM & AFTER-CLASS)
  // =========================================================================
  
  const simTabInClass = document.getElementById('sim-tab-inclass');
  const simTabAfterClass = document.getElementById('sim-tab-afterclass');
  const simScreenInClass = document.getElementById('sim-screen-inclass');
  const simScreenAfterClass = document.getElementById('sim-screen-afterclass');

  function switchSimPhase(phase) {
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
    }
  }

  simTabInClass.addEventListener('click', () => switchSimPhase('inclass'));
  simTabAfterClass.addEventListener('click', () => switchSimPhase('afterclass'));

  document.getElementById('btn-go-phase-2').addEventListener('click', () => {
    switchSimPhase('afterclass');
    navStage2.classList.add('active');
    navStage1.classList.remove('active');
    showToast('🌙 Đã sang Giai đoạn 2: Buổi tối ôn tập cá nhân hóa & dạy lại cho AI!');
  });

  // Step 2 in Simulation: Text Selection and Floating Action Bar
  const liveActionBar = document.getElementById('live-action-bar');
  const slideTextTarget = document.getElementById('slide-text-target');
  const liveBtnQa = document.getElementById('live-btn-qa');
  const liveBtnNote = document.getElementById('live-btn-note');

  const liveStep3Drawer = document.getElementById('live-step-3-drawer');
  const closeStep3Drawer = document.getElementById('close-step-3-drawer');
  const liveStep4Modal = document.getElementById('live-step-4-modal');
  const closeStep4Modal = document.getElementById('close-step-4-modal');

  // Toggle selection
  slideTextTarget.addEventListener('click', () => {
    liveActionBar.style.display = liveActionBar.style.display === 'none' ? 'flex' : 'flex';
    liveActionBar.style.animation = 'none';
    setTimeout(() => {
      liveActionBar.style.animation = 'popIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)';
    }, 10);
  });

  // LIVE STEP 2 -> STEP 3: Click Hỏi đáp
  liveBtnQa.addEventListener('click', (e) => {
    e.stopPropagation();
    liveStep3Drawer.classList.add('open');
    liveStep4Modal.classList.remove('open');
    showToast('🤖 AI Explain (Bước 3): Đang giải thích ngữ cảnh ma trận Q, K, V!');
  });

  closeStep3Drawer.addEventListener('click', () => {
    liveStep3Drawer.classList.remove('open');
  });

  // Move from Step 3 drawer to Step 4 notes
  const drawerSaveToNotesBtn = document.getElementById('drawer-save-to-notes-btn');
  drawerSaveToNotesBtn.addEventListener('click', () => {
    liveStep3Drawer.classList.remove('open');
    liveStep4Modal.classList.add('open');
    showToast('📝 Chuyển sang Bước 4: Mở khung ghi chú!');
  });

  // LIVE STEP 2 -> STEP 4: Click Ghi chú
  liveBtnNote.addEventListener('click', (e) => {
    e.stopPropagation();
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

  // Step 4 Live Save Buttons -> Update Step 5 Activity Stream
  const btnDoSaveLink = document.getElementById('btn-do-save-link');
  const btnDoSaveStudy = document.getElementById('btn-do-save-study');
  const liveActivityStream = document.getElementById('live-activity-stream');

  btnDoSaveLink.addEventListener('click', (e) => {
    e.stopPropagation();
    liveStep4Modal.classList.remove('open');
    addLiveActivityLog('🔗 Ghi chú (link slide)', 'Slide 12 - Query, Key, Value', 'tag-purple');
    showToast('🔗 Đã lưu link slide 12 vào Nhật ký buổi học!');
  });

  btnDoSaveStudy.addEventListener('click', (e) => {
    e.stopPropagation();
    liveStep4Modal.classList.remove('open');
    const noteContent = document.getElementById('live-note-textarea').value;
    const shortDesc = noteContent.length > 30 ? noteContent.substring(0, 30) + '...' : noteContent;
    addLiveActivityLog(`📊 Ghi chú (đánh giá ${currentLiveRating}/5)`, `"${shortDesc}"`, 'tag-amber', true);
    showToast(`💾 Đã lưu ghi chú & đánh giá ${currentLiveRating}/5 vào Learning Activity Database!`);
  });

  function addLiveActivityLog(type, msg, tagClass, isHighlight = false) {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    const card = document.createElement('div');
    card.className = `stream-card ${isHighlight ? 'highlight-pulse' : ''}`;
    card.innerHTML = `
      <div class="stream-time">${timeStr}</div>
      <div class="stream-body">
        <span class="stream-tag ${tagClass}">${type}</span>
        <p class="stream-msg">${msg}</p>
      </div>
    `;
    liveActivityStream.prepend(card);
  }


  // =========================================================================
  // 4. VIEW 2: PHASE 2 (AFTER-CLASS FEYNMAN INTERACTION)
  // =========================================================================
  const btnSimSendAsk = document.getElementById('btn-sim-send-ask');
  const planCardQkv = document.getElementById('plan-card-qkv');
  const feynmanMessagesContainer = document.getElementById('feynman-messages-container');
  const btnReply1 = document.getElementById('btn-reply-1');
  const btnReply2 = document.getElementById('btn-reply-2');
  const btnSendTeach = document.getElementById('btn-send-teach');
  const customTeachInput = document.getElementById('custom-teach-input');
  const simStep10Box = document.getElementById('sim-step-10-box');

  btnSimSendAsk.addEventListener('click', () => {
    showToast('🤖 AI đã phân tích Database: 3 nội dung cần ôn tập theo thứ tự ưu tiên!');
    planCardQkv.style.animation = 'pulseGlow 1.5s 2';
  });

  // Feynman Teaching Dialogues
  if (btnReply1) {
    btnReply1.addEventListener('click', () => {
      handleTeacherReply(
        "Vì 3 ma trận tách biệt các vai trò: Q là từ đi tìm, K là từ được tìm, V là thông tin mang theo. Nhờ đó mô hình vừa so khớp được liên hệ giữa 2 từ, vừa giữ được nội dung cần tổng hợp!",
        "Tuyệt vời thầy ơi! Em đã hiểu tại sao cần tách bạch giữa 'khả năng so khớp' (Q, K) và 'nội dung truyền đi' (V). Thầy cho em hỏi thêm: Nếu áp dụng vào câu 'Chú mèo trèo cây cau' thì từ 'chú mèo' sẽ chú ý nhiều nhất vào đâu?"
      );
    });
  }

  if (btnReply2) {
    btnReply2.addEventListener('click', () => {
      handleTeacherReply(
        "Nếu chỉ dùng 1 vector thì một từ so với chính nó luôn có điểm số cao nhất, làm mô hình bị thiên kiến và không nắm bắt được ngữ cảnh tương quan phong phú với các từ xung quanh!",
        "Aha! Em hiểu rồi ạ! Nhờ có ma trận chiếu $W^Q, W^K$ độc lập mà một từ có thể tìm kiếm những từ khác trong một không gian ngữ nghĩa rộng hơn thay vì tự chú ý vào chính mình."
      );
    });
  }

  if (btnSendTeach) {
    btnSendTeach.addEventListener('click', () => {
      const text = customTeachInput.value.trim();
      if (!text) return;
      handleTeacherReply(
        text,
        "Cảm ơn thầy! Lời giải thích rất mạch lạc và dễ hiểu. Em đã nắm vững được bản chất của 3 ma trận Query, Key, Value!"
      );
      customTeachInput.value = '';
    });
  }

  function handleTeacherReply(teacherText, aiReplyText) {
    // Append Teacher msg
    const teacherRow = document.createElement('div');
    teacherRow.className = 'msg-row msg-teacher';
    teacherRow.innerHTML = `
      <div class="msg-avatar">👨‍🏫</div>
      <div class="msg-content">
        <div class="msg-author">Bạn (Giáo viên)</div>
        <div class="msg-bubble">"${teacherText}"</div>
      </div>
    `;
    feynmanMessagesContainer.appendChild(teacherRow);
    feynmanMessagesContainer.scrollTop = feynmanMessagesContainer.scrollHeight;

    // Simulate AI thinking and reply
    setTimeout(() => {
      const aiRow = document.createElement('div');
      aiRow.className = 'msg-row msg-student';
      aiRow.innerHTML = `
        <div class="msg-avatar">🤖</div>
        <div class="msg-content">
          <div class="msg-author">AI (Học viên)</div>
          <div class="msg-bubble">${aiReplyText}</div>
        </div>
      `;
      feynmanMessagesContainer.appendChild(aiRow);
      feynmanMessagesContainer.scrollTop = feynmanMessagesContainer.scrollHeight;

      // Unlock Step 10 summary
      simStep10Box.style.boxShadow = '0 0 0 3px #10b981, 0 10px 25px rgba(16, 185, 129, 0.25)';
      showToast('🎉 Bạn đã giải thích thành công cho AI! Năng lực hiểu được nâng lên 4/5 (Bước 10)');
    }, 600);
  }

  // Finish and return to plan
  const btnFinishAndRefresh = document.getElementById('btn-finish-and-refresh');
  if (btnFinishAndRefresh) {
    btnFinishAndRefresh.addEventListener('click', () => {
      // Update plan card from red to green
      planCardQkv.className = 'plan-card priority-green';
      planCardQkv.querySelector('.plan-rating').innerHTML = 'Bạn đánh giá: <span class="rating-pill green">4/5 (Đã nắm vững) ✨</span>';
      planCardQkv.querySelector('.status-tag').className = 'status-tag green';
      planCardQkv.querySelector('.status-tag').textContent = 'Đã ôn xong';
      planCardQkv.querySelector('.btn-choose-teach').style.display = 'none';

      showToast('✅ Đã cập nhật trạng thái học phần: Query, Key, Value đạt 4/5!');
    });
  }


  // =========================================================================
  // 5. TOAST NOTIFICATION UTILITY
  // =========================================================================
  function showToast(message) {
    const existing = document.querySelector('.toast-notice');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-notice';
    toast.innerHTML = `<span>${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  // Support deep-linking via URL hash (e.g. #sim, #afterclass, #stage2)
  if (window.location.hash === '#sim') {
    switchMode('sim');
  } else if (window.location.hash === '#afterclass') {
    switchMode('sim');
    switchSimPhase('afterclass');
    navStage2.classList.add('active');
    navStage1.classList.remove('active');
  } else if (window.location.hash === '#stage2') {
    document.getElementById('diagram-stage-2').scrollIntoView();
    navStage2.classList.add('active');
    navStage1.classList.remove('active');
  }

});
