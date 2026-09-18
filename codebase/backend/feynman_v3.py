"""Chatbot học bằng cách dạy — lộ trình 8 bước theo plan.md.

TEACH -> ENCOURAGE -> MIRROR -> SOCRATIC PROBE -> EVIDENCE CHECK
      -> KNOWLEDGE GAP -> NEXT QUESTION -> (lặp) -> TEACH AGAIN

Phân vai rõ: AI đề xuất nội dung sư phạm, CODE cưỡng chế các luật cứng của plan mục 4
(giới hạn 2 lượt hỏi vặn, citation phải có thật, loại câu hỏi phải khớp knowledge state).
Mọi lần code sửa đầu ra của AI đều ghi vào "enforced" để UI và golden set nhìn thấy được.

Hàm thuần, không phụ thuộc DB — main.py nạp ngữ cảnh rồi truyền vào.
"""

from embeddings import semantic_relevant_slides
from llm import call_llm
from prompts import get_prompt
from slides import context_for_prompt, relevant_slides, verify_citation

STATUSES = {"understood", "unclear", "misconception"}  # hiểu · chưa rõ · đang nhầm
STAGES = {"opening", "mirror_probe", "evidence_check", "teach_again"}
QUESTION_TYPES = {"clarification", "why", "challenge", "transfer"}
VERDICTS = {"correct", "incomplete", "wrong", "insufficient_evidence"}

MAX_PROBES_PER_GAP = 2  # plan mục 4.6 — quá số này phải chuyển sang đối chiếu slide
MAX_TURNS = 16
REPLY_TEMPERATURE = 0.4

NO_EVIDENCE_LINE = "Tài liệu hiện tại không đủ bằng chứng để xác nhận ý này."

# Dưới ngưỡng này thì lời giảng chưa mang khẳng định nào để đem đi đối chiếu
MIN_CLAIM_WORDS = 3
# Dưới ngưỡng này thì lời giảng dù đúng vẫn còn quá cụt để gọi là "đã hiểu" (plan bước 6)
MIN_WORDS_FOR_UNDERSTOOD = 8
# Phiên phải có ít nhất ngần này lượt giảng rồi mới được chuyển sang mời giảng lại (bước 8)
MIN_TURNS_BEFORE_TEACH_AGAIN = 2


# Từ đệm / từ trỏ mơ hồ — có mặt nhưng không mang nội dung nào để đem đi đối chiếu
FILLER_WORDS = {
    "ừm", "ờ", "à", "ừ", "thì", "cái", "đó", "gì", "kiểu", "đại", "khái", "chắc",
    "hình", "như", "kia", "ấy", "vậy", "nọ", "đại khái",
}


def _claim_content_words(claim: str) -> set[str]:
    from slides import STOPWORDS, _normalize

    return {
        w for w in _normalize(claim).split()
        if len(w) >= 2 and w not in STOPWORDS and w not in FILLER_WORDS
    }


def _to_turns(history: list[dict]) -> list[dict]:
    """teacher = người học (vai user), student = AI (vai assistant)."""
    turns = []
    for item in history or []:
        if not isinstance(item, dict):
            continue
        role = "assistant" if item.get("role") == "student" else "user"
        turns.append({"role": role, "content": item.get("content")})
    return turns


def _clean_state(state: dict | None) -> dict:
    """Nhận state do client giữ giữa các lượt, lọc sạch trước khi tin (plan bước 6)."""
    state = state if isinstance(state, dict) else {}

    def _counts(raw) -> dict[str, int]:
        return {
            str(k): int(v)
            for k, v in (raw or {}).items()
            if isinstance(v, int) and not isinstance(v, bool) and v >= 0
        }

    knowledge = {str(k): v for k, v in (state.get("knowledge") or {}).items() if v in STATUSES}
    return {
        "knowledge": knowledge,
        "probes": _counts(state.get("probes")),
        "streak": _counts(state.get("streak")),
    }


