"""Static guards on the Remotion project (no render): regressions found during the end-to-end render."""

import re
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "studio" / "src"
FRENCH_LETTERS = re.compile("[àâäéèêëîïôöùûüçœ]")
# Files that legitimately hold French text: the French small-word list of the caption line breaker.
ALLOWED = {SRC / "core" / "Captions.tsx"}


def test_fonts_are_gated_by_a_component_not_a_module_side_effect():
    """A module-level delayRender() was reset by remotion/no-react: frames were captured before the fonts were loaded
    and a spurious 'Loading local fonts' timeout fired during the render."""
    fonts = (SRC / "core" / "fonts.tsx").read_text(encoding="utf-8")
    assert "export const FontGate" in fonts
    assert not re.search(r"^[^/\n]*delayRender\(", fonts.split("export const FontGate")[0], re.M)
    # every composition goes through the gate
    root = (SRC / "Root.tsx").read_text(encoding="utf-8")
    assert "FontGate" in root
    for name in ("Reel", "ScenesSheet", "AvatarSheet"):
        assert f"component={{Gated{name}}}" in root
    assert "import './core/fonts'" not in (SRC / "index.ts").read_text(encoding="utf-8")


def test_no_french_left_in_studio_sources():
    offenders = []
    for path in SRC.rglob("*"):
        if path.suffix not in (".ts", ".tsx") or path in ALLOWED:
            continue
        for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if FRENCH_LETTERS.search(line):
                offenders.append(f"{path.relative_to(SRC)}:{n}")
    assert not offenders, offenders[:10]
