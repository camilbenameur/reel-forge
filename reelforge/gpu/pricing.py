"""RunPod serverless prices (flex, per second) by card, read with `rp catalog --serverless` on 2026-11-18.

Used to estimate the cost of a job from its execution time: it is an estimate, the real bill is read on the account balance
(`python -m reelforge.gpu balance`). Cold starts are billed too, until the worker is ready; they are not part of
executionTime, hence the billing factor below.
"""

from __future__ import annotations

SURVEY_DATE = "2026-11-18"
DOLLARS_PER_HOUR = {
    "NVIDIA RTX A4000": 0.58, "NVIDIA RTX A4500": 0.58, "NVIDIA RTX 4000 Ada Generation": 0.58,
    "NVIDIA RTX 2000 Ada Generation": 0.58,
    "NVIDIA RTX A5000": 0.75, "NVIDIA GeForce RTX 3090": 0.75, "NVIDIA L4": 0.75,
    "NVIDIA GeForce RTX 4090": 1.34,
    "NVIDIA A40": 1.22, "NVIDIA RTX A6000": 1.22,
    "NVIDIA L40S": 1.89, "NVIDIA L40": 1.89, "NVIDIA RTX 6000 Ada Generation": 1.89,
}
DEFAULT_RATE = 1.34          # unknown card: the 4090 rate, so a small card is never under-estimated
# Real bill / job compute time, measured on 2026-11-18 on the account balance: 2.05 USD debited for 1.07 USD of logged
# compute. The gap comes from cold starts (1.5 to 2.5 min billed per worker) and from the 90 s of idle time billed after each
# job. The daily cap relies on this estimate: it must be cautious, not optimistic.
BILLING_FACTOR = 1.9


def dollars_per_hour(gpu: str) -> float:
    name = (gpu or "").strip().lower()
    if name and name != "?":
        for card, rate in DOLLARS_PER_HOUR.items():
            if card.lower() in name or (len(name) >= 8 and name in card.lower()):
                return rate
    return DEFAULT_RATE


def estimate(gpu: str, compute_s: float, factor: float = BILLING_FACTOR) -> float:
    """Estimated cost of a job in USD, cold starts and billed idle time included (measured factor)."""
    return round(dollars_per_hour(gpu) * compute_s / 3600.0 * factor, 5)
