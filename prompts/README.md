# 🧠 Kiến Trúc System Prompt — VLearn Smart Learning

Dự án: **VLearn Smart Workflow — Học trên lớp & Ôn tập cá nhân hóa cùng AI**  
Nhóm: **Tứ Đại Thiên Vương** · Batch 04 · Lớp 3A · Phòng E402  
Phân công đảm nhiệm: **Prompt Engineering & Trải nghiệm AI**

---

## 📌 Chuẩn cấu trúc 5 phần bắt buộc

Tất cả các System Prompt trong dự án đều tuân thủ nghiêm ngặt theo chuẩn cấu trúc:
1. **Identity** (Định danh & Vai trò nhân vật)
2. **Rules** (Nguyên tắc ứng xử & Phương pháp sư phạm)
3. **Capabilities** (Năng lực & Dữ liệu được phép truy cập)
4. **Constraints** (Ràng buộc, giới hạn & Xử lý ngoại lệ)
5. **Output format** (Định dạng đầu ra JSON chuẩn gồm các trường: `intent`, `action`, `reply`, `evidence_ids`)

---

## 📁 Danh mục các System Prompt trong hệ thống

| STT | Tên Prompt | Vai trò & Tính năng | Vị trí trong Prototype | Định dạng đầu ra |
|:---:|:---|:---|:---:|:---|
| **1** | [feynman_student_prompt.md](file:///d:/CODE/AITHUCCHIEN/LABS/K4-3A-E402-TuDaiThienVuong/prompts/feynman_student_prompt.md) | **AI Học viên tò mò (Linh hồn sản phẩm)** — Kích hoạt phương pháp Feynman & Socratic: học viên đóng vai Giáo viên dạy lại cho AI | **Bước 8 & 9**<br>*(Sau giờ học)* | JSON: `intent`, `action`, `reply`, `evidence_ids` |
| **2** | [inclass_explain_prompt.md](file:///d:/CODE/AITHUCCHIEN/LABS/K4-3A-E402-TuDaiThienVuong/prompts/inclass_explain_prompt.md) | **AI Giải thích tức thì trên lớp** — Giải thích nhanh khi học viên bôi đen từ trên slide trong giờ học (<150 từ, chuẩn 3 phần) | **Bước 3**<br>*(Trong giờ học)* | JSON: `intent`, `action`, `reply`, `evidence_ids` |
| **3** | [mastery_evaluator_prompt.md](file:///d:/CODE/AITHUCCHIEN/LABS/K4-3A-E402-TuDaiThienVuong/prompts/mastery_evaluator_prompt.md) | **AI Đánh giá Mastery** — Chấm điểm câu trả lời, nâng điểm đánh giá từ 2/5 lên 4/5, nhận xét khích lệ | **Bước 10**<br>*(Sau giờ học)* | JSON: `intent`, `action`, `reply`, `evidence_ids` |

---

## 🎯 Bản đồ luồng trải nghiệm (Flow Mapping)

```mermaid
graph TD
    A["Học trên lớp: Bôi đen text Slide 12"] --> B["Bấm 'Hỏi đáp'"]
    B --> C["Prompt 2: AI Explain tức thời (Bước 3)"]
    A --> D["Bấm 'Ghi chú'"]
    D --> E["Lưu vào Database kèm tự đánh giá 2/5 (Bước 4 & 5)"]
    E --> F["Tối về: Hệ thống tạo danh sách ưu tiên ôn tập (Bước 6 & 7)"]
    F --> G["Prompt 1: Phiên Feynman - Học viên dạy lại cho AI (Bước 8 & 9)"]
    G --> H["Prompt 3: AI Đánh giá Mastery - Nâng điểm lên 4/5 (Bước 10)"]
```
