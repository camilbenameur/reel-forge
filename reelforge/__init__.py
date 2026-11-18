"""reelforge: a pipeline that turns a brief into a vertical short video (script, voice, timeline, render, QA).

Python orchestrates; the Remotion project in ``studio/`` renders. The only contract between the two is ``timeline.json``.
Importing this package has no side effect: no secrets are loaded, no network is touched.
"""

__version__ = "0.1.0"
