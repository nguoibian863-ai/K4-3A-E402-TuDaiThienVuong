"""Chạy golden_set_v3.json qua lộ trình 8 bước (plan.md mục 5.1).

Hai nhóm kiểm, đều chạy bằng code nên tái lập được:

- NHÓM TRẠNG THÁI (auto_checks ở đây) — những gì có đáp án cứng: stage, bộ đếm hỏi vặn,
  citation có thật trong slide, verdict đối chiếu, knowledge state, loại câu hỏi thích ứng.
- NHÓM ĐỊNH TÍNH (checks_v3.py) — 4 tiêu chí của plan mục 5.1 về chất lượng lời nói: mirror
  trung thực, hỏi vặn trước khi báo sai, không lộ đáp án, khen cụ thể. Làm bằng so sánh tập
  từ và dò cụm, KHÔNG dùng LLM chấm — lý do ghi trong checks_v3.py.

Một ca chỉ ĐẠT khi không còn lỗi nào ở cả hai nhóm.

Cờ --judge gọi thêm một LLM giám khảo để THAM KHẢO. Kết quả của nó được ghi vào file
nhưng không tính vào tỷ lệ đạt, vì ở model hiện tại nó chấm sai nhiều hơn đúng.

Dùng:
  python eval/run_eval_v3.py              # chạy hết
  python eval/run_eval_v3.py --limit 8    # chạy 8 ca đầu
  python eval/run_eval_v3.py --judge      # kèm ý kiến giám khảo LLM (tham khảo)
"""

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "codebase" / "backend"
sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv

load_dotenv(BACKEND / ".env")

import feynman_v3  # noqa: E402
from llm import call_llm  # noqa: E402
from prompts import get_prompt  # noqa: E402
from slides import find_quote, load_slides  # noqa: E402

from checks_v3 import qualitative_checks  # noqa: E402

GOLDEN = Path(__file__).parent / "golden_set_v3.json"
OUT = Path(__file__).parent / "eval_results_v3.json"


def auto_checks(case: dict, result: dict, slides: dict) -> list[str]:
    """Trả danh sách lỗi. Rỗng = qua tầng máy."""
    want = case.get("expect") or {}
    concept = case["concept"]
    state = result.get("state") or {}
    evidence = result.get("evidence")
    fails: list[str] = []

    if result.get("used_fallback"):
        return ["rơi vào fallback — AI không phản hồi hoặc sai định dạng"]

    if "stage" in want and result.get("stage") != want["stage"]:
        fails.append(f"stage={result.get('stage')}, cần {want['stage']}")

    if want.get("evidence_is_null") and evidence is not None:
        fails.append("lẽ ra không có phần đối chiếu nào")

    if want.get("mirror_is_empty") and (result.get("mirror") or "").strip():
        fails.append("mirror phải rỗng ở lượt mở phiên")

    if want.get("encourage_not_empty") and not (result.get("encourage") or "").strip():
        fails.append("encourage rỗng")

    ev = evidence or {}
    if "evidence_verdict" in want and ev.get("verdict") != want["evidence_verdict"]:
        fails.append(f"verdict={ev.get('verdict')}, cần {want['evidence_verdict']}")

    if "evidence_verdict_in" in want and ev.get("verdict") not in want["evidence_verdict_in"]:
        fails.append(f"verdict={ev.get('verdict')}, cần một trong {want['evidence_verdict_in']}")

    if want.get("evidence_quote_is_null") and (ev.get("quote") or ev.get("citations")):
        fails.append("nói thiếu bằng chứng nhưng vẫn kèm trích dẫn")

    if want.get("citation_must_be_real"):
        # Kiểm TỪNG mục: một trích dẫn bịa lọt lưới là hỏng cả lớp chống bịa nguồn
        for cite in ev.get("citations") or []:
            real = find_quote(cite.get("quote") or "", slides)
            if real is None:
                fails.append(f"trích dẫn không có trong slide (code lẽ ra phải gỡ): {str(cite.get('quote'))[:40]}")
            elif real != cite.get("slide"):
                fails.append(f"số slide lệch: ghi {cite.get('slide')}, thật {real}")

    if want.get("analysis_not_empty"):
        # Phân tích đúng/sai phải có nội dung, và phải tựa được vào dẫn chứng
        points = (ev.get("correct_points") or []) + (ev.get("wrong_points") or [])
        if not points:
            fails.append("không có phân tích đúng/sai nào")
        if points and not (ev.get("citations") or []):
            fails.append("có phân tích nhưng không kèm dẫn chứng slide nào")

    if "wrong_points_min" in want and len(ev.get("wrong_points") or []) < want["wrong_points_min"]:
        fails.append(f"chỉ nêu {len(ev.get('wrong_points') or [])} chỗ chưa chính xác, cần ≥ {want['wrong_points_min']}")

    if "correct_points_min" in want and len(ev.get("correct_points") or []) < want["correct_points_min"]:
        fails.append(f"chỉ nêu {len(ev.get('correct_points') or [])} chỗ đúng, cần ≥ {want['correct_points_min']}")

    if "knowledge_status" in want:
        got = (state.get("knowledge") or {}).get(concept)
        if got != want["knowledge_status"]:
            fails.append(f"trạng thái '{concept}'={got}, cần {want['knowledge_status']}")

    if "probe_count_after" in want:
        got = (state.get("probes") or {}).get(concept, 0)
        if got != want["probe_count_after"]:
            fails.append(f"probes['{concept}']={got}, cần {want['probe_count_after']}")

    if "next_question_type_in" in want:
        got = result.get("next_question_type")
        if got not in want["next_question_type_in"]:
            fails.append(f"next_question_type={got}, cần một trong {want['next_question_type_in']}")

    if "enforced_contains" in want:
        needle = want["enforced_contains"]
        if not any(needle in e for e in result.get("enforced", [])):
            fails.append(f"thiếu ghi nhận cưỡng chế chứa '{needle}'")

    return fails