def _validate(data: dict) -> bool:
    if not isinstance(data, dict):
        return False
    if data.get("stage") not in STAGES:
        return False
    if not isinstance(data.get("reply"), str) or not data["reply"].strip():
        return False
    gaps = data.get("knowledge_state")
    if not isinstance(gaps, list):
        return False
    for gap in gaps:
        if not isinstance(gap, dict) or not isinstance(gap.get("concept"), str):
            return False
        if gap.get("status") not in STATUSES:
            return False
    return True


def _canonical(name: str, state: dict, concept: str) -> str:
    """Gom các cách viết khác nhau của cùng một khái niệm về một khoá.

    AI lúc trả "Negative prompt", lúc "negative prompt". Không gom lại thì cùng một khái
    niệm nằm ở hai khoá: knowledge state hiện hai dòng trùng nhau, và bộ đếm hỏi vặn đếm
    riêng từng khoá nên trần 2 lượt không bao giờ chạm tới.
    """
    key = (name or "").strip()
    if not key:
        return key
    folded = key.casefold()
    for existing in list(state["knowledge"]) + list(state["probes"]) + [concept]:
        if existing and existing.casefold() == folded:
            return existing
    return key


def _question_type_for(status: str, streak: int) -> str:
    """Bảng bước 7: trạng thái khái niệm -> loại câu hỏi tiếp theo."""
    if status in ("misconception", "unclear"):
        return "clarification"
    if streak <= 1:
        return "why"
    if streak == 2:
        return "challenge"
    return "transfer"


def _check_against_slides(concept: str, slides: dict, claim: str) -> dict:
    """Bước 5 chạy như một lời gọi riêng, chỉ làm đúng việc đối chiếu slide.

    Kết quả vẫn đi qua _apply_evidence_rules nên citation bịa vẫn bị gỡ như thường.
    """
    if not slides or not (claim or "").strip():
        return _blank_evidence()
    # Lời giảng rỗng nghĩa ("ừm thì cái đó đó") thì không có KHẲNG ĐỊNH nào để đối chiếu.
    # Không chặn ở đây thì model bám lấy mỗi từ khoá rồi trích một đoạn slide bất kỳ và
    # chấm "incomplete", nghe như người học đã nói được điều gì đó.
    if len(_claim_content_words(claim)) < MIN_CLAIM_WORDS:
        return _blank_evidence("Em chưa nhận được nội dung giảng nào đủ rõ để đối chiếu với slide ạ.")
    # Chỉ đưa slide liên quan tới claim. Lưu ý: citation vẫn được kiểm lại với TOÀN BỘ bộ
    # slide ở _apply_evidence_rules, nên thu hẹp ở đây không làm lọt trích dẫn hợp lệ.
    payload = {
        "concept": concept,
        "claim": claim,
        "slides": context_for_prompt(relevant_slides(
            concept + " " + claim, slides, k=16, anchor=concept, semantic_fallback=semantic_relevant_slides,
        )),
    }
    try:
        _, parsed = call_llm(get_prompt("feynman_v3_evidence"), payload, temperature=0.1)
    except Exception:
        return _blank_evidence()
    if not isinstance(parsed, dict):
        return _blank_evidence()
    return _fold_clauses(parsed)


# Ngưỡng cố tình để thấp: phép đo này chỉ đếm trùng từ nên KHÔNG phân biệt được "diễn đạt
# lại" với "đánh rơi ý". Mirror trung thực mà dùng từ đồng nghĩa ("xịn nhất" -> "chất
# lượng cao nhất") chỉ trùng ~50%. Đặt cao thì phạt oan chính hành vi đúng, nên chỉ để đủ
# bắt trường hợp mirror thay hẳn bằng nội dung khác.
MIN_MIRROR_RECALL = 0.35


def _mirror_recall(said: str, mirror: str) -> float:
    """Tỷ lệ nội dung lời người học còn giữ được trong mirror."""
    words = _claim_content_words(said)
    if not words:
        return 1.0
    return len(words & _claim_content_words(mirror)) / len(words)


