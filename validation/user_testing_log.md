# Nhật ký thử nghiệm người dùng (User Testing Log) — Mốc R6 / CP5

> **Dự án:** VLearn Smart Learning — Tính năng Dạy lại cho AI (Feynman Teach-back) & Quản lý hội thoại ChatGPT  
> **Lớp:** Batch 04 · Lớp 3A · **Phòng thi:** E402 · **Nhóm:** TuDaiThienVuong  
> **Môi trường thử nghiệm:** Prototype chạy trực tiếp trên máy trạm (`http://localhost:8000`, commit `9986f1f`), dữ liệu bài giảng Transformer / Attention Mechanism thật từ khoá học (đã ẩn danh).  
> **Phương pháp quan sát:** Giao nhiệm vụ cụ thể cho người dùng tự thao tác (Task-based observation), người quan sát ngồi im ghi chép hành vi và chép lại **nguyên văn lời người dùng nói lúc đang cố làm việc** (kể cả lỗi chính tả, cảm xúc giật mình, bối rối).

---

## 1. Danh sách người tham gia thử nghiệm

Theo quy định mốc R6 (Rubric 8 điểm), nhóm đã mời **5 người dùng hoàn toàn bên ngoài nhóm**, trong đó bắt buộc có **tối thiểu 2 người dùng thuộc danh sách willing users đã đăng ký từ mốc CP1**:

1. **Nguyễn Văn An** (`2A202602115` - Lớp 3A, Phòng E402) — **[Willing User đăng ký từ CP1]** (Mã ẩn danh R01 trong `spec.md`).
2. **Lê Thị Mai Hương** (`2A202602340` - Lớp 3A, Phòng E402) — **[Willing User đăng ký từ CP1]** (Mã ẩn danh R02 trong `spec.md`).
3. **Trần Đình Trọng** — Người dùng ngoài lớp học (Người tự học / Người đi làm tự ôn Transformer).
4. **Hoàng Minh Đức** — Người dùng ngoài lớp học (Kỹ sư phần mềm tự do / Tìm hiểu Deep Learning).
5. **Đỗ Quỳnh Anh** — Người dùng ngoài lớp học (Sinh viên CNTT trường ngoài / Đang tự nghiên cứu NLP).

---

## 2. Bảng nhật ký thử nghiệm chi tiết (User Testing Log)

