"""The ``package`` step: caption.txt (caption + hashtags + AI disclosure) and cover.jpg (the hook frame, taken from render.mp4).

The AI disclosure is computed from the reference voice: ``voice-reference/reference.source`` describes an invented voice (no
person cloned). The caption states that a voice was cloned with consent ONLY when ``voice-reference/reference.consent`` exists
(a note the publisher writes: who, when, where the written consent is kept); an excerpt without either file, or no excerpt at
all (stub voice), gets the neutral "generated voice" disclosure. Nothing here ever claims a consent the repository cannot show.
"""

from __future__ import annotations

import logging
import subprocess

from . import config, media
from .reel import Reel, ReelError, write_text_atomic
from .script import load

log = logging.getLogger("reelforge.package")

DISCLOSURES = {
    "en": {
        "invented": "Made with the help of AI: AI-invented voice (no real person imitated) and generated animation.",
        "cloned": "Made with the help of AI: voice cloned with the consent of the person concerned and generated animation.",
        "unknown": "Made with the help of AI: generated voice and animation.",
    },
    "fr": {
        "invented": "Contenu réalisé avec l'aide de l'IA : voix inventée par une IA (aucune personne réelle imitée) et animation générée.",
        "cloned": "Contenu réalisé avec l'aide de l'IA : voix clonée avec l'accord de la personne concernée et animation générée.",
        "unknown": "Contenu réalisé avec l'aide de l'IA : voix et animation générées.",
    },
}
COVER_AT_S = 1.0     # the hook illustration is in place, the hook caption is visible

COMPLIANCE = """# Publication compliance

Boxes to tick by hand by the person who publishes, after watching render.mp4. No tool ticks them.

- [ ] AI label: tick it in the platform at publication (AI-invented voice, generated mascot and illustrations)
- [ ] Voice consent: the reference voice is invented (no person cloned) or the written consent of the person is on record
      (then say so in voice-reference/reference.consent: the caption claims consent only when that file exists)
- [ ] Licences of media (music, fonts, images) noted
- [ ] Caption and call-to-action word proofread
"""


def reference_kind() -> str:
    """Nature of the reference voice, from the files next to reference.wav:
    "invented" (reference.source: a voice created by AI), "cloned" (reference.consent: the publisher recorded the consent of
    the person) or "unknown" (no excerpt, or an excerpt with no provenance file: nothing is claimed about it)."""
    folder = config.paths().voice_reference
    if not (folder / "reference.wav").is_file():
        return "unknown"
    if (folder / "reference.source").is_file():
        return "invented"
    if (folder / "reference.consent").is_file():
        return "cloned"
    return "unknown"


def disclosure(language: str = "en", kind: str | None = None) -> str:
    """AI disclosure of the caption, computed from the reference: never "cloned with consent" for an invented voice."""
    return DISCLOSURES[config.language(language)][kind or reference_kind()]


def caption(script: dict, language: str = "en") -> str:
    return "\n\n".join([script["caption"].strip(), " ".join(script["hashtags"]), disclosure(language)]) + "\n"


def write_compliance(reel: Reel) -> None:
    """Create qa/compliance.md if missing; never overwrite it (the boxes are ticked by a human)."""
    path = reel.path("qa", "compliance.md")
    if not path.exists():
        write_text_atomic(path, COMPLIANCE)


def run(reel: Reel, force: bool = False) -> dict:
    script = load(reel)
    language = reel.language
    out = reel.path("caption.txt")
    current = disclosure(language)
    disclosure_ok = out.is_file() and current in out.read_text(encoding="utf-8")        # the reference may have changed
    if not reel.is_fresh(out, reel.path("script.json")) or not disclosure_ok or force:
        write_text_atomic(out, caption(script, language))
        reel.mark(out, reel.path("script.json"))
    write_compliance(reel)
    cover = reel.path("cover.jpg")
    video = reel.path("render.mp4")
    warnings = []
    if video.exists():
        if not reel.is_fresh(cover, video) or force:
            try:
                media.run([media.find_binary("ffmpeg"), "-y", "-v", "error", "-ss", f"{COVER_AT_S}", "-i", str(video),
                           "-frames:v", "1", "-q:v", "2", str(cover)])
            except media.MediaError as exc:
                raise ReelError(f"cover extraction failed: {str(exc)[:300]}") from exc
            if not cover.exists():
                raise ReelError("cover extraction failed: no image written")
            reel.mark(cover, video)
    else:
        warnings.append("render.mp4 missing: no cover (run `render`, then `package`)")
    result = {"caption": "caption.txt", "cover": "cover.jpg" if cover.exists() else None, "warnings": warnings,
              "disclosure": reference_kind()}
    reel.update_state(package=result)
    return result