def _remirror(said: str) -> str | None:
    """Soạn lại riêng phần mirror khi lượt chính phản chiếu thiếu.

    Cùng cách đã dùng cho bước 5: prompt chuyên một việc thì không bị cả đoạn hội thoại
    kéo đi. Với câu nhiều mệnh đề, lượt chính hay chỉ nhắc mệnh đề cuối rồi bỏ phần đầu.
    """
    try:
        _, parsed = call_llm(get_prompt("feynman_v3_mirror"), {"said": said}, temperature=0)
    except Exception:
        return None
    mirror = parsed.get("mirror") if isinstance(parsed, dict) else None
    if not isinstance(mirror, str) or not mirror.strip():
        return None
    # Chỉ nhận nếu bản mới thực sự đầy đủ hơn — không thì giữ bản cũ còn hơn đổi bừa
    return mirror if _mirror_recall(said, mirror) >= MIN_MIRROR_RECALL else None


CLAUSE_VERDICTS = {"correct", "wrong", "not_in_slides"}


def _fold_clauses(parsed: dict) -> dict:
    """Gom từng mệnh đề thành hai nhóm và SUY RA verdict, thay vì tin nhãn model tự dán.

    Để model tự chọn "correct_points" / "wrong_points" thì nó dồn cả câu về một phía: mệnh
    đề đúng nằm cạnh một mệnh đề sai là bị kéo theo. Bắt nó xét riêng từng mệnh đề rồi để
    code phân loại thì mỗi phần được cân nhắc độc lập.
    """
    correct, wrong = [], []
    for clause in parsed.get("clauses") or []:
        if not isinstance(clause, dict):
            continue
        text = (clause.get("text") or "").strip()
        why = (clause.get("why") or "").strip()
        verdict = clause.get("verdict")
        if not text or verdict not in CLAUSE_VERDICTS:
            continue
        line = f"{text} — {why}" if why else text
        if verdict == "correct":
            correct.append(line)
        elif verdict == "wrong":
            wrong.append(line)
        # "not_in_slides" không vào nhóm nào: slide im lặng thì không phải đúng, cũng
        # không phải sai — đưa vào "chưa chính xác" là vu cho người học

    missing = [
        x.strip() for x in (parsed.get("missing_points") or [])
        if isinstance(x, str) and x.strip()
    ]

    if wrong:
        verdict = "wrong"
    elif correct:
        # Đúng hết nhưng còn bỏ sót ý cốt lõi thì chưa phải là đã nắm trọn khái niệm
        verdict = "incomplete" if missing else "correct"
    else:
        verdict = "insufficient_evidence"

    note = parsed.get("note")
    return {
        "verdict": verdict,
        "correct_points": correct,
        "wrong_points": wrong,
        "missing_points": missing,
        "citations": parsed.get("citations") if isinstance(parsed.get("citations"), list) else [],
        "slide": None,
        "quote": None,
        "note": note.strip() if isinstance(note, str) and note.strip() else NO_EVIDENCE_LINE,
    }


def _blank_evidence(note: str = NO_EVIDENCE_LINE) -> dict:
    return {
        "verdict": "insufficient_evidence",
        "slide": None,
        "quote": None,
        "citations": [],
        "correct_points": [],
        "wrong_points": [],
        "missing_points": [],
        "note": note,
    }


DUPLICATE_POINT_OVERLAP = 0.7