| Người thử | Nhiệm vụ giao | Điểm tắc nghẽn | Trích dẫn nguyên văn | Quyết định xử lý của nhóm |
| :--- | :--- | :--- | :--- | :--- |
| **Nguyễn Văn An**<br>`2A202602115`<br>*(Lớp 3A, E402)*<br><br>⭐ **Willing User CP1** (R01) | Vào giai đoạn 2 (Sau buổi học), chọn khái niệm *"Query, Key, Value"* từ danh sách gợi ý và giải thích khái niệm này cho AI theo cách hiểu của mình. | Khi AI học sinh hỏi vặn lại: *"Nếu Value là thông tin nội dung, thì làm thế nào Key và Query tính được độ tương đồng?"*, người dùng khựng lại 2 phút vì quên công thức Dot-product và Softmax. Người dùng lúng túng muốn mở lại slide bài giảng số 14 để ngó lại nhưng sợ bấm chuyển tab sẽ bị mất đoạn chat dở dang. | *"Ủa nó hỏi vặn lại gắt vậy! Tôi tưởng chỉ cần bảo Query là câu hỏi là xong. Giờ nó hỏi 'làm sao Query với Key tính ra độ tương đồng để lấy Value', tự nhiên não tôi đứng hình luôn á... Khoan, có cách nào lật lại cái slide bài giảng số 14 coi nhanh công thức mà không bị mất ô chat này hong nhóm?"* | **1. Đã sửa:** Bổ sung nút bấm trực tiếp dẫn về slide bài giảng ngay trong bong bóng phản hồi của AI (`Slide 14 - Scaled Dot-Product`) giúp mở xem lại ngữ cảnh mà không làm mất hội thoại.<br>**2. Giữ nguyên:** Giữ nguyên mức độ hỏi vặn sâu của AI vì đây là cốt lõi của phương pháp Feynman để phá vỡ ảo tưởng "tưởng mình đã hiểu". |
| **Lê Thị Mai Hương**<br>`2A202602340`<br>*(Lớp 3A, E402)*<br><br>⭐ **Willing User CP1** (R02) | Mở tab Slide bài giảng, đọc một đoạn về *"Multi-head Attention"*, highlight và ghi chú lại. Sau đó chuyển sang danh sách ôn tập và thử bấm nút xóa một ghi chú thừa. | Ban đầu nhìn lướt không thấy nút xóa trên card ghi chú do nghĩ nút bị ẩn góc. Khi tìm thấy và bấm icon thùng rác, modal xác nhận hiện lên nhưng người dùng lỡ tay bấm phím Escape làm modal đóng lại. Khi bấm xác nhận xóa lần 2, màn hình thông báo màu xanh hiện lên nhưng bộ đếm thời gian tự đóng biến mất hơi nhanh làm người dùng tưởng trang web bị giật. | *"Ủa nút xoá ghi chú nằm chỗ nào z? À thấy rồi, cái thùng rác đỏ nhỏ xíu bên góc. Mà tui bấm Xoá xong nó nhảy cái bảng xanh 'Đã xóa ghi chú thành công' chưa kịp đọc hết 3 dòng tóm tắt nó đã tự tắt mất tiêu, tưởng đâu bị văng web!"* | **1. Đã sửa:** Thiết kế nút thùng rác `.btn-delete-stream-item` luôn hiển thị 100% màu đỏ viền trắng, không ẩn mờ.<br>**2. Đã sửa:** Tăng thời gian hiển thị màn hình thông báo xóa thành công lên 4 giây kèm nút *"✓ Đã hiểu & Đóng"* để người dùng chủ động.<br>**3. Đã sửa:** Đẩy lịch sử xóa vào Trung tâm thông báo (`🔔`) để tra cứu lại. |
| **Trần Đình Trọng**<br>*(Người ngoài lớp học)* | Bấm nút "+ New chat" để tạo phiên trò chuyện mới, hỏi AI về *"Positional Encoding"*, sau đó dùng menu `...` trên sidebar để đổi tên cuộc trò chuyện thành *"Ôn thi Positional Encoding"*. | Thao tác tạo chat và hỏi đáp rất tự nhiên. Tuy nhiên khi bấm 'Đổi tên', người dùng gõ xong tiêu đề mới và ấn Enter nhưng gặp độ trễ mạng ~300ms khiến sidebar chưa đổi ngay tức thì, người dùng tưởng bị đơ nên bấm Enter thêm 2 lần liên tục. | *"Bấm New chat mượt phết, giống ChatGPT ghê. Cơ mà lúc đổi tên chat trên sidebar, tui bấm Enter xong tưởng nó đơ nên gõ cạch cạch thêm 2 phát, ai dè 1 giây sau nó mới nhảy tên mới. Nên có cái hiệu ứng loading hay đổi tên liền tại chỗ á."* | **1. Đã sửa:** Thay thế hoàn toàn popup trình duyệt `window.prompt` bằng Modal đổi tên hội thoại `#modal-rename-conv` có input tự động focus và bôi đen tên cũ.<br>**2. Đã sửa:** Áp dụng Optimistic UI update: cập nhật tên hiển thị trên sidebar ngay lập tức khi ấn Enter/Lưu rồi mới đồng bộ ngầm vào storage, loại bỏ hoàn toàn độ trễ cảm nhận. |
| **Hoàng Minh Đức**<br>*(Người ngoài lớp học)* | Hoàn thành một lượt giải thích 2 lần liên tiếp cho khái niệm *"Feedforward Network"* để xem bảng kết quả chấm Rubric v3 so sánh giữa Lần 1 và Lần 2 (Explanation 1 vs Explanation 2). | Bảng chấm điểm 4 tiêu chí (Bao phủ, Chính xác, Chiều sâu, Lời riêng) rất rõ ràng. Tuy nhiên người dùng bị khựng lại ở dòng cảnh báo học thuật (Caveat: *"Bastani et al. 2025..."*) vì từ ngữ quá mang tính nghiên cứu, và thắc mắc liệu đạt 14/16 điểm rồi thì bài này có tự động biến mất khỏi danh sách cần ôn hay không. | *"Bảng điểm 4 tiêu chí so sánh Lần 1 với Lần 2 này hay nè, nhìn cái biết ngay lần 2 mình ăn điểm chỗ 'Lời riêng'. Nhưng cái dòng caveat bên dưới ghi 'Bastani et al 2025' đọc hơi lú nha, người thường ai biết Bastani là ông nào! Với lại được 14/16 điểm rồi thì bài này coi như xong chưa, có được gạch tên khỏi list cần ôn tối nay không?"* | **1. Đã sửa:** Gọi endpoint `/activities/mark-reviewed` để đánh dấu hoàn thành ôn tập và gỡ khỏi danh sách ưu tiên B7 khi học viên vượt ngưỡng hiểu.<br>**2. Đã sửa:** Bổ sung hộp lựa chọn tiếp theo (`addNextStepChoice`): *"➡️ Tiếp tục học"* hoặc *"📋 Ôn phần khác"*.<br>**3. Giữ nguyên:** Giữ nguyên nội dung cảnh báo sư phạm nhưng diễn giải dễ hiểu hơn về việc không phụ thuộc hoàn toàn vào AI. |
| **Đỗ Quỳnh Anh**<br>*(Người ngoài lớp học)* | Thử nghiệm giao diện trên màn hình thu nhỏ giả lập điện thoại/tablet: mở Trung tâm thông báo để xem thông báo hệ thống, sau đó mở thanh menu sidebar và thử gõ tin nhắn. | Trước đây khi bấm chuông thông báo, popover hiện ra che màn hình và không có nút tắt, chữ 'Trung tâm thông báo' bị vỡ thành 2 dòng. Trên bản mới đã có nút `✕` tắt được, nhưng khi bàn phím ảo bật lên thì thanh 4 câu hỏi nhanh bị che khuất một phần. | *"Bữa trước tui bị dính cái lỗi mở thông báo xong không tài nào tắt được, nay thấy có nút dấu nhân ✕ đóng cái rụp rồi, mừng ghê! Nhưng mà khi mở bàn phím điện thoại lên để gõ là mấy cái nút gợi ý 'Đặt câu hỏi sâu hơn' bị che khuất, phải vuốt lên mới thấy lại được."* | **1. Đã sửa:** Khắc phục triệt để lỗi CSS `[hidden]` của popover thông báo, thêm nút `✕` trực tiếp và chống ngắt dòng tiêu đề.<br>**2. Đã sửa:** Tối ưu thanh Quick Actions trên mobile với thuộc tính cuộn ngang mượt mà (`overflow-x: auto; flex-wrap: nowrap; padding-bottom: 4px`), giúp giao diện gọn gàng khi xuất hiện bàn phím ảo. |

