# Báo cáo lộ trình 8 bước — plan.md giai đoạn 1→3

**Bài học đo trên:** Buổi 3 — Prompt Engineering, mô hình tạo sinh ảnh và video (100 slide)
**Model:** `gpt-4o-mini` · **Bộ đo:** `eval/golden_set_v3.json`, 37 ca, 11 tiêu chí

## 1. Kết quả

| Lượt chạy | Đạt | Tỷ lệ |
|---|---|---|
| Lượt 1 (32 ca) | 32/32 | 100,0% |
| Lượt 2 (32 ca, chạy lại độc lập) | 32/32 | 100,0% |
| Lượt 3 (33 ca, thêm bước 8) | 32/33 | 97,0% |
| Lượt 4 (33 ca, sau khi sửa bộ kiểm mirror) | 33/33 | 100,0% |
| Lượt 5-9 (37 ca, trong lúc thêm phân tích đúng/sai) | 32-33/37 | 86,5-89,2% |
| Lượt 10 (37 ca, sau khi sửa thứ tự luật cứng) | 37/37 | 100,0% |
| Lượt 11-12 (37 ca, xác nhận) | 36/37 | 97,3% — cùng trượt `mirror_trung_thuc` |
| **Lượt 13-15 (37 ca, sau khi hiệu chỉnh bộ kiểm mirror)** | **37/37 · 37/37 · 37/37** | **100,0%** |

| Tiêu chí (plan mục 5.1) | Đạt |
|---|---|
| mirror_trung_thuc | 4/4 |
| probe_truoc_khi_bao_sai | 4/4 |
| khong_lo_dap_an | 4/4 |
| gioi_han_2_luot_hoi_van | 3/3 |
| citation_chinh_xac | 4/4 |
| nhan_biet_thieu_evidence | 4/4 |
| phan_loai_dung | 4/4 |
| cau_hoi_thich_ung | 3/3 |
| khen_cu_the | 2/2 |
| teach_again | 1/1 |
| phan_tich_dung_sai | 4/4 |

**Đọc con số này cho đúng.** Đầu ra LLM dao động thật: trong quá trình làm đã có lượt chỉ
đạt 86,5%, và các ca trượt KHÁC NHAU giữa các lượt. Ba lượt sạch liên tiếp ở cấu hình cuối
(lượt 13-15) là bằng chứng ổn định, không phải bảo chứng.

100% ở đây nghĩa là **các luật cứng đã bịt được những lỗi đã biết**, không có nghĩa là hệ
thống hết lỗi — bộ đo chỉ thấy được thứ nó có ca kiểm tra, và mục 3c nói rõ một lớp lỗi bộ
đo này CỐ TÌNH không bắt.

Và con số này hoàn toàn không nói gì về việc người học có hiểu bài hơn hay không. Đó là
phép đo khác, cần người thật — xem `docs/learning-gain-protocol.md`.

## 2. Vòng lặp tinh chỉnh (plan mục 6 giai đoạn 3)

Bảng này là lịch sử thật: mỗi dòng là một lỗi do bộ đo bắt được, không phải danh sách soạn sẵn.