def _reconcile_verdict(evidence: dict, enforced: list[str]) -> None:
    """Bắt verdict phải khớp với chính phần phân tích đúng/sai.

    Model hay tự mâu thuẫn: xếp cùng một mệnh đề vào cả hai danh sách rồi chốt "wrong".
    Hậu quả thật là người học vừa tự sửa đúng vẫn bị ghim ở "đang nhầm". Ở đây:
      1. Bỏ mục "sai" nào thực chất lặp lại một mục "đúng" (chê cách diễn đạt, không phải mâu thuẫn).
      2. Suy lại verdict từ hai danh sách còn lại.
    """
    correct = evidence.get("correct_points") or []
    wrong = evidence.get("wrong_points") or []

    def words(text: str) -> set[str]:
        return _claim_content_words(text)

    kept = []
    for item in wrong:
        tokens = words(item)
        if tokens and any(
            len(tokens & words(ok)) / len(tokens) >= DUPLICATE_POINT_OVERLAP for ok in correct
        ):
            enforced.append("bỏ một mục 'chưa chính xác' thực chất lặp lại mục đã đúng")
            continue
        kept.append(item)
    evidence["wrong_points"] = kept

    verdict = evidence.get("verdict")
    if not kept and correct and verdict in ("wrong", "incomplete"):
        evidence["verdict"] = "correct"
        enforced.append("không còn chỗ nào lệch slide -> verdict '" + str(verdict) + "' đổi thành 'correct'")
    elif kept and verdict == "correct":
        evidence["verdict"] = "incomplete"
        enforced.append("còn chỗ chưa khớp slide -> verdict 'correct' hạ thành 'incomplete'")


def _apply_evidence_rules(parsed: dict, slides: dict, enforced: list[str]) -> None:
    """Bước 5 + plan mục 7: mọi trích dẫn phải khớp chuỗi trong slide đã nạp, không thì gỡ.

    Kiểm TỪNG mục trong "citations": trích bịa bị loại riêng lẻ, các trích dẫn thật còn lại
    vẫn được giữ. Hết sạch trích dẫn thì cả nhận định bị hạ xuống "không đủ bằng chứng" —
    phân tích đúng/sai mà không còn căn cứ nào thì không được phép hiện ra như có căn cứ.
    """
    if parsed.get("stage") != "evidence_check":
        parsed["evidence"] = None
        return

    evidence = parsed.get("evidence")
    if not isinstance(evidence, dict):
        parsed["evidence"] = _blank_evidence()
        enforced.append("AI không kèm phần đối chiếu -> chuyển 'không đủ bằng chứng'")
        return

    if evidence.get("verdict") not in VERDICTS:
        evidence["verdict"] = "insufficient_evidence"
        enforced.append("verdict sai giá trị -> 'không đủ bằng chứng'")

    if not slides:
        if evidence["verdict"] != "insufficient_evidence":
            enforced.append("chưa nạp được text slide cho bài này -> không xác nhận được citation")
        parsed["evidence"] = _blank_evidence()
        return

    verified, dropped, renumbered = [], 0, 0
    for item in evidence.get("citations") or []:
        if not isinstance(item, dict):
            dropped += 1
            continue
        ok, real_slide = verify_citation(item.get("slide"), item.get("quote") or "", slides)
        if not ok:
            dropped += 1
            continue
        if real_slide != item.get("slide"):
            renumbered += 1
        verified.append({"slide": real_slide, "quote": item.get("quote")})

    if dropped:
        enforced.append(f"gỡ {dropped} trích dẫn không có trong slide (nghi bịa)")
    if renumbered:
        enforced.append(f"sửa số trang cho {renumbered} trích dẫn AI ghi nhầm")

    if not verified:
        kept_note = evidence.get("note") if evidence["verdict"] == "insufficient_evidence" else None
        parsed["evidence"] = _blank_evidence(kept_note or NO_EVIDENCE_LINE)
        if evidence["verdict"] != "insufficient_evidence":
            enforced.append("không còn trích dẫn nào đứng vững -> bỏ phân tích, hạ xuống 'không đủ bằng chứng'")
        return

    evidence["citations"] = verified
    # Giữ slide/quote đơn cho phần hiển thị gọn và cho các chỗ đọc theo schema cũ
    evidence["slide"] = verified[0]["slide"]
    evidence["quote"] = verified[0]["quote"]
    _reconcile_verdict(evidence, enforced)
    parsed["evidence"] = evidence