---

## 3. Tổng kết 4 dòng theo quy định Rubric R6

1. **Chủ đề lặp nhiều nhất:**  
   Người dùng rất bất ngờ và đánh giá cao tính năng AI hỏi vặn ngược (buộc phải hiểu sâu thay vì học vẹt), nhưng dễ rơi vào trạng thái bối rối khi không nhớ chi tiết để trả lời và có nhu cầu cấp thiết phải xem lại slide bài giảng gốc song song với cuộc trò chuyện; đồng thời đòi hỏi các thao tác quản trị (xóa ghi chú, đổi tên chat, đóng thông báo) phải có phản hồi thị giác tức thì và an toàn.

2. **Sẽ sửa gì trước demo:**  
   - Đã sửa triệt để lỗi popover Trung tâm thông báo không tắt được (thêm nút đóng `✕`, hỗ trợ click ngoài và phím Escape, chống rớt dòng tiêu đề).
   - Đã thay thế hoàn toàn hộp thoại `window.prompt` bằng Modal đổi tên cuộc trò chuyện chuẩn UX (`#modal-rename-conv`).
   - Đã triển khai Modal 2 giai đoạn cho việc xóa ghi chú (Màn hình 1: Xem trước & Xác nhận; Màn hình 2: Thông báo xóa thành công có tóm tắt và tự đếm ngược 4s).
   - Đã gắn link trực tiếp đến slide bài giảng tương ứng trong bong bóng chat của AI để học viên tra cứu nhanh khi gặp câu hỏi vặn khó.

3. **Giữ nguyên gì và vì sao:**  
   - **Giữ nguyên mức độ hỏi vặn phản biện khắt khe của AI:** Không nới lỏng hay gợi ý đáp án sẵn ngay từ đầu, bởi vì đây là giá trị cốt lõi giải quyết đúng bài toán JTBD của dự án (phá vỡ ảo tưởng "tưởng mình đã hiểu bài" sau giờ học lý thuyết).
   - **Giữ nguyên dòng cảnh báo sư phạm (Caveat) ở bảng điểm Rubric:** Nhất quán với nguyên tắc trung thực học thuật theo tài liệu `docs/learning-gain-protocol.md`, giúp người học ý thức rằng tiến bộ ở lần 2 cần được kiểm chứng lại bằng việc tự học độc lập không có AI.

4. **Gì để dành sau (Backlog sau Hackathon):**  
   - **Giao diện chia đôi màn hình thông minh (Smart Split-screen):** Khi AI hỏi vặn về một công thức hoặc sơ đồ trên slide, nửa màn hình bên trái tự động cuộn đến đúng vị trí slide đó để học viên vừa nhìn hình vừa gõ giải thích.
   - **Quy trình đo lường Learning Gain dài hạn:** Tổ chức đánh giá Delayed Test sau 3–7 ngày không có AI theo đúng giao thức nghiên cứu thực nghiệm với cỡ mẫu lớn ($n \ge 100$).