| # | Bộ đo bắt được gì | Nguyên nhân thật | Sửa ở đâu |
|---|---|---|---|
| 1 | Trần 2 lượt hỏi vặn không bao giờ kích hoạt | Bộ đếm bị xoá mỗi lượt vì AI xếp trạng thái `unclear`, mà code lại reset khi trạng thái khác `misconception` | `feynman_v3.py` — chỉ reset khi khái niệm **tiến bộ** khỏi `misconception` |
| 2 | Ép chuyển bước 5 nhưng không có trích dẫn nào | Code đổi cờ `stage` *sau khi* AI đã soạn xong câu hỏi vặn | Tách bước 5 thành lời gọi riêng `## feynman_v3_evidence` |
| 3 | Nhét chỉ thị "bắt buộc đối chiếu" vào cùng prompt vẫn trượt | Hội thoại 6 lượt neo model lại ở chế độ hỏi vặn, chỉ thị trong cùng prompt không thắng nổi | Prompt riêng, một việc duy nhất |
| 4 | Khái niệm đã gỡ xong vẫn kẹt ở `misconception` | Kết quả bước 5 không dội lại bước 6 | Ánh xạ verdict → trạng thái, kèm nhánh `incomplete` khi trước đó đang nhầm |
| 5 | AI chào mở phiên dù người học đã giảng | Model tự chọn `opening` bất chấp cờ `session_start` | Luật cứng 0 trong `student_reply` |
| 6 | Lời giảng rỗng nghĩa ("ừm thì cái đó đó") vẫn được chấm `incomplete` | Model bám từ khoá rồi trích một đoạn slide bất kỳ | Chặn bằng `MIN_CLAIM_WORDS` + bộ từ đệm |
| 7 | Bị hỏi ngược thì AI trả `reply` rỗng → rơi vào fallback | Prompt v3 thiếu hẳn phần xử lý input không phải lời giảng, vốn có trong prompt v2 | Bổ sung 3 trường hợp (hỏi ngược / xã giao / lạc đề) + cấm `reply` rỗng |
| 8 | Lượt mở phiên trả `reply` rỗng, lặp lại 2/2 lần | Prompt nói đặt `mirror` rỗng nhưng không nói lời mời nằm ở trường nào | Chỉ rõ lời mời vào `reply`, liệt kê giá trị cho mọi trường |
| 9 | Mirror viết "nhưng thực tế nó là..." — đính chính hộ người học | Prompt cấm "sửa đẹp" nhưng không cấm cụ thể cụm chuyển ý | Cấm đích danh các cụm đính chính + bước tự kiểm thuật ngữ |
| 10 | Cùng khái niệm nằm ở hai khoá `Negative prompt` / `negative prompt` | Không gom tên khái niệm về dạng chuẩn | `_canonical()` — gom theo casefold |
| 11b | Câu hỏi vặn chép nguyên định nghĩa trong slide | Prompt hỏi vặn được cấp nội dung slide nên chép thẳng ra — đúng thứ mục 4.3 cấm | Bỏ hẳn slide khỏi prompt bước 4; slide chỉ dùng ở bước 5 |
| 12 | Model dồn cả câu về "sai", không bao giờ điền phần đúng | Được tự chọn thùng thì một mệnh đề sai kéo theo cả câu | Bắt tách từng mệnh đề (`clauses`), code gom nhóm và suy ra verdict |
| 13 | Hỏi LoRA lại trả về slide bìa | Truy hồi cộng dồn từ phổ thông; slide trùng 8 từ chung chung thắng slide trùng đúng từ khoá | idf bình phương + bỏ từ có mặt ở quá nửa bộ slide |
| 14 | Slide ngắn (bìa, tiêu đề) leo lên đầu mọi truy vấn | Chuẩn hoá độ dài chia thẳng cho sqrt(độ dài), thổi slide ngắn lên | Chuẩn hoá kiểu BM25 |
| 15 | Từ "neo" bị chọn nhầm thành "gì", "cứng" | Lấy từ hiếm nhất trong câu làm neo, trúng phải từ lẻ vô nghĩa | Neo theo TÊN KHÁI NIỆM đang xét (`anchor=concept`) + mở rộng stopword tiếng Việt |
| 16 | Thấy slide có chữ "Train a LoRA" là kết luận định nghĩa LoRA đúng | Model suy diễn từ việc slide nhắc tên | Luật chống suy diễn: "correct" đòi slide PHÁT BIỂU điều đó |
| 17 | Luật hạ "đúng nhưng cụt" và luật bước 8 không có tác dụng | **Lỗi thứ tự của code**: chạy sau khi state đã ghi xong | Chuyển hai luật lên trước vòng cập nhật bước 6 |
| 18 | Một câu đúng ở lượt đầu là kết thúc luôn phiên | Luật bước 8 không đòi phiên phải có qua lại | Thêm `MIN_TURNS_BEFORE_TEACH_AGAIN` |
| 19 | Câu xã giao ("cái đó mình nắm rồi") hạ một khái niệm ĐÃ HIỂU xuống "chưa rõ" | Vòng cập nhật bước 6 tin knowledge_state của AI kể cả khi lượt đó không sinh bằng chứng nào | Chỉ cho đổi trạng thái khi lượt này thực sự có verdict về khái niệm đó |
| 20 | Mirror trung thực bị chấm trượt lặp lại 2/2 lượt | **Lỗi của bộ kiểm lần hai, chiều ngược lại**: ngưỡng giữ-lại 60% phạt oan việc diễn đạt lại bằng từ đồng nghĩa ("xịn nhất" → "chất lượng cao nhất" chỉ trùng 50%) | Hạ ngưỡng xuống 35%, ghi rõ giới hạn của phép đo |
| 11 | Mirror diễn đạt lại trung thực bị chấm trượt | **Lỗi của bộ kiểm, không phải của AI**: đo độ trùng khít từ ngữ, trong khi bước 3 của plan cho phép diễn giải lại | `checks_v3.py` — đổi sang đo độ giữ lại nội dung + dò cụm đính chính |

Hai lỗi nặng nhất về hậu quả với người dùng thật:

