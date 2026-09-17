# Template AI Spec *(spec.md — commit trước hạn chốt spec: 21:00 17/9, tại CP4 · quality bar chốt từ thời điểm nộp)*

> Cấu trúc phủ đúng "SPEC 8 phần" của chương trình: Bằng chứng (§1-§2) · Lát cắt (§4) · Canvas (đính kèm CP1) · Augment/Automate (§4) · 4 đường đi của trải nghiệm (§6) · Kiểu lỗi (§5) · Kiểm thử (§7) · Phân công (§8). Hướng dẫn viết từng mục: `02-guide.md`.

```markdown
# AI SPEC — Dạy học AI · Nhóm [TuDaiThienVuong] · Zone [C3]
Hướng: [ ] A — VLearn  [ ] B — Trợ lý Học viên  [x] D — Học tập thích ứng & tương tác  [ ] C — Làn mở
Loại: [ ] Tối ưu tính năng có sẵn  [x] Tính năng mới

## §1. User & Job
- Job executor + workflow: Học viên VLearn, workflow 2 giai đoạn — (1) học trên lớp: bôi đen đoạn chưa hiểu, hỏi đáp AI, ghi chú; (2) sau buổi học: AI gợi ý nội dung cần ôn, học viên "dạy lại" kiến thức cho AI, AI hỏi ngược chỗ giải thích thiếu/sai. (đính kèm sơ đồ workflow trong `mock UI/`)
- Core JTBD: Khi vừa nghe giảng xong và cảm thấy đã hiểu một khái niệm, tôi muốn tự kiểm tra xem mình có thực sự giải thích lại được không, để không mang lỗ hổng kiến thức tưởng-đã-hiểu sang lúc ôn thi.
- Problem statement: Nhiều học viên tin mình đã hiểu một khái niệm ngay sau khi nghe giảng, nhưng khi phải tự giải thích lại mà không nhìn tài liệu thì không làm được — lỗ hổng này chỉ lộ ra lúc kiểm tra, khi đã quá muộn để ôn lại.
- Evidence (chuẩn A/B — khảo sát và evidence đã chuẩn hóa, log đầy đủ trong repo):
  - Khảo sát trực tuyến ẩn danh, n = 24, thực hiện ngày 17/9/2026; riêng câu hỏi về khả năng tự giải thích lại có 23 câu trả lời hợp lệ.
  - 20/24 (83,3%) có tự học/ôn lại trên VLearn ngoài giờ lên lớp.
  - 15/24 (62,5%) không chắc hoặc khó tự giải thích lại kiến thức vừa học mà không nhìn tài liệu.
  - 13/24 (54,2%) không biết phần nào là trọng tâm; 12/24 (50%) gặp nội dung kéo dài qua nhiều slide.
  - 24/24 (100%) sẵn sàng thử AI đóng vai học viên và hỏi ngược.
  - Bằng chứng chi tiết: [evidence/evidence_summary.md](evidence/evidence_summary.md), [evidence/quotes.md](evidence/quotes.md), và [evidence/survey_results.csv](evidence/survey_results.csv).
  - ≥5 quote/ví dụ nguyên văn + nguồn: Khảo sát Google Forms ẩn danh ngày 17/9/2026, câu hỏi mở bổ sung; bản ghi và mã người trả lời trong [evidence/quotes.md](evidence/quotes.md):
    - U01: “Lúc vibecode. Thấy copy paste code chạy ra kết quả thì tưởng là hiểu, đến lúc labcode yêu cầu đổi show file test thì ngơ người không biết test ở đâu”
    - U02: “ôn nọ học về Overfitting và Regularization. Tưởng hiểu rồi vì khái niệm khá dễ hình dung. Nhưng lúc làm quiz trắc nghiệm, các câu hỏi giả điều kiện thay đổi tham số L1, L2 kết hợp thì mình chọn sai hết, rồi lú luôn.”
    - U03: “Bài về RAG (Retrieval-Augmented Generation). Tưởng hiểu cách chia chunk text rồi, nhưng lúc đưa vào dự án thực tế, dữ liệu bảng biểu bị cắt nát bét. Lúc đó mới phát hiện ra mình chưa thực sự xử lý context phức tạp.”
    - U04: “Lúc xem video giải thích thấy rất logic, gật gù hiểu. Nhưng đến lúc làm lab thì mình chịu chết.”
    - U05: “Mình hay nhẩm lại trong đầu khi chạy xe. Cứ nghĩ là trôi chảy nhưng hễ gặp từ chuyên ngành là ấp úng, không nối được logic từ A sang B, phải rút điện thoại ra check lại tài liệu.”

## §2. Impact & quyết định chọn
- Bảng impact ≥3 ứng viên (bao nhiêu người · tần suất · tốn gì mỗi lần · khả thi):
  | Ứng viên | Số người | Tần suất | Tốn gì mỗi lần | Khả thi |
  |---|---:|---|---|---|
  | Không biết mình thực sự hiểu bài đến đâu sau giờ học | 15/24 (62,5%) | Sau khi học / ôn lại | Chỉ phát hiện lỗ hổng khi làm quiz, lab hoặc phải giải thích lại | Cao |
  | Không biết phần nào là trọng tâm để ưu tiên ôn tập | 13/24 (54,2%) | Khi ôn nội dung nhiều phần | Tốn thời gian đọc lại toàn bộ slide | Cao |
  | Cần cách kiểm tra bằng “dạy lại” thay vì chỉ đọc lại | 24/24 (100%) sẵn sàng thử | Khi tự kiểm tra mức hiểu | Phải tự diễn giải và trả lời câu hỏi phản biện | Cao |
- Ứng viên ĐÃ LOẠI + vì sao:
  - “AI giải thích toàn bộ bài học”: loại vì giải thích thêm không đo được người học có tự tái tạo logic hay không.
  - “AI chỉ tạo flashcard”: loại vì vẫn thiên về nhớ lại thụ động, không giải quyết việc xác định lỗ hổng.
  - “AI chỉ tóm tắt ghi chú”: loại vì không tạo ra quyết định ưu tiên ôn tập và không có vòng sửa sai.
- Ứng viên CHỌN + vì sao (bằng số):
  - Chọn “Sinh viên dạy AI hiểu bài như một học sinh”. Có 15/24 (62,5%) gặp khó khi tự giải thích lại, 13/24 (54,2%) không biết phần trọng tâm, và 24/24 (100%) sẵn sàng thử AI hỏi ngược. Flow này cũng khớp workflow B7–B10 đã có trong repo.

## §3. Giải pháp tương tự đã nghiên cứu
- Quizlet / flashcard: flow ôn theo thẻ nhanh và có tính lặp lại; đáng học ở cách chia nhỏ nội dung, đáng né ở việc người học phải tự tạo thẻ và không bắt buộc giải thích lại; mình khác ở vòng teach-back và xếp ưu tiên theo mức hiểu.
- ChatGPT / AI chat tổng quát: flow hỏi đáp và phản hồi tức thời; đáng học ở tốc độ tương tác, đáng né ở nguy cơ lan man và trả lời thay người học; mình khác ở vai AI học viên, câu hỏi phản biện, evidence_ids và fallback.
- Notion AI / Obsidian AI: flow tóm tắt và tổ chức ghi chú; đáng học ở việc tận dụng dữ liệu đã lưu, đáng né ở việc thiếu kiểm tra hiểu sâu; mình khác ở quyết định “cần ôn gì trước” và nút sửa điều chỉnh của người dùng.

## §4. Thiết kế
- Lát cắt MỘT CÂU (1 user · 1 việc · 1 quyết định AI · 1 kết quả): Sau buổi học, một sinh viên chọn khái niệm chưa chắc, giải thích lại cho AI, AI quyết định câu hỏi phản biện và nhóm ưu tiên ôn tập, để sinh viên nhận ra lỗ hổng và biết cần xem lại gì trước.
- Non-goals (≥3 thứ KHÔNG build):
  - Không thay thế giảng viên hoặc chấm điểm học lực chính thức.
  - Không tự động ôn tập toàn bộ mà bỏ qua phần giải thích của người học.
  - Không lưu dữ liệu cá nhân người thật; prototype dùng dữ liệu giả và quote đã ẩn danh.
  - Không trả lời các yêu cầu ngoài phạm vi bài học như điểm thi hoặc nội dung không có trong evidence.
- Mức prototype nhắm tới: [ ] Sketch [ ] Mock [x] Working — phần nào mock, phần nào thật:
  - Mock: B1–B6 và B8–B10 trong UI; phần AI hỏi ngược ở B9 dùng câu soạn sẵn.
  - Working: luật nhóm nền, lọc bookmark, kiểm `evidence_ids`, giới hạn điều chỉnh một nhóm, fallback và eval prompt 25 case.
- Automation: [ ] augment [x] conditional [ ] automate — lý do theo cost-of-error: chỉ tự động gộp khái niệm, xếp nhóm và gắn cờ khi có đủ căn cứ; dữ liệu mơ hồ, ngoài phạm vi, AI timeout hoặc output sai phải giữ luật mặc định và báo trạng thái.
- §4b. Nguyên tắc đã áp dụng (≥4 — HAX/PAIR, xem guide):
  | Nguyên tắc | Áp cụ thể vào đâu trong prototype |
  |---|---|
  | Giảm rủi ro AI bịa | Bắt buộc `evidence_ids` tồn tại trong input; sai thì dùng `base_group`. |
  | Tôn trọng người dùng | Nút “Không đúng” trả điều chỉnh về nhóm tự chấm và ghi correction. |
  | Hiện trạng thái rõ ràng | Hiển thị `high`, `medium`, `low`, `excluded`, `insufficient_info` và lý do. |
  | Giảm nhiễu | Bookmark bị loại khỏi danh sách ôn; chỉ ưu tiên note/question có giá trị ôn tập. |
  | Kiểm soát hành vi | `final_group` chỉ được lệch tối đa một mức so với `base_group`. |

## §5. Kiểu lỗi — 4 lớp chỗ khó + kịch bản (≥8) [bảng theo guide §2.5]

| Lớp | Kịch bản lỗi | Cách xử lý / tiêu chí đạt |
|---|---|---|
| 1. Dữ liệu đầu vào | Note quá ngắn hoặc chỉ có “??” | Gắn `insufficient_info`, giữ nhóm nền, không đoán. |
| 1. Dữ liệu đầu vào | Chữ tắt hoặc highlight thiếu ngữ cảnh | Yêu cầu bổ sung thông tin hoặc giữ nhóm nền. |
| 2. Tập trung ý nghĩa | Gộp nhầm hai khái niệm gần tên nhưng khác nghĩa | Chỉ gộp khi cùng concept; nếu không chắc thì giữ riêng. |
| 2. Tập trung ý nghĩa | Ngoài phạm vi bài học bị đưa vào danh sách ôn | Gắn `excluded`, không tính vào ưu tiên chính. |
| 3. Quyết định AI | `final_group` lệch quá một mức so với `base_group` | Validator loại điều chỉnh và dùng `base_group`. |
| 3. Quyết định AI | `evidence_ids` không tồn tại trong input | Bỏ output AI của mục đó, dùng fallback theo luật. |
| 3. Quyết định AI | AI timeout hoặc trả JSON sai schema | Hiện danh sách theo luật và ghi `used_fallback = true`. |
| 4. Sửa sai và tương tác | Người dùng bấm “Không đúng” | Trả về `base_group`, ghi correction và cho phép chạy lại B7. |
| 4. Sửa sai và tương tác | AI hỏi lan man hoặc hỏi quá khó | Giới hạn vào concept/evidence hiện tại, cho gợi ý hoặc kết thúc vòng. |
| 4. Sửa sai và tương tác | Người dùng tự chấm lại sau teach-back | Cập nhật rating và xếp lại danh sách ôn. |

## §6. Bốn đường đi của trải nghiệm
- Happy path: Học viên lưu note/question và tự chấm; hệ thống lọc bookmark, nhóm theo luật, AI gộp concept, trả lý do + căn cứ; học viên teach-back và cập nhật mức hiểu.
- Low-confidence (②): Note quá ngắn hoặc mơ hồ được gắn `insufficient_info`, giữ nhóm nền và hiển thị cần bổ sung dữ liệu.
- Failure/không căn cứ (①): `evidence_ids` sai, JSON sai hoặc API lỗi khiến validator bỏ điều chỉnh; UI hiện danh sách theo luật và cảnh báo fallback.
- Correction (user sửa): Bấm “Không đúng” trên thẻ AI điều chỉnh sẽ trả về `base_group`, ghi correction và cho phép chạy lại review.
- Khi bị đòi ngoài phạm vi (③): Câu hỏi như “Khi nào có điểm thi?” được gắn `excluded`, không đưa vào danh sách ôn chính.
- Case đặc thù domain (④): Với Q/K/V và Multi-head, hệ thống xếp khái niệm nền Q/K/V trước khái niệm phụ thuộc Multi-head.

## §7. Kiểm thử
- Chiều chất lượng + định nghĩa kiểm chứng được:
  - Độ đúng workflow: lọc bookmark, nhóm nền và thứ tự khái niệm đúng theo luật.
  - Độ tin cậy output: JSON hợp lệ, `evidence_ids` có thật, điều chỉnh không quá một nhóm.
  - Độ an toàn: mục ngoài phạm vi bị loại, thiếu dữ liệu không bị đoán, API lỗi có fallback.
  - Độ hữu ích: người học nhận ra điểm thiếu, sửa giải thích hoặc xác định rõ phần cần xem lại.
- Golden set (≥20 case theo cơ cấu trong guide §2.6, file trong eval/): `eval/golden_set.json` có 25 case; gồm half-truth, jargon masking, sycophancy, role reversal, premature completion, reverse interrogation, prompt injection, lạc đề, gaslighting, áp lực cảm xúc, garbage input và happy path tổng hợp.
- Quality bar (chốt từ hạn chốt spec của khoá, giữ nguyên sau đó): "Đạt khi ≥ 95% qua bộ, JSON hợp lệ 100%, không có `evidence_ids` giả, điều chỉnh không quá một mức, và mọi lỗi AI đều fallback an toàn."
- Kết quả các lượt chạy (bảng % — cập nhật đến trước CP6):
  | Lượt chạy | Golden set | JSON hợp lệ | Căn cứ hợp lệ | Ghi chú |
  |---|---:|---:|---:|---|
  | Prompt v1 | 14/25 (56%) | — | Chưa đạt | Thiếu grounding, dễ dính nịnh bợ và kết thúc sớm. |
  | Prompt v2 | 25/25 (100%) | 25/25 (100%) | 25/25 (100%) | Eval ngày 17/9/2026, gpt-4o-mini. |

## §8. Phân công & kế hoạch
- Phân công có tên: spec / evidence / prompt / code / demo
  - Spec: đại diện nhóm TuDaiThienVuong (cần bổ sung tên thật trước khi nộp).
  - Evidence: R01–R08 trong khảo sát ẩn danh; tổng hợp từ `evidence/evidence_summary.md`.
  - Prompt / AI review: thành viên phụ trách prompt và eval; kết quả ở `eval/evaluation_report.md`.
  - Code / frontend-backend: thành viên phụ trách `codebase/frontend/` và `codebase/backend/` theo `codebase/WORKFLOW.md`.
  - Demo / tổng hợp trình bày: đại diện nhóm (cần bổ sung tên thật trước khi nộp).
- Willing users (≥2 tên) + kế hoạch vòng validation *(bonus, nếu làm)*:
  - R01 và R02 (mã ẩn danh trong survey; cần thay bằng tên người tham gia nếu được phép công khai).
  - Vòng 1: cho người dùng chọn concept, tự giải thích, nhận câu hỏi ngược; đo việc họ có nhận ra và sửa điểm thiếu không.
  - Vòng 2: cho người dùng dùng lại sau 24–48 giờ; đo khả năng xác định đúng phần cần ôn, thời gian hoàn thành và số lần bấm “Không đúng”.
- Multi-prototype (nếu làm):
  - Phương án A: AI xếp danh sách ôn tập rồi teach-back theo concept yếu.
  - Phương án B: chatbot trả lời trực tiếp, không xếp ưu tiên và không bắt buộc giải thích lại.
  - Chọn A vì giải quyết được cả hai tín hiệu khảo sát chính: 62,5% khó tự giải thích và 54,2% không biết phần trọng tâm; đồng thời khớp workflow và có thể kiểm thử bằng golden set.

## §9. Changelog
| Thời điểm | Đổi gì | Vì sao (trỏ về feedback/case nào) |
|---|---|---|
| 16/9 | Chốt hướng “dạy lại cho AI” và workflow hai giai đoạn | Phù hợp vấn đề khoảng cách giữa cảm giác hiểu và khả năng giải thích lại. |
| 17/9 | Bổ sung số liệu khảo sát, quote ẩn danh và evidence summary | Khảo sát n = 24 xác nhận nhu cầu ôn sau giờ học và mức sẵn sàng 100%. |
| 17/9 | Điền impact, error taxonomy, bốn đường đi và kế hoạch validation | Bám workflow B7–B10, contract AI và các failure case đã định nghĩa. |
| 17/9 | Ghi kết quả eval Prompt v1/v2 | Golden set 25 case đạt 25/25 với Prompt v2. |
```