def student_reply(
    concept: str,
    evidence: list[dict],
    slides: dict,
    history: list[dict],
    message: str,
    state: dict | None = None,
) -> dict:
    """Một lượt của lộ trình 8 bước. Trả kèm state mới để client gửi lại ở lượt sau."""
    message = (message or "").strip()
    state = _clean_state(state)
    enforced: list[str] = []

    payload = {
        "concept": concept,
        "evidence": evidence,
        # CỐ Ý không đưa nội dung slide vào lượt hỏi vặn. Plan tách bước 4 (tự suy luận)
        # khỏi bước 5 (đối chiếu): có slide trong tay thì model chép thẳng định nghĩa vào
        # câu hỏi, thành ra lộ đáp án — đúng thứ mục 4.3 cấm. Slide chỉ dùng ở bước 5.
        "knowledge_state": [{"concept": k, "status": v} for k, v in state["knowledge"].items()],
        "probe_counts": state["probes"],
        "max_probes_per_gap": MAX_PROBES_PER_GAP,
        "session_start": not message and not history,
        "has_slides": bool(slides),
    }
    turns = _to_turns(history)[-MAX_TURNS:]
    if message:
        turns.append({"role": "user", "content": message})

    try:
        _, parsed = call_llm(
            get_prompt("feynman_v3_reply"),
            payload,
            temperature=REPLY_TEMPERATURE,
            turns=turns,
        )
    except Exception:
        return _fallback("Em chưa nghe rõ (AI không phản hồi). Thầy/cô gửi lại giúp em nhé.", state)

    if not _validate(parsed):
        # Thử lại một lần ở temperature 0 trước khi bỏ cuộc: lỗi định dạng ở đây thường là
        # trường rỗng lẻ tẻ, mà rơi vào fallback thì người học mất hẳn một lượt.
        enforced.append("AI trả sai định dạng -> gọi lại một lần")
        try:
            _, parsed = call_llm(
                get_prompt("feynman_v3_reply"), payload, temperature=0, turns=turns,
            )
        except Exception:
            parsed = None
        if not _validate(parsed):
            return _fallback("Em chưa hiểu ý thầy/cô lắm (AI trả sai định dạng). Thầy/cô gửi lại nhé.", state)

    target = parsed.get("probe_target")
    target = target.strip() if isinstance(target, str) and target.strip() else None
    if target:
        target = _canonical(target, state, concept)
    # Gom tên khái niệm AI trả về ngay từ đầu, trước khi mọi luật cứng đụng tới
    for gap in parsed["knowledge_state"]:
        gap["concept"] = _canonical(gap.get("concept", ""), state, concept)

    # --- Luật cứng 0: "opening" chỉ dành cho lượt mở phiên ---
    # Thầy/cô đã giảng mà vẫn chào hỏi như chưa nghe gì là lỗi nặng nhất về mặt trải nghiệm.
    if parsed["stage"] == "opening" and not payload["session_start"]:
        parsed["stage"] = "mirror_probe"
        enforced.append("AI chào mở phiên dù thầy/cô đã giảng -> ép về lượt phản chiếu + hỏi vặn")

    # --- Luật cứng bước 3: mirror phải phản chiếu ĐỦ lời người học (plan mục 4.4) ---
    if message and parsed["stage"] != "opening":
        if _mirror_recall(message, parsed.get("mirror") or "") < MIN_MIRROR_RECALL:
            fixed = _remirror(message)
            if fixed:
                parsed["mirror"] = fixed
                enforced.append("mirror phản chiếu thiếu ý -> soạn lại cho đủ")
            else:
                enforced.append("mirror phản chiếu thiếu ý (chưa soạn lại được)")

    # --- Bước 5 là BẮT BUỘC mỗi lượt có lời giảng (plan mục 3 bước 5) ---
    # Sơ đồ 8 bước chạy tuyến tính: mọi vòng đều đi qua EVIDENCE CHECK. Để AI tự quyết có
    # đối chiếu hay không thì phần lớn lượt trôi qua mà không có căn cứ nào từ slide.
    # Chạy như lời gọi riêng: prompt chuyên một việc, không bị hội thoại dài neo lại vào
    # chế độ hỏi vặn như khi nhét chỉ thị vào cùng prompt.
    if message and parsed["stage"] != "opening":
        checked = {
            "stage": "evidence_check",
            "evidence": _check_against_slides(concept, slides, message),
        }
        _apply_evidence_rules(checked, slides, enforced)
        parsed["evidence"] = checked["evidence"]
    else:
        parsed["evidence"] = None

    # --- Luật cứng 1: tối đa 2 lượt hỏi vặn cho cùng một lỗ hổng (plan mục 4.6) ---
    if parsed["stage"] == "mirror_probe" and target:
        if state["probes"].get(target, 0) >= MAX_PROBES_PER_GAP:
            enforced.append(
                "đã hỏi vặn " + str(MAX_PROBES_PER_GAP) + " lượt về khái niệm này"
                " -> dừng hỏi vặn, chốt bằng căn cứ slide"
            )
            parsed["stage"] = "evidence_check"
            note = (parsed.get("evidence") or {}).get("note")
            if note:
                parsed["reply"] = note  # lời đáp phải là kết luận, không phải câu hỏi nữa
        else:
            state["probes"][target] = state["probes"].get(target, 0) + 1

    # --- Bước 5 -> bước 6: kết quả đối chiếu slide phải dội lại knowledge state ---
    # Không nối hai bước này thì trạng thái khái niệm vẫn là cái AI đoán TRƯỚC khi đối
    # chiếu, và lỗ hổng đã gỡ xong vẫn kẹt ở "misconception".
    verdict = (parsed.get("evidence") or {}).get("verdict")
    checked_concept = _canonical(target or concept, state, concept)
    if verdict and checked_concept:
        # "incomplete" nghĩa là đã đúng hướng nhưng còn thiếu ý -> không còn là hiểu sai nữa.
        # Thiếu nhánh này thì người học tự sửa xong vẫn bị ghim ở "misconception".
        was_wrong = state["knowledge"].get(checked_concept) == "misconception"
        mapped = {"correct": "understood", "wrong": "misconception"}.get(verdict)
        if verdict == "incomplete" and was_wrong:
            mapped = "unclear"
        if mapped:
            found = False
            for gap in parsed["knowledge_state"]:
                if gap["concept"].strip() == checked_concept:
                    found = True
                    if gap["status"] != mapped:
                        enforced.append(
                            "đối chiếu slide cho verdict '" + verdict + "' -> đặt trạng thái " + mapped
                        )
                        gap["status"] = mapped
            if not found:
                # AI quên khai khái niệm vừa được đối chiếu -> tự bổ sung, nếu không bước 6
                # sẽ bỏ sót đúng cái vừa kiểm chứng
                parsed["knowledge_state"].append({"concept": checked_concept, "status": mapped})
                enforced.append("bổ sung '" + checked_concept + "' vào knowledge state theo kết quả đối chiếu")

    # --- "understood" đòi hỏi giảng ĐÚNG VÀ ĐỦ RÕ, không chỉ đúng ---
    # Bước 5 chỉ kiểm được đúng/sai so với slide. Một câu đúng nhưng cụt lủn ("steps là số
    # bước khử nhiễu") vẫn ra verdict "correct", mà theo plan bước 6 thì đó mới là "chưa rõ".
    # Chỉ hạ đúng khái niệm vừa được đối chiếu ở lượt này — không đụng các khái niệm đã
    # hiểu từ những lượt trước, và cũng không áp khi lượt này không phải lời giảng.
    if verdict in ("correct", "incomplete") and len(_claim_content_words(message)) < MIN_WORDS_FOR_UNDERSTOOD:
        for gap in parsed["knowledge_state"]:
            if gap["concept"].strip() == checked_concept and gap["status"] == "understood":
                gap["status"] = "unclear"
                enforced.append("lời giảng đúng nhưng còn cụt -> hạ '" + gap["concept"] + "' xuống 'chưa rõ'")

    # --- Bước 6: cập nhật knowledge state ---
    # Lượt này có thực sự sinh bằng chứng về khái niệm nào không? Câu xã giao, câu hỏi
    # ngược, câu lạc đề đều không. Không có cái cổng này thì một câu như "cái đó mình nắm
    # rồi" cũng đủ để AI hạ một khái niệm đã hiểu xuống, xoá mất tiến độ người học đã có.
    graded_this_turn = verdict in ("correct", "incomplete", "wrong")
    for gap in parsed["knowledge_state"]:
        name = gap["concept"].strip()
        if not name:
            continue
        previous = state["knowledge"].get(name)
        if previous and not graded_this_turn and gap["status"] != previous:
            enforced.append(
                "lượt này không có căn cứ mới -> giữ nguyên trạng thái '" + name + "'"
            )
            gap["status"] = previous
        state["knowledge"][name] = gap["status"]
        if gap["status"] == "understood":
            state["streak"][name] = state["streak"].get(name, 0) + 1 if previous == "understood" else 1
        else:
            state["streak"][name] = 0
        # Reset bộ đếm hỏi vặn khi khái niệm TIẾN BỘ khỏi "đang nhầm" — hiểu lầm đã được gỡ
        # thì trần 2 lượt cho hiểu lầm đó cũng hết hiệu lực. Lưu ý phải là tiến bộ thật:
        # "unclear" -> "unclear" mà cũng reset thì trần không bao giờ chạm tới.
        improved = previous == "misconception" and gap["status"] != "misconception"
        if gap["status"] == "understood" or improved:
            state["probes"].pop(name, None)

    # --- Luật cứng bước 8: mọi lỗ hổng đã gỡ xong thì phải mời giảng lại ---
    # Chỉ áp khi phiên đã có qua lại thực sự. Không có chặn này thì một câu đúng ở lượt
    # đầu tiên là kết thúc luôn phiên dạy lại, chẳng kiểm được gì.
    taught_turns = sum(1 for m in (history or []) if isinstance(m, dict) and m.get("role") != "student")
    if (
        taught_turns >= MIN_TURNS_BEFORE_TEACH_AGAIN
        and state["knowledge"]
        and all(v == "understood" for v in state["knowledge"].values())
        and parsed["stage"] != "teach_again"
    ):
        parsed["stage"] = "teach_again"
        enforced.append("mọi khái niệm đã hiểu -> chuyển sang mời giảng lại toàn bộ (bước 8)")

    # --- Luật cứng 3: loại câu hỏi phải khớp knowledge state (bảng bước 7) ---
    focus = target or (parsed["knowledge_state"][0]["concept"] if parsed["knowledge_state"] else None)
    if focus:
        expected = _question_type_for(
            state["knowledge"].get(focus, "unclear"), state["streak"].get(focus, 0)
        )
        if parsed.get("next_question_type") != expected:
            if parsed.get("next_question_type") in QUESTION_TYPES:
                enforced.append(
                    "loại câu hỏi không khớp trạng thái khái niệm -> đổi thành " + expected
                )
            parsed["next_question_type"] = expected

    # --- Luật cứng 4: lượt hỏi vặn phải là câu hỏi, không phải lời giảng thay ---
    if parsed["stage"] == "mirror_probe" and "?" not in parsed["reply"]:
        enforced.append("lượt hỏi vặn không chứa câu hỏi nào -> đánh dấu để golden set soi")

    parsed["probe_target"] = target
    parsed["state"] = state
    parsed["enforced"] = enforced
    parsed["used_fallback"] = False
    parsed.setdefault("mirror", "")
    parsed.setdefault("encourage", "")
    return parsed


