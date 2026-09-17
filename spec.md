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

## §2. Impact & quyết định chọn
- Bảng impact ≥3 ứng viên (bao nhiêu người · tần suất · tốn gì mỗi lần · khả thi):
- Ứng viên ĐÃ LOẠI + vì sao:
- Ứng viên CHỌN + vì sao (bằng số):

## §3. Giải pháp tương tự đã nghiên cứu
- [Sản phẩm 1]: flow / đáng học / đáng né / mình khác gì
- [Sản phẩm 2]: ...

## §4. Thiết kế
- Lát cắt MỘT CÂU (1 user · 1 việc · 1 quyết định AI · 1 kết quả):
- Non-goals (≥3 thứ KHÔNG build):
- Mức prototype nhắm tới: [ ] Sketch [ ] Mock [ ] Working — phần nào mock, phần nào thật:
- Automation: [ ] augment [ ] conditional [ ] automate — lý do theo cost-of-error:
- §4b. Nguyên tắc đã áp dụng (≥4 — HAX/PAIR, xem guide):
  | Nguyên tắc | Áp cụ thể vào đâu trong prototype |
  |---|---|

## §5. Kiểu lỗi — 4 lớp chỗ khó + kịch bản (≥8) [bảng theo guide §2.5]

## §6. Bốn đường đi của trải nghiệm
- Happy path: · Low-confidence (②): · Failure/không căn cứ (①): · Correction (user sửa):
- Khi bị đòi ngoài phạm vi (③): · Case đặc thù domain (④):

## §7. Kiểm thử
- Chiều chất lượng + định nghĩa kiểm chứng được:
- Golden set (≥20 case theo cơ cấu trong guide §2.6, file trong eval/):
- Quality bar (chốt từ hạn chốt spec của khoá, giữ nguyên sau đó): "Đạt khi ≥ ___% qua bộ, và ___"
- Kết quả các lượt chạy (bảng % — cập nhật đến trước CP6):

## §8. Phân công & kế hoạch
- Phân công có tên: spec / evidence / prompt / code / demo
- Willing users (≥2 tên) + kế hoạch vòng validation *(bonus, nếu làm)*:
- Multi-prototype (nếu làm): trục khác biệt của ≥2 phương án + lý do chọn:

## §9. Changelog
| Thời điểm | Đổi gì | Vì sao (trỏ về feedback/case nào) |
```
