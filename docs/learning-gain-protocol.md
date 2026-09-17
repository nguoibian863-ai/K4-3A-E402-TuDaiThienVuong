# Giao thức đo learning gain — plan.md mục 5.3

> Đây là phần DUY NHẤT của plan không phải code. Nó là quy trình nghiên cứu trên người
> thật. Không có dòng lệnh nào "chạy" được nó, và không con số nào trong `eval/` thay thế
> được nó. Tài liệu này để ai cầm lên cũng chạy được đúng thí nghiệm.

## 1. Vì sao golden set và rubric KHÔNG đủ

Hệ thống hiện đo được hai thứ, và cả hai đều không phải learning gain:

| Đang đo được | Thực chất nói lên điều gì | KHÔNG nói lên điều gì |
|---|---|---|
| `eval/run_eval_v3.py` — 32/32 ca | AI hành xử đúng thiết kế sư phạm | Người học có hiểu hơn không |
| `/feynman/v3/rubric` — điểm Explanation 1 vs 2 | Lời giảng lần 2 tốt hơn lần 1 | Cái tốt hơn đó có bền không |

Ba lý do khiến `delta` của rubric không được đọc như bằng chứng học tập:

1. **Nhắc lại lời AI.** Explanation 2 diễn ra ngay sau khi AI vừa chỉ chỗ thiếu và trích
   slide. Người học có thể chỉ đang đọc lại thứ vừa nghe, chưa hề nhập tâm.
2. **Bastani và cộng sự 2025.** Nhóm dùng AI tutor làm bài luyện tập tốt hơn hẳn nhóm đối
   chứng, nhưng **điểm thi gần như bằng nhau**. Giỏi lúc có AI không suy ra giỏi lúc không có.
3. **Fiorella & Mayer 2013.** Một số hiệu ứng học tập hiện ra ở bài kiểm tra ngay rồi biến
   mất ở bài kiểm tra muộn.

Vì vậy `feynman_v3.rubric_score()` luôn gắn kèm `caveat` đúng nội dung này, không cho tắt.

## 2. Thiết kế thí nghiệm

Between-subjects, 2 nhóm, phân ngẫu nhiên.

```
        Pre-test ──► Can thiệp (1 phiên) ──► Post-test ngay ──► [3-7 ngày] ──► Delayed test
                          │                                                    (KHÔNG có AI)
        Nhóm A: dạy lại cho AI (lộ trình 8 bước)
        Nhóm B (đối chứng): đọc lại slide, hoặc chatbot hỏi đáp thường
```

**Biến phụ thuộc chính:** điểm delayed test, đặc biệt là phần câu hỏi chuyển giao.
**Biến phụ thuộc phụ:** post-test ngay, điểm rubric Explanation 1→2, thời gian mỗi phiên.

### Vì sao cần nhóm đối chứng

Không có nhóm B thì mọi tiến bộ đều có thể giải thích bằng "ôn thêm một lần nữa thì nhớ
hơn" — không liên quan gì tới cơ chế dạy lại. Nhóm B phải tốn **thời lượng tương đương**
nhóm A, nếu không thì đang đo thời gian học chứ không đo phương pháp.

## 3. Các bài kiểm tra

Cùng một ngân hàng câu hỏi, chia ba phiên bản tương đương (pre / post / delayed), không
trùng câu. Mỗi bài 3 loại câu:

| Loại | Đo gì | Ví dụ với bài Buổi 3 |
|---|---|---|
| Nhớ lại | Có thuộc không | "CFG Scale kiểm soát điều gì?" |
| Hiểu khái niệm | Có nắm cơ chế không | "Vì sao CFG quá cao lại làm ảnh kém tự nhiên?" |
| **Chuyển giao** | Có dùng được ở tình huống mới không | "Bạn cần ảnh sản phẩm đúng brief nhưng vẫn tự nhiên. Chọn CFG và negative prompt thế nào, vì sao?" |

**Luật cứng cho câu chuyển giao:** không được trùng bất kỳ tình huống nào AI đã nêu trong
phiên. Nếu trùng, nó thành câu nhớ lại trá hình. Người soạn đề phải đọc log phiên
(`codebase/backend/logs/ai_calls.jsonl`) để loại các tình huống đã xuất hiện.

**Delayed test bắt buộc làm không có AI**, không tài liệu, có giám sát.

## 4. Cỡ mẫu

Kobayashi 2019 (meta-analysis) cho hiệu ứng learning-by-teaching cỡ *g* ≈ 0,3–0,4. Với
*α* = 0,05 và power 0,8, hai nhóm độc lập cần **khoảng 100 người mỗi nhóm** để bắt được
hiệu ứng cỡ đó.

Khảo sát hiện có n = 24. **Không đủ để kết luận gì về learning gain.**

Vì vậy vòng đầu nên khai báo thẳng là **pilot khả thi**, mục tiêu:
- 8–12 người, đủ để phát hiện lỗi quy trình (đề quá dễ/khó, phiên quá dài, hướng dẫn khó hiểu);
- lấy phương sai thực tế để tính lại cỡ mẫu cho vòng sau;
- **không** báo cáo p-value, không tuyên bố tính năng "giúp học tốt hơn".

## 5. Trình tự chạy một người tham gia

1. Ký đồng ý tham gia; giải thích dữ liệu được dùng làm gì, được rút lui bất cứ lúc nào.
2. Pre-test (10 phút, không tài liệu).
3. Bốc ngẫu nhiên nhóm A hoặc B — bốc **sau** pre-test để người chấm pre-test không biết nhóm.
4. Phiên can thiệp, chặn cùng một mốc thời gian cho cả hai nhóm.
5. Post-test ngay (10 phút).
6. Hẹn lịch delayed test 3–7 ngày sau. Giữa hai mốc không gửi thêm tài liệu ôn.
7. Delayed test (15 phút, không AI, không tài liệu).

## 6. Chấm bài

- Chấm **mù**: người chấm không biết bài thuộc nhóm nào. Xoá mọi dấu hiệu nhận dạng nhóm
  trước khi chấm.
- Barem viết trước khi nhìn bài, không sửa sau khi đã chấm.
- Câu chuyển giao cần **2 người chấm độc lập**; lệch nhau thì thảo luận chốt lại. Báo cáo
  mức đồng thuận giữa hai người chấm.

## 7. Cách báo cáo, dù kết quả thế nào

Bắt buộc nêu, kể cả khi kết quả không đẹp:

- cỡ mẫu thực tế và số người bỏ giữa chừng, theo từng nhóm;
- điểm trung bình và độ lệch chuẩn ở cả ba mốc, cho từng nhóm;
- **kết quả delayed test tách riêng phần chuyển giao** — đây là con số đáng tin nhất;
- mọi sai lệch so với giao thức này (ai làm bài muộn, ai bị gián đoạn...).

Không được làm: chỉ báo post-test ngay vì nó đẹp hơn; gộp câu chuyển giao vào điểm tổng để
làm mờ kết quả; đổi giả thuyết sau khi nhìn số liệu.

## 8. Vị trí trong lộ trình

Plan mục 6 xếp việc này ở **giai đoạn 4**. Giai đoạn 1–3 (prototype, golden set, tinh chỉnh)
đã xong — xem `eval/REPORT_v3.md`. Giao thức này là thứ chạy tiếp theo, và nó cần người thật
cùng lịch 1 tuần, không phải thứ hoàn thành trong một buổi code.