RUBRIC_DIMENSIONS = ("coverage", "accuracy", "depth", "own_words")
RUBRIC_TEMPERATURE = 0.2
LEARNING_GAIN_CAVEAT = (
    "Điểm lần 2 cao hơn CHƯA đủ kết luận người học tiến bộ: họ có thể chỉ đang nhắc lại lời "
    "AI vừa nói. Cần bài kiểm tra muộn (3-7 ngày), làm không có AI, có câu hỏi chuyển giao."
)


# Ngưỡng "đã hiểu, có thể chuyển tiếp" sau khi chấm rubric bước 8 (giảng lại). accuracy
# bắt buộc tuyệt đối (không cho 3 chiều còn lại bù vào) — tổng điểm cao mà vẫn còn hiểu
# lầm (accuracy thấp) không được coi là đã hiểu, đúng tinh thần LEARNING_GAIN_CAVEAT.
NEXT_STEP_TOTAL_THRESHOLD = 10
NEXT_STEP_MIN_ACCURACY = 4


def decide_next_step(explanation_scores: dict) -> dict:
    """Từ điểm rubric của 1 lần giảng (đã có "total"), quyết định nên mời ôn thêm khái
    niệm này hay có thể chuyển tiếp sang khái niệm/chủ đề khác.
    """
    total = explanation_scores.get("total")
    accuracy = explanation_scores.get("accuracy")
    can_advance = (
        isinstance(total, int) and not isinstance(total, bool)
        and isinstance(accuracy, int) and not isinstance(accuracy, bool)
        and total >= NEXT_STEP_TOTAL_THRESHOLD
        and accuracy >= NEXT_STEP_MIN_ACCURACY
    )
    message = (
        "Bạn đã hiểu — có thể chuyển sang khái niệm/chủ đề khác."
        if can_advance
        else "Nên ôn thêm khái niệm này trước khi chuyển tiếp."
    )
    return {"can_advance": can_advance, "message": message}


