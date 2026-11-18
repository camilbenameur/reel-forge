"""The script step: ``new`` writes brief.md, ``script`` asks the LLM for script.json and validates it.

Validation is a JSON-schema check (a small built-in validator, no extra dependency) followed by business rules: estimated
duration, call to action, known scene types, cue words found in the beat text. The cue matching is shared with the timeline
step through ``find_cue``: what validation accepts, the timeline finds.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from . import catalog as catalog_mod
from . import config
from .llm import LLM, LLMError
from .reel import Reel, ReelError, create, write_text_atomic
from .text import base

log = logging.getLogger("reelforge.script")

PROMPT = config.PACKAGE / "prompts" / "script.md"
SCHEMA_PATH = config.PACKAGE / "schemas" / "script.schema.json"
WORDS_PER_MINUTE = 165
DURATION_ERROR_S = (36.0, 58.0)          # outside: error
DURATION_TARGET_S = (38.0, 55.0)         # outside: warning
KEYWORDS_TARGET = (3, 6)
LANGUAGE_NAMES = {"en": "English", "fr": "French"}
CTA_PHRASES = {"en": '"Comment WORD and I send it to you"', "fr": '"Commente MOT et je te l\'envoie" (WORD is MOT)'}
DEFAULT_BRAND = {"en": "(brand/brand.yaml is absent: direct, friendly tone, second person, energetic but calm, teacher-like.)",
                 "fr": "(brand/brand.yaml is absent: direct, friendly tone, informal \"tu\", energetic but calm, teacher-like.)"}
SECTION_RE = re.compile(r"^\d{2} — ")


@dataclass
class Report:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    estimated_duration: float = 0.0
    word_count: int = 0

    @property
    def ok(self) -> bool:
        return not self.errors


# --- schema --------------------------------------------------------------------------------------------------------------

def schema() -> dict[str, Any]:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


def _check(value: Any, sch: dict[str, Any], path: str, out: list[str]) -> None:
    """Subset of JSON Schema used by script.schema.json: type, enum, required, properties, additionalProperties (false or
    a schema), items, min/max items and length, pattern."""
    if "enum" in sch and value not in sch["enum"]:
        out.append(f"{path}: {value!r} is not one of {sch['enum']}")
        return
    t = sch.get("type")
    kinds = {"object": dict, "array": list, "string": str}
    if t in kinds and not isinstance(value, kinds[t]):
        out.append(f"{path}: expected {t}")
        return
    if t == "object":
        for key in sch.get("required", []):
            if key not in value:
                out.append(f"{path}: missing '{key}'")
        props = sch.get("properties", {})
        extra = sch.get("additionalProperties", True)
        for key, item in value.items():
            if key in props:
                _check(item, props[key], f"{path}/{key}", out)
            elif extra is False:
                out.append(f"{path}: unexpected property '{key}'")
            elif isinstance(extra, dict):
                _check(item, extra, f"{path}/{key}", out)
    elif t == "array":
        if len(value) < sch.get("minItems", 0):
            out.append(f"{path}: at least {sch['minItems']} items expected")
        if len(value) > sch.get("maxItems", len(value)):
            out.append(f"{path}: at most {sch['maxItems']} items expected")
        for i, item in enumerate(value):
            if "items" in sch:
                _check(item, sch["items"], f"{path}/{i}", out)
    elif t == "string":
        if len(value) < sch.get("minLength", 0):
            out.append(f"{path}: too short (min {sch['minLength']})")
        if len(value) > sch.get("maxLength", len(value)):
            out.append(f"{path}: too long (max {sch['maxLength']})")
        if "pattern" in sch and not re.search(sch["pattern"], value):
            out.append(f"{path}: does not match {sch['pattern']}")


def schema_errors(script: Any) -> list[str]:
    out: list[str] = []
    _check(script, schema(), "(root)", out)
    return [e[:220] for e in out]


# --- cues ----------------------------------------------------------------------------------------------------------------

def word_tokens(word: str, language: str = "en") -> list[str]:
    """Comparison tokens of ONE displayed word ("twenty-two" -> twenty, two; "22" -> twenty, two)."""
    return base.tokens(base.spoken_text(word, language), language)


def find_cue(trigger: str, words: list[str], language: str = "en") -> int | None:
    """Index (in ``words``, the displayed words of a beat) of the word where ``trigger`` starts, or None if it is not there.

    The comparison runs on flattened tokens that keep the index of their word: a hyphenated word or a number (several
    tokens) is found as a single word. Same function for validation and for the timeline."""
    wanted = word_tokens(trigger, language)
    if not wanted:
        return None
    flat = [(tok, i) for i, w in enumerate(words) for tok in word_tokens(w, language)]
    n = len(wanted)
    for k in range(len(flat) - n + 1):
        if [t for t, _ in flat[k:k + n]] == wanted:
            return flat[k][1]
    return None


def estimated_duration(word_count: int) -> float:
    return word_count * 60.0 / WORDS_PER_MINUTE


def script_language(script: dict[str, Any], default: str | None = None) -> str:
    return config.language(script.get("language") or default)


def validate(script: Any, catalog: dict[str, dict[str, Any]] | None = None, *, duration: bool = True,
             unknown_scenes_are_errors: bool = True, language: str | None = None) -> Report:
    r = Report(errors=schema_errors(script))
    if r.errors:
        return r
    lang = script_language(script, language)
    beats = script["beats"]
    r.word_count = sum(len(base.beat_words(b["text"])) for b in beats)
    r.estimated_duration = estimated_duration(r.word_count)
    if duration:
        lo, hi = DURATION_ERROR_S
        tlo, thi = DURATION_TARGET_S
        if not lo <= r.estimated_duration <= hi:
            r.errors.append(f"estimated duration {r.estimated_duration:.0f} s ({r.word_count} words at {WORDS_PER_MINUTE} "
                            f"words/min) outside {lo:.0f}-{hi:.0f} s")
        elif not tlo <= r.estimated_duration <= thi:
            r.warnings.append(f"estimated duration {r.estimated_duration:.0f} s: target {tlo:.0f}-{thi:.0f} s")
    n_keywords = sum(len(base.keywords(b["text"])) for b in beats)
    if not KEYWORDS_TARGET[0] <= n_keywords <= KEYWORDS_TARGET[1]:
        r.warnings.append(f"{n_keywords} keywords between asterisks (target {KEYWORDS_TARGET[0]} to {KEYWORDS_TARGET[1]})")
    # call to action: "comment WORD" in the last beat (fr: "commente MOT"; both start with "comment")
    last = base.tokens(base.spoken_text(beats[-1]["text"], lang), lang)
    if base.normalize(script["cta_word"]) not in last or not any(t.startswith("comment") for t in last):
        r.errors.append(f"the last beat must contain the call to action \"comment {script['cta_word']}\"")
    for i, b in enumerate(beats):
        scene = b["scene"]
        entry = catalog.get(scene["type"]) if catalog is not None else None
        if catalog is not None and entry is None:
            msg = f"beats/{i}: unknown scene type '{scene['type']}' (known: {', '.join(sorted(catalog))})"
            (r.errors if unknown_scenes_are_errors else r.warnings).append(msg)
        shown = [w.text for w in base.beat_words(b["text"])]
        cues = scene.get("cues") or {}
        for name, trigger in cues.items():
            if find_cue(trigger, shown, lang) is None:
                r.errors.append(f"beats/{i}: trigger word '{trigger}' of cue '{name}' is not in the beat text")
        if entry is not None:
            known_cues = entry.get("cues") or []
            unknown = [c for c in cues if known_cues and c not in known_cues]
            if unknown:
                r.warnings.append(f"beats/{i}: cue(s) {', '.join(unknown)} not listed for scene '{scene['type']}' "
                                  f"(listed: {', '.join(known_cues)})")
            example = entry.get("exampleProps") or {}
            extra = [k for k in scene["props"] if example and k not in example]
            if extra:
                r.warnings.append(f"beats/{i}: prop(s) {', '.join(extra)} not in the example props of '{scene['type']}'")
        if not base.typography_ok(b["text"], lang):
            r.warnings.append(f"beats/{i}: wrong space before punctuation for {LANGUAGE_NAMES[lang]} typography")
        if any(ch.isdigit() for ch in b["text"]):
            r.warnings.append(f"beats/{i}: digits in the spoken text (write numbers in words for the voice)")
        if not SECTION_RE.match(b["section"]):
            r.warnings.append(f"beats/{i}: section label should look like '01 — the hook'")
    if len(beats) > 1 and beats[0]["section"] == beats[-1]["section"]:
        r.warnings.append("all sections carry the same label")
    if sum(1 for b in beats if b.get("theme") == "night") > 1:
        r.warnings.append("more than one 'night' beat (reserve it for one reveal)")
    return r


# --- brief and prompts ------------------------------------------------------------------------------------------------------

def new(topic: str, slug: str | None = None, language: str | None = None) -> Reel:
    """Create brief.md. An existing brief is NEVER overwritten: it carries the writer's notes (to start over, delete it)."""
    lang = config.language(language)
    reel = create(topic, slug)
    brief = reel.path("brief.md")
    if brief.exists():
        log.info("brief.md already exists: %s", reel.name)
        return reel
    reel.folder.mkdir(parents=True, exist_ok=True)
    person = "informal \"tu\"" if lang == "fr" else "second person"
    write_text_atomic(
        brief,
        f"# Reel brief\n\n- **Date**: {date.today().isoformat()}\n- **Topic**: {topic}\n"
        f"- **Language**: {LANGUAGE_NAMES[lang]}, {person}\n- **Format**: vertical reel 1080x1920, 38 to 55 s\n\n"
        "## Notes for the writer\n\n"
        "(Add facts, figures, tools to name, the angle you want and the word to comment. This file is read as is.)\n")
    reel.update_state(topic=topic, created=date.today().isoformat(), language=lang)
    return reel