def judge(case: dict, result: dict, definitions: dict) -> dict | None:
    """Tầng giám khảo — chấm mù tiêu chí định tính. None = ca này không cần chấm."""
    question = case.get("manual_check")
    if not question:
        return None
    payload = {
        "criterion": case["criterion"],
        "criterion_definition": definitions.get(case["criterion"], ""),
        "question": question,
        "learner_said": case.get("input", ""),
        "ai_encourage": result.get("encourage", ""),
        "ai_mirror": result.get("mirror", ""),
        "ai_reply": result.get("reply", ""),
    }
    try:
        _, parsed = call_llm(get_prompt("feynman_v3_judge"), payload, temperature=0)
    except Exception as err:
        return {"verdict": "error", "reason": f"gọi giám khảo lỗi: {err}"}
    if not isinstance(parsed, dict) or parsed.get("verdict") not in ("pass", "fail"):
        return {"verdict": "error", "reason": "giám khảo trả sai định dạng"}
    return parsed


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--judge", action="store_true",
                        help="chạy thêm LLM judge làm ý kiến THAM KHẢO (không quyết định đạt/trượt)")
    args = parser.parse_args()

    spec = json.loads(GOLDEN.read_text(encoding="utf-8"))
    definitions = spec.get("criteria", {})
    cases = spec["test_cases"][: args.limit] if args.limit else spec["test_cases"]

    slides = load_slides(spec.get("lesson_id"))
    print(f"Bài: {spec.get('lesson')}")
    print(f"Slide nạp được: {len(slides)} trang")
    if not slides:
        print("CẢNH BÁO: không có text slide — mọi ca đối chiếu sẽ ra 'thiếu bằng chứng'.")
    print()

    rows, by_criterion = [], defaultdict(lambda: {"pass": 0, "total": 0})
    for case in cases:
        result = feynman_v3.student_reply(
            case["concept"], [], slides, case.get("history", []),
            case.get("input", ""), case.get("state"),
        )
        fails = auto_checks(case, result, slides) + qualitative_checks(case, result)
        # Judge chỉ để tham khảo: gpt-4o-mini chấm mấy tiêu chí này không đáng tin (xem
        # checks_v3.py). Muốn dùng nó để gác thì phải đổi sang model mạnh hơn trước.
        verdict_judge = judge(case, result, definitions) if args.judge else None

        ok = not fails
        by_criterion[case["criterion"]]["total"] += 1
        by_criterion[case["criterion"]]["pass"] += int(ok)
        rows.append({
            "id": case["id"], "criterion": case["criterion"], "pass": ok, "fails": fails,
            "judge": verdict_judge, "stage": result.get("stage"),
            "next_question_type": result.get("next_question_type"),
            "evidence": result.get("evidence"), "enforced": result.get("enforced", []),
            "encourage": result.get("encourage", ""), "mirror": result.get("mirror", ""),
            "reply": result.get("reply", ""), "state": result.get("state"),
        })
        print(f"{'[x]' if ok else '[ ]'} {case['id']:7s} {case['criterion']:26s} {'; '.join(fails)}")

    total = len(rows)
    passed = sum(1 for r in rows if r["pass"])
    rate = passed / total * 100 if total else 0.0

    print(f"\n{'='*74}\nTỔNG: {passed}/{total} ca đạt ({rate:.1f}%)\n")
    print(f"{'Tiêu chí':28s} {'Đạt':>8s}   Tỷ lệ")
    for name in sorted(by_criterion):
        row = by_criterion[name]
        pct = row["pass"] / row["total"] * 100
        print(f"{name:28s} {row['pass']:3d}/{row['total']:<3d}   {pct:5.1f}%")

    OUT.write_text(
        json.dumps({
            "lesson": spec.get("lesson"), "slides_loaded": len(slides),
            "judge_advisory": bool(args.judge),
            "summary": {"pass": passed, "total": total, "rate": round(rate, 1)},
            "by_criterion": {k: dict(v) for k, v in by_criterion.items()},
            "results": rows,
        }, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"\nChi tiết -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