- **Lỗi 10** — hai khoá song song (`Negative prompt` / `negative prompt`) làm knowledge state
  hiện trùng dòng **và** bộ đếm hỏi vặn đếm riêng từng khoá, nên trần 2 lượt không bao giờ
  chạm tới trong phiên thật.
- **Lỗi 19** — người học nói một câu xã giao là mất luôn tiến độ của một khái niệm đã chứng
  minh được. Trạng thái tụt mà không có bằng chứng nào mới, người học không hiểu vì sao.

Cả hai đều chỉ lộ ra nhờ có ca kiểm đúng chỗ, không phải nhờ đọc code.

## 3. Vì sao 4 tiêu chí định tính không do LLM chấm

Ban đầu có `## feynman_v3_judge` cho LLM chấm mirror / hỏi vặn / lộ đáp án / khen. Kết quả
đối chiếu tay: **sai 5/5 ca đầu tiên**.

- Với mirror "CFG Scale càng cao thì ảnh càng đẹp, nếu kéo max thì được ảnh xịn nhất",
  giám khảo trích đúng cụm **có trong lời người học** rồi kết luận "AI thêm ý mới".
- Giám khảo phạt câu xác nhận "Có đúng ý thầy/cô không?" — thứ chính plan bước 3 yêu cầu.
- Câu "Nghi ngờ thì cho fail" trong prompt giám khảo đẩy nó fail mọi thứ.

Sửa prompt giám khảo (bắt buộc trích tang chứng, liệt kê thứ không tính là vi phạm) có đỡ
hơn nhưng vẫn sai: nó tiếp tục trích những cụm nằm sẵn trong lời người học. `gpt-4o-mini`
sinh thì được, nhưng làm phép so sánh hai đoạn văn để phán "có thêm ý không" thì không đủ.

Nên 4 tiêu chí này chuyển sang kiểm tất định trong `eval/checks_v3.py`:

| phan_tich_dung_sai | Phân tích phải có nội dung VÀ phải kèm ≥1 trích dẫn đã kiểm; đếm tối thiểu số mục đúng/sai với các ca nửa đúng nửa sai |

Bảng kiểm định tính:

| Tiêu chí | Cách kiểm |
|---|---|
| mirror_trung_thuc | Độ giữ lại ≥ 35% từ nội dung người học nói, cộng dò cụm đính chính ("nhưng thực tế", "đúng ra"...). **Giới hạn đã biết** ở mục 3c |
| probe_truoc_khi_bao_sai | Phải có `?`; không được chứa cụm phán quyết |
| khong_lo_dap_an | Dò trùng cụm ≥ 6 từ giữa câu hỏi và trích dẫn slide |
| khen_cu_the | Encourage phải trùng ≥ 2 từ nội dung với lời người học; chặn khen suông; tối đa 1 câu |

Cách này vừa đúng bản chất (mấy tiêu chí này là phép so sánh chuỗi), vừa tái lập được —
chạy lại cho cùng kết quả, không tốn lời gọi API. Cờ `--judge` vẫn giữ để lấy ý kiến LLM
làm tham khảo, nhưng **không tính vào tỷ lệ đạt**.

## 3b. Cách bước 5 tách đúng/sai

Người dùng yêu cầu câu trả lời phải nêu **phần nào đúng, phần nào sai, vì sao**, và **dẫn
chứng trong slide**. Cách làm:

1. **Model tách mệnh đề, không tự dán nhãn tổng.** Prompt `feynman_v3_evidence` trả về
   `clauses`: mỗi mệnh đề trong lời giảng kèm verdict riêng (`correct` / `wrong` /
   `not_in_slides`) và một câu `why` nêu căn cứ. Để model tự chọn "phần đúng / phần sai"
   thì nó dồn cả câu về một phía — một mệnh đề sai kéo theo cả câu.
2. **Code gom nhóm và suy ra verdict** (`_fold_clauses`). `not_in_slides` KHÔNG vào nhóm
   "chưa chính xác": slide im lặng thì không phải người học sai.
3. **`missing_points`** giữ nhánh "đúng nhưng thiếu" — ý cốt lõi slide có dạy mà người học
   chưa nhắc tới.
4. **Mọi trích dẫn kiểm từng mục** (`_apply_evidence_rules`). Trích bịa bị gỡ riêng lẻ,
   trích thật còn lại vẫn giữ. Hết sạch trích dẫn thì cả phân tích bị hạ xuống "không đủ
   bằng chứng" — phân tích không còn căn cứ thì không được hiện ra như có căn cứ.