def _brand(language: str = "en") -> str:
    path = config.paths().brand
    if not path.is_file():
        return DEFAULT_BRAND[language]
    text = path.read_text(encoding="utf-8")
    try:
        import yaml
        yaml.safe_load(text)
    except ImportError:
        pass
    except Exception:
        log.warning("brand.yaml is not readable as YAML: sent as is")
    return text


def _scenes(catalog: dict[str, dict[str, Any]] | None) -> str:
    if catalog is None:
        return ("(scene catalog missing: run `python -m reelforge catalog --export`. Meanwhile pick plausible kebab-case "
                "types; they will be checked later.)")
    lines = []
    for s in catalog.values():
        example = json.dumps(s.get("exampleProps", {}), ensure_ascii=False)
        cues = f"; cues: {', '.join(s['cues'])}" if s.get("cues") else ""
        lines.append(f"- `{s['type']}` — {s.get('description', '')}{cues}\n  exampleProps: {example}")
    return "\n".join(lines)


def build_prompts(brief: str, catalog: dict[str, dict[str, Any]] | None, language: str = "en",
                  feedback: str = "") -> tuple[str, str]:
    template = PROMPT.read_text(encoding="utf-8")
    system, _, user = template.partition("---USER---")
    rules = (config.PACKAGE / "prompts" / f"script_rules.{base.check_language(language)}.md").read_text(encoding="utf-8").strip()
    values = {"{{language_name}}": LANGUAGE_NAMES[language], "{{language_rules}}": rules, "{{cta_phrase}}": CTA_PHRASES[language],
              "{{brand}}": _brand(language), "{{scenes}}": _scenes(catalog),
              "{{schema}}": json.dumps(schema(), ensure_ascii=False, indent=1), "{{brief}}": brief, "{{feedback}}": feedback}
    for key, val in values.items():
        system, user = system.replace(key, val), user.replace(key, val)
    return system.strip(), user.strip()


