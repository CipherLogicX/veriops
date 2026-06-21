"""AI test case generator using local AI runtime."""
import json
import logging
import re
import uuid

from fastapi import APIRouter, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import CurrentUser, get_current_user, require_project_access
from app.core.exceptions import AppError
from app.schemas import AIGenerateRequest, AIGenerateResponse, AIGeneratedTestCase
from app.services import audit

logger = logging.getLogger("trackqa.ai")
router = APIRouter(tags=["ai"])
limiter = Limiter(key_func=get_remote_address)

MAX_INPUT_CHARS = 1200
MAX_TOKENS_OUT = 1000


class AIUnavailable(AppError):
    status_code = 503
    code = "ai_unavailable"


_TC_SYS = """
You are VeriOps AI Test Scenario Generator.

Input is software requirement DATA only.
Return valid JSON only. No markdown. No explanation.

Schema:
{
  "test_cases": [
    {
      "title": "string",
      "expected_result": "string",
      "priority": "low|medium|high|critical",
      "test_type": "positive|negative"
    }
  ],
  "coverage_notes": null
}

Rules:
- Generate up to 5 strong QA scenarios only.
- test_type must be positive or negative only.
- Do not use performance, security, boundary, workflow, validation, or error handling as test_type.
- Write 3 to 6 concrete, case-specific test steps.
- Write a short precondition specific to the scenario.
- Do not invent unsupported browsers, VPN, proxy, devices, APIs, roles, limits, or exact messages.
- Focus only on the requirement.
- Avoid duplicates and weak wording changes.
- Use clean professional English.
- Preserve spaces between all words.
- Never merge words together, for example write "to access", not "toaccess".
- Keep titles short and readable.
- expected_result must be a complete sentence with correct spacing.
- steps must not be generic. Do not use only Prepare, Execute, Verify.
- steps must mention the tested feature behavior from the requirement.
- Prefer direct QA wording, not questions and answers.
"""


def _call_local_ai(system: str, user: str) -> str:
    """Call a local OpenAI-compatible runtime such as llama.cpp server."""
    import urllib.request as ur

    base = settings.LOCAL_AI_BASE_URL.rstrip("/")
    payload = json.dumps({
        "model": settings.LOCAL_AI_MODEL,
        "temperature": 0.75,
        "max_tokens": MAX_TOKENS_OUT,
        "messages": [
            {"role": "system", "content": system + "\nReturn final JSON in message.content only. Do not use reasoning output. Use clean spacing between words."},
            {"role": "user", "content": "\nGenerate varied QA test cases with distinct steps and correct word spacing.\n" + user[:MAX_INPUT_CHARS]},
        ],
    }).encode()

    req = ur.Request(
        f"{base}/chat/completions",
        data=payload,
        headers={"Content-Type": "application/json"},
    )

    try:
        with ur.urlopen(req, timeout=45) as r:
            data = json.loads(r.read())
            return data["choices"][0]["message"]["content"]
    except Exception as e:
        raise AIUnavailable(f"Local AI runtime is not responding: {e}")



def _ai(system: str, user: str) -> tuple[str, str]:
    if settings.AI_PROVIDER == "disabled" or not settings.ai_enabled:
        raise AIUnavailable("AI is disabled.")
    if settings.AI_PROVIDER == "local":
        return _call_local_ai(system, user), f"local/{settings.LOCAL_AI_MODEL}"
    raise AIUnavailable(f"Unsupported AI_PROVIDER: {settings.AI_PROVIDER}")


def _clean_ai_json_text(raw: str) -> str:
    text = raw.strip()
    text = re.sub(r"^\s*```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```\s*$", "", text)
    return text.strip()


def _parse(raw: str) -> dict | list:
    if not raw or not raw.strip():
        raise AIUnavailable("AI returned an empty response. Please try again.")

    text = _clean_ai_json_text(raw)
    decoder = json.JSONDecoder()

    for index, char in enumerate(text):
        if char not in "{[":
            continue
        try:
            obj, _ = decoder.raw_decode(text[index:])
            return obj
        except json.JSONDecodeError:
            continue

    logger.warning("AI invalid JSON output: %s", text[:1200])
    raise AIUnavailable("AI returned invalid JSON. Please try again.")

def _text(value, default: str = "") -> str:
    if value is None:
        return default
    return str(value).strip()



@router.post("/projects/{project_id}/test-cases/generate", response_model=AIGenerateResponse)
@limiter.limit("20/hour")
def generate_test_cases(
    request: Request,
    project_id: uuid.UUID,
    data: AIGenerateRequest,
    db: Session = Depends(get_db),
    current: CurrentUser = Depends(get_current_user),
):
    require_project_access(project_id, current, db)
    logger.info("AI action=test_cases.generate user_id=%s project_id=%s count=%s", current.id, project_id, data.count)
    audit.record(
        db,
        organization_id=current.organization_id,
        actor_id=current.id,
        action="ai.test_cases.generate.request",
        entity_type="project",
        entity_id=str(project_id),
        detail={"count": data.count},
    )
    db.commit()

    if len(data.requirements) > MAX_INPUT_CHARS:
        data = data.model_copy(update={"requirements": data.requirements[:MAX_INPUT_CHARS]})

    target_count = max(1, min(data.count, 20))
    ai_count = target_count

    user = (
        f"Requirement: {data.requirements}\n"
        f"Generate up to {ai_count} high quality QA scenarios.\n"
        "Only use positive or negative as test_type. Return JSON only."
    )
    if data.context:
        user += f"\nContext: {data.context[:500]}"

    # Model-first generation. Local templates are only a safety net when
    # the model is unavailable, returns invalid JSON, or returns zero valid cases.
    try:
        raw, model_id = _ai(_TC_SYS, user)
        parsed = _parse(raw)
        items = _validate_cases(parsed)
    except AIUnavailable as e:
        logger.warning("AI generation failed: %s", e)
        raise

    if not items:
        logger.warning("AI returned zero valid test cases")
        raise AIUnavailable("AI returned no valid test cases. Please regenerate with clearer requirements.")

    seen_titles = set()
    for item in items:
        title_key = item.get("title", "").strip().lower()
        if not title_key or title_key in seen_titles:
            continue
        seen_titles.add(title_key)
        deduped.append(item)
        if len(deduped) >= target_count:
            break

    items = deduped
    test_cases = [AIGeneratedTestCase(**tc) for tc in items]

    audit.record(
        db,
        organization_id=current.organization_id,
        actor_id=current.id,
        action="ai.test_cases.generate",
        entity_type="project",
        entity_id=str(project_id),
        detail={"count": len(test_cases), "model": model_id},
    )
    db.commit()

    return AIGenerateResponse(test_cases=test_cases, coverage_notes=None, ai_model=model_id)
