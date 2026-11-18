"""Management of the serverless GPU functions.

    python -m reelforge.gpu deploy              publish the voice app (RunPod SDK, `rp flash deploy`, from workers/voice)
    python -m reelforge.gpu status              endpoints, active workers, balance, today's spend
    python -m reelforge.gpu balance             RunPod account balance
    python -m reelforge.gpu stop                remove the app (nothing can run or cost anything any more)
    python -m reelforge.gpu costs [--days N]    estimated GPU spend, per day and per function

Nothing costs money at rest: functions scale down to zero workers after 90 s without work. `deploy` and `stop` start no
GPU. RUNPOD_API_KEY comes from the environment, the repository .env or ~/.config/reelforge/secrets.env.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .. import config, costs, secrets
from .client import APPS

ROOT = Path(__file__).resolve().parents[2]
WORKER_DIR = ROOT / "workers" / "voice"
APP = APPS["voice"]
EXCLUDED = ["sox"]          # package without a Linux wheel, see EXCLUDED_FROM_DEPLOYMENT in workers/voice/app.py
GRAPHQL_URL = "https://api.runpod.io/graphql"


def _rp() -> str:
    for candidate in (shutil.which("rp"), str(Path(sys.executable).with_name("rp"))):
        if candidate and Path(candidate).exists():
            return candidate
    raise SystemExit("`rp` command not found: install the RunPod SDK in this venv (pip install 'runpod>=2.3', "
                     "or pip install -e '.[deploy]')")


def _graphql(query: str) -> dict:
    key = os.environ.get("RUNPOD_API_KEY") or ""
    if not key:
        raise SystemExit("RUNPOD_API_KEY is missing (~/.config/reelforge/secrets.env)")
    req = urllib.request.Request(GRAPHQL_URL, data=json.dumps({"query": query}).encode(),
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())["data"]
    except Exception as exc:
        raise SystemExit(secrets.redact(f"RunPod API unreachable: {exc}")) from None


def deploy() -> int:
    print(f"-> deploying {APP} ({WORKER_DIR})")
    cmd = [_rp(), "flash", "deploy", "--python-version", "3.12"]
    if EXCLUDED:
        cmd += ["--exclude", ",".join(EXCLUDED)]
    return subprocess.call(cmd, cwd=WORKER_DIR)


def stop() -> int:
    print(f"-> removing {APP}")
    return subprocess.call([_rp(), "flash", "undeploy", "--app", APP], cwd=WORKER_DIR)


def balance() -> float:
    return float(_graphql("query { myself { clientBalance } }")["myself"]["clientBalance"])


def status() -> int:
    d = _graphql("query { myself { clientBalance currentSpendPerHr endpoints { id name workersMin workersMax "
                 "idleTimeout gpuIds } pods { id name desiredStatus costPerHr } } }")["myself"]
    print(f"balance: {d['clientBalance']:.2f} USD   current spend: {d['currentSpendPerHr']:.3f} USD/h")
    print(f"estimated GPU spend today: {costs.gpu_spend_today():.3f} USD (cap {costs.daily_cap():.2f} USD)")
    for e in d.get("endpoints") or []:
        print(f"  endpoint {e['name']:<40} workers {e['workersMin']}..{e['workersMax']}  "
              f"idle {e['idleTimeout']} s  {e['gpuIds']}")
    pods = d.get("pods") or []
    for p in pods:
        print(f"  WARNING pod {p['name']} ({p['id']}) {p['desiredStatus']} at {p['costPerHr']} USD/h: delete it if "
              "it was forgotten")
    if d["currentSpendPerHr"] and d["currentSpendPerHr"] > 0 and not pods:
        print("  serverless workers are running right now (they stop by themselves after the idle timeout)")
    return 0


def cost_report(days: int) -> int:
    since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    per_day: dict[str, float] = defaultdict(float)
    per_function: dict[str, float] = defaultdict(float)
    for line in costs.Ledger(costs.gpu_ledger_path()).lines():
        if line.get("ts", "") >= since:
            per_day[line["ts"][:10]] += line.get("cost_usd", 0)
            per_function[line.get("function", "?")] += line.get("cost_usd", 0)
    for day in sorted(per_day):
        print(f"{day}  {per_day[day]:.4f} USD")
    for fn, cost in sorted(per_function.items(), key=lambda x: -x[1]):
        print(f"  {fn:<14} {cost:.4f} USD")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m reelforge.gpu", description=__doc__.splitlines()[0],
                                formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__)
    sp = p.add_subparsers(dest="command", required=True)
    sp.add_parser("deploy", help="publish the voice app")
    sp.add_parser("status", help="endpoints, workers, balance, today's spend")
    sp.add_parser("balance", help="RunPod account balance")
    sp.add_parser("stop", help="remove the app")
    c = sp.add_parser("costs", help="estimated GPU spend per day and per function")
    c.add_argument("--days", type=int, default=7)
    return p


def main(argv: list[str] | None = None) -> int:
    config.init_env()               # repository-root .env (same lookup as the main CLI), whatever the current directory
    a = build_parser().parse_args(argv)
    if a.command == "deploy":
        return deploy()
    if a.command == "stop":
        return stop()
    if a.command == "balance":
        print(f"{balance():.2f} USD")
        return 0
    if a.command == "costs":
        return cost_report(a.days)
    return status()


if __name__ == "__main__":
    raise SystemExit(main())