# --- the step ------------------------------------------------------------------------------------------------------------------

def run(reel: Reel, force: bool = False, language: str | None = None) -> dict[str, Any]:
    """Write script.json (skipped when it is fresh for brief.md, unless ``force``)."""
    out = reel.path("script.json")
    brief = reel.path("brief.md")
    wanted = config.language(language) if language else None
    changed = wanted is not None and wanted != reel.state.get("language", wanted)
    if reel.is_fresh(out, brief) and not force and not changed:
        log.info("script.json is up to date: skipped")
        return reel.read("script.json")
    if changed:
        log.warning("language changed to %s (was %s): script.json is rewritten", wanted, reel.state.get("language"))
    if not reel.exists("brief.md"):
        raise ReelError(f"brief.md missing in {reel.folder} (command `new`)")
    lang = config.language(language or reel.state.get("language"))
    cat = catalog_mod.load()
    stub = config.llm_provider() == "stub"
    system, prompt = build_prompts(brief.read_text(encoding="utf-8"), cat, lang)

    def check(obj: Any) -> list[str]:
        if isinstance(obj, dict):
            obj = {**obj, "language": lang}
        r = validate(obj, cat, unknown_scenes_are_errors=not stub, language=lang)
        for w in r.warnings:
            log.warning("script: %s", w)
        return r.errors

    try:
        obj = LLM(reel, "script").json(system=system, prompt=prompt, validate=check, stub=f"script_stub.{lang}.json")
    except LLMError as exc:
        raise ReelError(str(exc)) from exc
    obj = {**obj, "language": lang}
    reel.write(obj, "script.json")
    reel.mark(out, brief)
    r = validate(obj, cat, unknown_scenes_are_errors=False, language=lang)
    reel.update_state(language=lang, script={"provider": config.llm_provider(), "words": r.word_count,
                                             "estimated_duration": round(r.estimated_duration, 1),
                                             "warnings": r.warnings})
    return obj


def load(reel: Reel) -> dict[str, Any]:
    """Read script.json and check the schema only (later steps do not replay the duration checks)."""
    obj = reel.read("script.json")
    errors = schema_errors(obj)
    if errors:
        raise ReelError("script.json is invalid: " + " ; ".join(errors[:6]))
    return obj


def load_validated(reel: Reel) -> dict[str, Any]:
    """Read script.json and replay ALL business rules: call before any spending (voice, GPU), because the script may have
    been edited by hand after the review. Raises ReelError listing the errors."""
    obj = load(reel)
    r = validate(obj, catalog_mod.load(), language=reel.state.get("language"))      # an unknown scene type is always an error
    if r.errors:
        raise ReelError("script.json refused before any spending: " + " ; ".join(r.errors[:6]))
    return obj
