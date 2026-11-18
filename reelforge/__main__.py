"""Command line: ``python -m reelforge <command>``. Every step is idempotent (``--force`` redoes it).

Steps from ``voice`` to ``package`` are provided by modules ``reelforge.<step>`` exposing ``run(reel, force=False)``; a step
whose module is not there yet reports "not implemented" instead of failing obscurely.
"""

from __future__ import annotations

import argparse
import importlib
import logging
import sys
from typing import Any

from . import __version__, catalog, config, script as script_mod, secrets
from .costs import BudgetExceeded
from .llm import LLMError
from .reel import Reel, ReelError, find

# (command, module, expected output file)
PIPELINE = [("voice", "voice.wav"), ("align", "words.json"), ("mouth", "mouth.json"), ("timeline", "timeline.json"),
            ("render", "render.mp4"), ("check", "qa/report.md"), ("package", "caption.txt")]
STATUS_FILES = [("new", "brief.md"), ("script", "script.json"), *PIPELINE]


def run_step(name: str, reel: Reel, force: bool = False, **options: Any) -> Any:
    """Run one pipeline step through ``reelforge.<name>.run``."""
    try:
        module = importlib.import_module(f"reelforge.{name}")
    except ModuleNotFoundError as exc:
        if exc.name != f"reelforge.{name}":
            raise
        raise ReelError(f"step '{name}' is not implemented yet") from None
    return module.run(reel, force, **options)


def status(reel: Reel) -> str:
    lines = [f"Reel: {reel.name}", f"Folder: {reel.folder}", f"Language: {reel.state.get('language', config.language())}"]
    for command, filename in STATUS_FILES:
        done = reel.path(*filename.split("/")).exists()
        lines.append(f"  [{'x' if done else ' '}] {command:<9} {filename}")
    state = reel.state
    if reel.subscription:
        lines.append(f"  ! written in claude-code test mode ({', '.join(state['llm_subscription'])}): NOT PUBLISHABLE")
    for key in ("script", "voice", "align", "mouth", "timeline", "check"):
        if key in state:
            lines.append(f"  {key}: {state[key]}")
    return "\n".join(lines)


def continue_(reel: Reel, force_voice: bool = False, provider: str | None = None, **options: Any) -> Reel:
    """From the voice to the package, on a reviewed script. The script is fully revalidated BEFORE any spending (it may have
    been edited by hand). Only the voice (paid) is redone on request; other steps redo themselves when their inputs change.
    ``provider`` and the other ``options`` go to the voice step only."""
    script_mod.load_validated(reel)
    for name, _ in PIPELINE:
        if name == "voice":
            run_step(name, reel, force_voice, provider=provider, **options)
        else:
            run_step(name, reel, False)
    return reel


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m reelforge", description="Turn a brief into a vertical short video.")
    p.add_argument("--version", action="version", version=f"reelforge {__version__}")
    p.add_argument("-v", "--verbose", action="store_true", help="show detailed log (DEBUG)")
    sp = p.add_subparsers(dest="command", required=True, metavar="command")

    def reel_arg(parser: argparse.ArgumentParser, force: bool = True) -> None:
        parser.add_argument("reel", nargs="?", default="latest",
                            help="reel folder, name or end of the name ('latest' for the most recent)")
        if force:
            parser.add_argument("--force", action="store_true", help="redo this step even if its output is up to date")

    n = sp.add_parser("new", help="create reels/<date>-<slug>/brief.md (an existing brief is never overwritten)")
    n.add_argument("topic")
    n.add_argument("--slug")
    n.add_argument("--language", choices=config.LANGUAGES, help="reel language (default: REELFORGE_LANGUAGE or en)")
    s = sp.add_parser("script", help="write script.json with the LLM and validate it")
    reel_arg(s)
    s.add_argument("--language", choices=config.LANGUAGES)
    v = sp.add_parser("voice", help="voice.wav (gpu | stub)")
    reel_arg(v)
    v.add_argument("--provider", choices=config.VOICE_PROVIDERS)
    v.add_argument("--split", choices=config.VOICE_SPLITS, help="continuous blocks or one request per beat "
                                                                "(default: the provider's own)")
    v.add_argument("--takes", type=int, help="valid takes kept per block, the best is retained (default 1; 3 or 4 on the GPU)")
    v.add_argument("--rechoose", action="store_true", help="re-score the cached takes and reassemble, without any GPU call")
    for name, help_ in (("align", "words.json (forced alignment)"), ("mouth", "mouth.json (lip-sync keys)"),
                        ("timeline", "timeline.json + copy into studio/public"), ("render", "render.mp4 (Remotion)"),
                        ("package", "caption.txt + cover.jpg")):
        reel_arg(sp.add_parser(name, help=help_))
    ck = sp.add_parser("check", help="technical check of render.mp4, frozen frames, contact sheet")
    reel_arg(ck)
    ck.add_argument("--review", action="store_true", help="add a visual review of the contact sheet by a vision model "
                                                          "(REELFORGE_LLM=api; stub fixture otherwise)")
    a = sp.add_parser("all", help="new -> script, then STOPS for the human review of the script (see --approve-script)")
    a.add_argument("topic")
    a.add_argument("--slug")
    a.add_argument("--language", choices=config.LANGUAGES)
    a.add_argument("--approve-script", action="store_true", help="do not stop: continue to package without a review")
    a.add_argument("--force-script", action="store_true", help="rewrite script.json even if it is up to date")
    a.add_argument("--force-voice", action="store_true", help="redo the voice (paid GPU) even if it is up to date")
    a.add_argument("--provider", choices=config.VOICE_PROVIDERS, help="voice provider (default REELFORGE_VOICE or stub)")
    c = sp.add_parser("continue", help="voice -> package on a reviewed script")
    reel_arg(c, force=False)
    c.add_argument("--force-voice", action="store_true", help="redo the voice (paid GPU) even if it is up to date")
    c.add_argument("--provider", choices=config.VOICE_PROVIDERS, help="voice provider (default REELFORGE_VOICE or stub)")
    st = sp.add_parser("status", help="progress of a reel")
    reel_arg(st, force=False)
    ca = sp.add_parser("catalog", help="list the scene catalog (studio/scenes.catalog.json)")
    ca.add_argument("--export", action="store_true", help="regenerate the catalog from the studio's scene registry first")
    dv = sp.add_parser("design-voice", help="invent the reference voice (VoiceDesign): candidates, best one in voice-reference/")
    dv.add_argument("--description", help="voice description (default: voice-reference/reference.source, else a built-in one)")
    dv.add_argument("--text", help="text the candidates read (default: voice-reference/reference.txt, else a built-in one)")
    dv.add_argument("--seeds", help="comma-separated seeds, 1 to 8 (default 11,23,37,41)")
    gp = sp.add_parser("gpu", help="serverless GPU app: deploy | status | balance | stop | costs",
                       description="Manage the serverless GPU voice app.")
    gp.add_argument("arguments", nargs=argparse.REMAINDER, help="deploy|status|balance|stop|costs [options]")
    return p