Hai luật giữ thế cân bằng, thiếu một trong hai là lệch hẳn:
- **Chống suy diễn:** thấy slide nhắc TÊN khái niệm chưa đủ để nói người học đúng.
- **Chống né tránh:** slide CÓ mô tả khái niệm và mô tả khác hẳn thì phải gọi là sai,
  không được né sang "slide không nói tới".

## 3c. Một giới hạn thật của bộ kiểm mirror

Tiêu chí "mirror trung thực" bị sửa **hai lần, theo hai chiều ngược nhau**, và cả hai lần
đều là lỗi của phép đo chứ không phải của AI:

- Lần đầu đo **độ trùng khít** (phạt từ mới) → chấm trượt mirror diễn đạt lại trung thực.
- Sửa sang đo **độ giữ lại** ngưỡng 60% → vẫn chấm trượt, vì mirror dùng từ đồng nghĩa
  ("ảnh xịn nhất" → "hình ảnh chất lượng cao nhất") chỉ trùng khoảng 50% từ.

Nguyên nhân gốc: **đếm trùng từ không phân biệt được "diễn đạt lại" với "đánh rơi một mệnh
đề"**. Hai hành vi rất khác nhau về mặt sư phạm lại cho cùng một con số.

Cách xử lý hiện tại và phần chấp nhận đánh đổi:

| Bắt được chắc chắn | Không bắt được |
|---|---|
| Mirror thay hẳn bằng nội dung khác (giữ lại < 35%) | Mirror rơi một mệnh đề giữa câu mà phần còn lại diễn đạt lại |
| Mirror chen cụm đính chính ("nhưng thực tế", "đúng ra") | |
| Mirror rỗng | |

Ngưỡng để thấp là lựa chọn có chủ đích: thà lọt một số ca rơi ý còn hơn phạt oan chính hành
vi đúng mà plan yêu cầu. Muốn bắt được việc rơi ý thì phải so sánh ngữ nghĩa — cần model đủ
mạnh để làm giám khảo, xem mục 3.

## 4. Phân vai AI và code

Code không chấm điểm hộ AI; code **cưỡng chế** các luật của plan mục 4 và ghi lại mọi lần
can thiệp vào trường `enforced`, hiện thẳng lên UI.

| Luật (plan) | Ai lo |
|---|---|
| Vai người nghe, không giảng thay (4.1) | Prompt |
| Chỉ dùng slide làm chuẩn (4.2) | `slides.py` nạp + truy hồi theo nội dung |
| Không đưa đáp án ở bước 4 (4.3) | Prompt + `checks_v3.py` |
| Mirror trung thực (4.4) | Prompt + `checks_v3.py` |
| Citation thật (4.5) | **Code** — `verify_citation()`, trích bịa bị gỡ, verdict hạ xuống "không đủ bằng chứng" |
| Tối đa 2 lượt hỏi vặn (4.6) | **Code** — bộ đếm trong state |
| Khen ngắn và cụ thể (4.7) | Prompt + `checks_v3.py` |
| Cập nhật knowledge state (4.8) | **Code** — gom tên khái niệm, ánh xạ verdict, chuỗi thành thạo |

## 5. Chạy lại

```bash
# Nạp lại text slide nếu đổi bộ slide
python codebase/backend/extract_slides.py data/<file>.pdf

# Chạy bộ đo
python eval/run_eval_v3.py            # cả 37 ca
python eval/run_eval_v3.py --limit 8  # chạy nhanh
python eval/run_eval_v3.py --judge    # kèm ý kiến LLM (tham khảo)
```

Kết quả chi tiết từng ca ghi ra `eval/eval_results_v3.json`.

## 6. Còn thiếu so với plan

| Mục | Trạng thái |
|---|---|
| Mục 6 GĐ1 — prototype | Xong: prompt 8 bước, knowledge state 3 mức, nạp slide làm context |
| Mục 6 GĐ2 — golden set | **37 ca**, plan đặt mục tiêu 30–50 → đã vào khoảng |
| Mục 6 GĐ3 — tinh chỉnh | Xong: 20 vòng sửa ở mục 2 |
| Mục 6 GĐ4 — thử nghiệm người dùng | **Chưa chạy** — giao thức ở `docs/learning-gain-protocol.md` |
| Mục 6 GĐ5 — mở rộng | **Chưa làm**: knowledge tracing xác suất (BKT), nhiều bộ slide, điều chỉnh số lượt probe theo trình độ |
| Mục 3 bước 8 — TEACH AGAIN | Code + prompt + ca kiểm V3_33 đã có. UI chưa có nút kích hoạt riêng (AI tự chuyển khi mọi khái niệm đã `understood`) |
| Mục 5.2 — rubric | Xong, chạy thật qua `/feynman/v3/rubric`; chưa có ca golden set |