def _validate_rubric(data: dict) -> bool:
    if not isinstance(data, dict):
        return False
    for key in ("explanation_1", "explanation_2"):
        scores = data.get(key)
        if not isinstance(scores, dict):
            return False
        for dim in RUBRIC_DIMENSIONS:
            value = scores.get(dim)
            if not isinstance(value, int) or isinstance(value, bool) or not (0 <= value <= 4):
                return False
    for key in ("misconceptions_1", "misconceptions_2"):
        value = data.get(key)
        if not isinstance(value, list) or not all(isinstance(x, str) for x in value):
            return False
    return True


def rubric_score(concept: str, slides: dict, explanation_1: str, explanation_2: str) -> dict:
    """Mục 5.2 — chấm Explanation 1 và Explanation 2 trên cùng rubric 4 chiều.

    "delta" luôn được tính lại bằng code thay vì tin số AI trả về, và caveat của mục 5.3
    luôn được gắn kèm để không ai đọc delta như bằng chứng learning gain.
    """
    payload = {
        "concept": concept,
        "slides": context_for_prompt(relevant_slides(
            concept + " " + explanation_2, slides, k=12, anchor=concept, semantic_fallback=semantic_relevant_slides,
        )),
        "explanation_1": explanation_1,
        "explanation_2": explanation_2,
    }
    try:
        _, parsed = call_llm(get_prompt("feynman_v3_rubric"), payload, temperature=RUBRIC_TEMPERATURE)
    except Exception:
        parsed = None
    if parsed is None or not _validate_rubric(parsed):
        return {
            "explanation_1": None,
            "explanation_2": None,
            "misconceptions_1": [],
            "misconceptions_2": [],
            "delta": None,
            "caveat": LEARNING_GAIN_CAVEAT,
            "next_step": None,
            "used_fallback": True,
        }
    total_1 = sum(parsed["explanation_1"][d] for d in RUBRIC_DIMENSIONS)
    total_2 = sum(parsed["explanation_2"][d] for d in RUBRIC_DIMENSIONS)
    parsed["explanation_1"]["total"] = total_1
    parsed["explanation_2"]["total"] = total_2
    parsed["delta"] = total_2 - total_1
    parsed["caveat"] = LEARNING_GAIN_CAVEAT
    parsed["next_step"] = decide_next_step(parsed["explanation_2"])
    parsed["used_fallback"] = False
    return parsed


def _fallback(reply: str, state: dict) -> dict:
    return {
        "stage": None,
        "encourage": "",
        "mirror": "",
        "reply": reply,
        "probe_target": None,
        "evidence": None,
        "knowledge_state": [{"concept": k, "status": v} for k, v in state["knowledge"].items()],
        "next_question_type": None,
        "state": state,
        "enforced": [],
        "used_fallback": True,
    }
