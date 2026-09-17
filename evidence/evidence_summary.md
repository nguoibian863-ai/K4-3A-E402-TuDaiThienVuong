# Evidence summary

## Phạm vi

- Mục tiêu cần kiểm chứng: Kiểm chứng nhu cầu ôn tập sau giờ học và khoảng cách giữa cảm giác “đã hiểu” với khả năng tự giải thích, tái tạo kiến thức, từ đó làm cơ sở cho trải nghiệm “Dạy lại cho AI”.
- Nhóm người dùng: Học viên/sinh viên có hoạt động tự học hoặc ôn lại kiến thức ngoài giờ lên lớp qua VLearn, slide, video, AI, bạn học hoặc giảng viên.
- Phương pháp: Khảo sát trực tuyến ẩn danh bằng Google Forms, kết hợp câu hỏi lựa chọn và câu hỏi mở.
- Thời gian: 2026-09-17 đến 2026-09-17.
- Cỡ mẫu hợp lệ: n = 24; riêng câu hỏi về khả năng tự giải thích lại kiến thức có 23 câu trả lời hợp lệ.

## Kết quả chính

| Phát hiện | Số người | Tỷ lệ | Bằng chứng tham chiếu |
|---|---:|---:|---|
| Có tự học/ôn lại kiến thức trên VLearn ngoài giờ lên lớp | 20/24 | 83,3% | `survey_results.csv`, Q1 |
| Có cảm giác “không chắc” hoặc “khó tự giải thích lại kiến thức vừa học” mà không nhìn tài liệu | 15/24 | 62,5% | `survey_results.csv`, Q3 |
| 54,2% chọn “không biết phần nào là trọng tâm”, 50,0% chọn “nội dung kéo dài qua nhiều slide”, và 100% sẵn sàng thử AI đóng vai học viên, hỏi ngược | 13/24; 12/24; 24/24 | 54,2%; 50,0%; 100,0% | `survey_results.csv`, Q4; Q5 |

## Quyết định thiết kế

1. Tỷ lệ tự học/ôn lại ngoài giờ lên lớp rất cao (83,3%) cho thấy ôn tập sau buổi học là ngữ cảnh thực tế cần được hỗ trợ. Vì vậy, prototype nên được thiết kế cho giai đoạn sau giờ học, thay vì chỉ là chatbot hỏi đáp ngay trong lớp.

2. Hơn một nửa người trả lời cho thấy họ “không chắc” hoặc “khó tự giải thích lại kiến thức” mà không nhìn tài liệu, đồng thời 100% sẵn sàng thử trải nghiệm AI đóng vai học viên và hỏi ngược. Điều này dẫn đến quyết định thiết kế cơ chế Teach-back: người học phải giải thích bằng lời của mình, AI đặt câu hỏi phản biện và phản hồi dựa trên bằng chứng trong lời giải thích.

## Giới hạn

- Mẫu khảo sát: Cỡ mẫu hiện tại còn nhỏ (n = 24), chưa đủ để đạiển diện cho toàn bộ học viên VLearn.
- Điều chưa kiểm chứng: Khảo sát cho thấy nhu cầu và mức độ sẵn sàng, nhưng chưa chứng minh tính năng “Dạy lại cho AI” thực sự giúp người học hiểu sâu hơn hoặc ghi nhớ lâu hơn.
- Bước validation tiếp theo: Cho người dùng thử một phiên Teach-back trên prototype: chọn nội dung cần ôn → giải thích cho AI → nhận câu hỏi ngược → trả lời → nhận phản hồi; sau đó quan sát liệu họ có nhận ra điểm thiếu sót, chỉnh sửa lời giải thích và xác định rõ hơn phần cần xem lại hay không.