def _dispatch(a: argparse.Namespace) -> int:
    cmd = a.command
    if cmd == "gpu":
        from .gpu.__main__ import main as gpu_main
        return int(gpu_main(list(a.arguments)) or 0)
    if cmd == "catalog":
        if a.export:
            print(catalog.export())
        cat = catalog.load()
        if cat is None:
            raise ReelError("no scene catalog: run `python -m reelforge catalog --export`")
        print(f"{len(cat)} scenes in {config.paths().catalog}")
        print(catalog.describe(cat))
        return 0
    if cmd == "new":
        print(script_mod.new(a.topic, a.slug, a.language).folder)
        return 0
    if cmd == "all":
        reel = script_mod.new(a.topic, a.slug, a.language)
        script_mod.run(reel, a.force_script, a.language)
        if not a.approve_script:
            print(f"Script written: {reel.path('script.json')}\nReview it, then: python -m reelforge continue {reel.name}")
            return 0
        continue_(reel, a.force_voice, a.provider)
        print(reel.folder)
        return 0
    if cmd == "design-voice":
        from . import design_voice
        report = design_voice.run(a.description, a.text, a.seeds)
        for c in report["candidates"]:
            score = "?" if c["score"] is None else f"{c['score']:.1f}"
            print(f"seed {c['seed']}: {c['duration_s']} s, score {score}  {c['file']}")
        print(f"retained: seed {report['retained']['seed']} -> {config.paths().voice_reference / 'reference.wav'}")
        return 0
    reel = find(a.reel)
    if cmd == "status":
        print(status(reel))
    elif cmd == "script":
        script_mod.run(reel, a.force, a.language)
    elif cmd == "continue":
        continue_(reel, a.force_voice, a.provider)
    elif cmd == "voice":
        run_step("voice", reel, a.force, provider=a.provider, split=a.split, takes=a.takes, rechoose=a.rechoose)
    elif cmd == "check":
        run_step("check", reel, a.force, review=a.review)
    else:
        run_step(cmd, reel, a.force)
    return 0


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    try:
        args = build_parser().parse_args(argv)
    except SystemExit as exit_:
        return exit_.code if isinstance(exit_.code, int) else 2
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(message)s", stream=sys.stderr,
                        force=True)
    try:
        config.init_env()           # secrets: environment > repo .env > ~/.config/reelforge/secrets.env (never at import)
        return _dispatch(args)
    except (ReelError, LLMError, BudgetExceeded, config.ConfigError) as exc:
        print(secrets.redact(f"Error: {exc}"), file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("interrupted", file=sys.stderr)
        return 130
    except Exception as exc:
        if args.verbose:
            import traceback
            print(secrets.redact(traceback.format_exc()), file=sys.stderr)
        print(secrets.redact(f"error: {exc}"), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
