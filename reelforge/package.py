"""The ``package`` step: caption.txt (caption + hashtags + AI disclosure) and cover.jpg (the hook frame, taken from render.mp4).

The AI disclosure is computed from the reference voice: ``voice-reference/reference.source`` describes an invented voice (no
person cloned); a reference excerpt without that file is assumed to be a real person's voice whose consent is on record;
without any excerpt (stub voice) the disclosure stays generic. It never claims consent for an invented voice.
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
- [ ] Licences of media (music, fonts, images) noted
- [ ] Caption and call-to-action word proofread
"""


def reference_kind() -> str:
    """Nature of the reference voice: "invented" (reference.source describes a voice created by AI), "cloned" (an excerpt
    without reference.source: a person's voice, whose consent is assumed to be on record) or "unknown" (no excerpt)."""
    folder = config.paths().voice_reference
    if (folder / "reference.source").is_file():
        return "invented"
    if (folder / "reference.wav").is_file():
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
