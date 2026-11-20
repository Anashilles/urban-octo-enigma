#!/usr/bin/env python3
"""Find the touching / beautiful moments of a YouTube live stream and cut them
into vertical short clips (9:16, ready for YouTube Shorts, TikTok, Reels).

How moments are found
---------------------
1. Live-chat replay: the chat reacts to an emotional scene a few seconds after
   it happens. Each 5-second slice of chat is scored by how many messages carry
   "emotional" words or emoji (😭 🥺 ❤️ "crying", "beautiful", "مؤثر", ...) and
   by how far the chat rate jumps above its usual level at that point.
2. "Most replayed" heatmap from YouTube, when the video has one.
3. Or explicit timestamps you pass with --timestamps.

The best, well-separated peaks become clips that start a little before the chat
reaction (so the scene itself is in the clip) and end shortly after it.

Requirements: Python 3.9+, ffmpeg/ffprobe, yt-dlp (pip install -U "yt-dlp[default]").

Examples
--------
  # Everything from the URL: analyse chat + heatmap, cut the 8 best moments
  python make_shorts.py "https://www.youtube.com/live/cWPhAshHWk4"

  # Only list the moments (no video download) so you can review them first
  python make_shorts.py URL --analyze-only

  # You already downloaded the whole stream
  python make_shorts.py URL --video stream.mp4

  # You already know the moments
  python make_shorts.py URL --timestamps "1:02:10-1:02:58, 3:15:00-3:15:45"
"""
from __future__ import annotations

import argparse
import json
import math
import re
import shutil
import statistics
import subprocess
import sys
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from pathlib import Path

BIN = 5.0  # seconds per chat bin

# --------------------------------------------------------------------------
# Emotional vocabulary. Weight = how strongly a hit signals a touching moment.
# Latin words are matched on word boundaries, emoji / Arabic as substrings.
# --------------------------------------------------------------------------
EMOJI_WEIGHTS = {
    "😭": 2.0, "😢": 2.0, "🥺": 2.0, "💔": 2.0, "🥲": 2.0, "😿": 1.5, "😞": 1.0,
    "😔": 1.0, "🫶": 1.5, "❤": 1.0, "♥": 1.0, "💕": 1.0, "💖": 1.0, "💗": 1.0,
    "🥰": 1.0, "🙏": 1.0, "🕊": 1.5, "😥": 1.5, "😪": 1.0, "🫡": 1.5,
}
WORD_WEIGHTS = {
    # English
    "cry": 2.0, "crying": 2.0, "cried": 2.0, "tears": 2.0, "teary": 2.0,
    "tearing up": 2.0, "sad": 1.5, "so sad": 2.0, "emotional": 2.0,
    "touching": 2.0, "heartbreaking": 2.0, "heartbroken": 2.0, "heart broke": 2.0,
    "goosebumps": 2.0, "chills": 2.0, "wholesome": 2.0, "beautiful": 2.0,
    "masterpiece": 1.5, "cinema": 1.5, "cinematic": 1.5, "peak": 1.0,
    "rip": 1.5, "rest in peace": 2.0, "f in chat": 1.5, "nooo": 1.0,
    "noooo": 1.5, "why": 0.5, "my heart": 2.0, "not like this": 1.5,
    "pain": 1.0, "bro deserved better": 2.0, "deserved better": 1.5,
    "love this": 1.0, "what a moment": 1.5, "perfect ending": 2.0,
    "ending": 0.7, "goodbye": 1.5, "miss him": 2.0, "miss her": 2.0,
    "speechless": 1.5, "art": 0.7,
    # Spanish / Portuguese / French
    "triste": 1.5, "llorando": 2.0, "chorando": 2.0, "chorei": 2.0,
    "lloré": 2.0, "hermoso": 1.5, "lindo": 1.0, "pleure": 2.0,
}
ARABIC_WEIGHTS = {
    "حزين": 2.0, "حزينة": 2.0, "بكيت": 2.0, "ابكي": 2.0, "أبكي": 2.0, "بكاء": 2.0,
    "دموع": 2.0, "مؤثر": 2.0, "مؤثرة": 2.0, "جميل": 1.5, "جميلة": 1.5,
    "جميله": 1.5, "قشعريرة": 2.0, "قشعريره": 2.0, "يرحمه": 2.0, "يرحمها": 2.0,
    "حرام": 1.0, "قلبي": 1.5, "وجع": 1.5, "روعة": 1.0, "روعه": 1.0,
}
_WORD_RE = [(re.compile(r"(?<![\w])" + re.escape(w) + r"(?![\w])"), wt)
            for w, wt in WORD_WEIGHTS.items()]
# A lone "F" message is the classic tribute in gaming chat.
_LONE_F = re.compile(r"^\s*f+\s*$", re.I)


def emotion_weight(text: str) -> float:
    if not text:
        return 0.0
    low = text.lower()
    score = 0.0
    for e, wt in EMOJI_WEIGHTS.items():
        n = text.count(e)
        if n:
            score += wt * min(n, 3)  # 3x 😭 counts, 30x 😭 spam does not
    for rx, wt in _WORD_RE:
        if rx.search(low):
            score += wt
    for w, wt in ARABIC_WEIGHTS.items():
        if w in text:
            score += wt
    if _LONE_F.match(text):
        score += 1.5
    return min(score, 6.0)


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def parse_ts(s: str) -> float:
    s = s.strip()
    parts = [float(p) for p in s.split(":")]
    sec = 0.0
    for p in parts:
        sec = sec * 60 + p
    return sec


def fmt_ts(sec: float) -> str:
    sec = int(round(max(sec, 0)))
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def ytdlp_cmd() -> list[str]:
    exe = shutil.which("yt-dlp")
    return [exe] if exe else [sys.executable, "-m", "yt_dlp"]


def run(cmd: list[str], quiet: bool = False) -> None:
    if not quiet:
        print("  $", " ".join(str(c) for c in cmd[:6]), "..." if len(cmd) > 6 else "")
    res = subprocess.run(cmd, stdout=subprocess.PIPE if quiet else None,
                         stderr=subprocess.PIPE if quiet else None)
    if res.returncode != 0:
        err = (res.stderr or b"").decode(errors="replace")[-2000:] if quiet else ""
        raise RuntimeError(f"command failed ({res.returncode}): {cmd[0]}\n{err}")


def ffprobe_json(path: Path) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_format",
         "-show_streams", str(path)], capture_output=True, check=True).stdout
    return json.loads(out)


def video_id_from_url(url: str) -> str:
    m = re.search(r"(?:v=|/live/|/shorts/|youtu\.be/|/embed/)([A-Za-z0-9_-]{11})", url)
    return m.group(1) if m else "video"


# --------------------------------------------------------------------------
# Data loading
# --------------------------------------------------------------------------
def _runs_text(runs: list) -> str:
    out = []
    for r in runs or []:
        if "text" in r:
            out.append(r["text"])
        elif "emoji" in r:
            em = r["emoji"]
            if em.get("isCustomEmoji"):
                sc = em.get("shortcuts") or [""]
                out.append(sc[0])
            else:
                out.append(em.get("emojiId", ""))
    return "".join(out)


def load_chat(path: Path) -> list[tuple[float, str, str]]:
    """Parse a yt-dlp *.live_chat.json file -> [(seconds, text, kind)]."""
    msgs = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            rca = obj.get("replayChatItemAction", obj)
            off = rca.get("videoOffsetTimeMsec") or obj.get("videoOffsetTimeMsec")
            if off is None:
                continue
            t = int(off) / 1000.0
            for act in rca.get("actions", []):
                item = act.get("addChatItemAction", {}).get("item", {})
                for key, r in item.items():
                    if key == "liveChatTextMessageRenderer":
                        msgs.append((t, _runs_text(r.get("message", {}).get("runs")), "text"))
                    elif key == "liveChatPaidMessageRenderer":
                        msgs.append((t, _runs_text(r.get("message", {}).get("runs")), "paid"))
                    elif key in ("liveChatMembershipItemRenderer",
                                 "liveChatSponsorshipsGiftPurchaseAnnouncementRenderer"):
                        msgs.append((t, "", "support"))
    msgs.sort(key=lambda m: m[0])
    return msgs


# --------------------------------------------------------------------------
# Moment detection
# --------------------------------------------------------------------------
@dataclass
class Moment:
    rank: int
    peak: float
    start: float
    end: float
    score: float
    reason: str
    chat_samples: list[str] = field(default_factory=list)
    file: str | None = None

    @property
    def duration(self) -> float:
        return self.end - self.start


def _moving_sum(a: list[float], k: int) -> list[float]:
    n, half = len(a), k // 2
    pref = [0.0]
    for x in a:
        pref.append(pref[-1] + x)
    return [pref[min(n, i + half + 1)] - pref[max(0, i - half)] for i in range(n)]


def _rolling_median(a: list[float], half: int, step: int = 6) -> list[float]:
    # computed every `step` bins and held, which is plenty for a 10-min baseline
    n, out, cur = len(a), [0.0] * len(a), 0.0
    for i in range(n):
        if i % step == 0:
            cur = statistics.median(a[max(0, i - half): min(n, i + half + 1)])
        out[i] = cur
    return out


def _normalise(a: list[float]) -> list[float]:
    if not a:
        return a
    s = sorted(a)
    ref = s[int(0.995 * (len(s) - 1))] or s[-1]
    return [min(x / ref, 1.0) if ref > 0 else 0.0 for x in a]


def detect_moments(duration: float, chat: list, heatmap: list | None, args) -> list[Moment]:
    nb = int(duration // BIN) + 1
    cnt, emo, sup = [0.0] * nb, [0.0] * nb, [0.0] * nb
    bin_msgs: dict[int, list[tuple[float, str]]] = defaultdict(list)
    for t, text, kind in chat:
        b = int(t // BIN)
        if not 0 <= b < nb:
            continue
        cnt[b] += 1
        w = emotion_weight(text)
        emo[b] += w
        if kind != "text":
            sup[b] += 1
        if w > 0 and text:
            bin_msgs[b].append((w, text))

    win = max(1, int(round(30 / BIN)))  # 30 s smoothing window
    sc, se, ss = _moving_sum(cnt, win), _moving_sum(emo, win), _moving_sum(sup, win)
    base = _rolling_median(sc, int(600 / BIN))  # +-10 min baseline

    emo_score = [(e / (c + 10.0)) * math.log1p(e) for e, c in zip(se, sc)]
    spike = [max(0.0, (c - b) / (b + 3.0)) for c, b in zip(sc, base)]

    heat = [0.0] * nb
    if heatmap:
        for seg in heatmap:
            a = int(seg.get("start_time", 0) // BIN)
            z = int(seg.get("end_time", 0) // BIN)
            for b in range(max(a, 0), min(z + 1, nb)):
                heat[b] = max(heat[b], float(seg.get("value", 0)))

    E, S, H, P = _normalise(emo_score), _normalise(spike), _normalise(heat), _normalise(ss)
    have_chat, have_heat = bool(chat), any(heat)
    if have_chat and have_heat:
        wE, wS, wH, wP = 0.55, 0.20, 0.20, 0.05
    elif have_chat:
        wE, wS, wH, wP = 0.65, 0.28, 0.0, 0.07
    elif have_heat:
        wE, wS, wH, wP = 0.0, 0.0, 1.0, 0.0
    else:
        raise SystemExit("No chat replay and no heatmap for this video. "
                         "Pass --timestamps, or wait until YouTube finishes processing the stream.")
    score = [wE * e + wS * s + wH * h + wP * p for e, s, h, p in zip(E, S, H, P)]

    skip = int(args.skip_start // BIN)
    order = sorted(range(skip, nb), key=lambda b: score[b], reverse=True)
    picked: list[int] = []
    for b in order:
        if len(picked) >= args.count or score[b] <= 0:
            break
        # a pure hype / meme spike is not a touching moment
        if have_chat and E[b] < args.min_emotion:
            continue
        if all(abs(b - p) * BIN >= args.min_gap for p in picked):
            picked.append(b)

    moments = []
    for b in picked:
        peak = b * BIN + BIN / 2
        start = max(0.0, peak - args.pre)
        end = min(duration, peak + args.post)
        if end - start > args.max_len:
            start = end - args.max_len
        bits = []
        if E[b] > 0.25:
            bits.append(f"emotional chat {E[b]:.0%}")
        if S[b] > 0.25:
            bits.append(f"chat spike {S[b]:.0%}")
        if H[b] > 0.25:
            bits.append(f"most-replayed {H[b]:.0%}")
        # sample of what chat said around the peak
        samples, seen = [], set()
        near = [m for k in range(b - win, b + win + 1) for m in bin_msgs.get(k, [])]
        for w, text in sorted(near, key=lambda m: -m[0]):
            key = text.strip().lower()
            if key in seen:
                continue
            seen.add(key)
            samples.append(text.strip()[:90])
            if len(samples) >= 6:
                break
        moments.append(Moment(0, peak, start, end, round(score[b], 3),
                              ", ".join(bits) or "top score", samples))
    moments.sort(key=lambda m: m.peak)
    for i, m in enumerate(moments, 1):
        m.rank = i
    return moments


def moments_from_timestamps(spec: str, duration: float | None) -> list[Moment]:
    out = []
    for i, part in enumerate([p for p in spec.split(",") if p.strip()], 1):
        a, _, z = part.partition("-")
        s, e = parse_ts(a), parse_ts(z) if z.strip() else parse_ts(a) + 45
        if duration:
            e = min(e, duration)
        out.append(Moment(i, (s + e) / 2, s, e, 1.0, "manual"))
    return out


# --------------------------------------------------------------------------
# Rendering
# --------------------------------------------------------------------------
def build_filters(layout: str, dur: float, has_audio: bool) -> tuple[str, list[str]]:
    fo = max(dur - 0.6, 0)
    fades = f"fade=t=in:st=0:d=0.4,fade=t=out:st={fo:.2f}:d=0.6"
    if layout == "blur":
        v = ("[0:v]split=2[a][b];"
             "[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,"
             "gblur=sigma=28,eq=brightness=-0.07[bg];"
             "[b]scale=1080:-2:flags=lanczos[fg];"
             f"[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,{fades},format=yuv420p[v]")
    elif layout == "crop":
        v = (f"[0:v]scale=-2:1920:flags=lanczos,crop=1080:1920,setsar=1,{fades},"
             "format=yuv420p[v]")
    else:  # landscape
        v = f"[0:v]scale=1920:-2:flags=lanczos,setsar=1,{fades},format=yuv420p[v]"
    maps = ["-map", "[v]"]
    if has_audio:
        v += (f";[0:a]afade=t=in:st=0:d=0.3,afade=t=out:st={fo:.2f}:d=0.6,"
              "loudnorm=I=-14:TP=-1.5:LRA=11[a]")
        maps += ["-map", "[a]"]
    return v, maps


def render(src: Path, ss: float, dur: float, out: Path, layout: str, crf: int) -> None:
    info = ffprobe_json(src)
    has_audio = any(s.get("codec_type") == "audio" for s in info.get("streams", []))
    graph, maps = build_filters(layout, dur, has_audio)
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
           "-ss", f"{ss:.3f}", "-i", str(src), "-t", f"{dur:.3f}",
           "-filter_complex", graph, *maps,
           "-c:v", "libx264", "-preset", "medium", "-crf", str(crf),
           "-profile:v", "high", "-movflags", "+faststart"]
    if has_audio:
        cmd += ["-c:a", "aac", "-b:a", "160k", "-ar", "48000"]
    cmd.append(str(out))
    run(cmd, quiet=True)


def thumbnail(src: Path, at: float, out: Path) -> None:
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-ss", f"{max(at, 0):.2f}",
         "-i", str(src), "-frames:v", "1", "-q:v", "3", str(out)], quiet=True)


def download_section(url: str, start: float, end: float, out_base: Path, extra: list[str]) -> Path:
    cmd = ytdlp_cmd() + [
        "--no-playlist", "--download-sections", f"*{start:.2f}-{end:.2f}",
        "--force-keyframes-at-cuts",
        "-f", "bv*[height<=1080]+ba/b[height<=1080]/b",
        "--merge-output-format", "mp4",
        "-o", str(out_base) + ".%(ext)s", *extra, url]
    run(cmd)
    found = sorted(out_base.parent.glob(out_base.name + ".*"))
    found = [f for f in found if f.suffix in (".mp4", ".mkv", ".webm")]
    if not found:
        raise RuntimeError(f"yt-dlp produced no file for {fmt_ts(start)}-{fmt_ts(end)}")
    return found[0]


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------
def fetch_metadata(url: str, work: Path, want_chat: bool, extra: list[str]) -> None:
    cmd = ytdlp_cmd() + ["--no-playlist", "--skip-download", "--write-info-json",
                         "-o", str(work / "%(id)s.%(ext)s")]
    if want_chat:
        cmd += ["--write-subs", "--sub-langs", "live_chat"]
    run(cmd + extra + [url])


def write_report(moments: list[Moment], out: Path, vid: str, title: str) -> None:
    (out / "moments.json").write_text(
        json.dumps([asdict(m) for m in moments], ensure_ascii=False, indent=2), encoding="utf-8")
    lines = [f"# {title}", "", f"Source: https://www.youtube.com/watch?v={vid}", "",
             "| # | Time in stream | Length | Why | File |", "|---|---|---|---|---|"]
    for m in moments:
        link = f"[{fmt_ts(m.start)} → {fmt_ts(m.end)}](https://www.youtube.com/watch?v={vid}&t={int(m.start)}s)"
        lines.append(f"| {m.rank} | {link} | {m.duration:.0f}s | {m.reason} | {m.file or '-'} |")
    lines.append("")
    for m in moments:
        if m.chat_samples:
            lines.append(f"**#{m.rank} — chat at {fmt_ts(m.peak)}:** " +
                         " · ".join(f"“{s}”" for s in m.chat_samples))
            lines.append("")
    (out / "moments.md").write_text("\n".join(lines), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0],
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("url", help="YouTube video / live URL")
    ap.add_argument("-n", "--count", type=int, default=8, help="number of clips (default 8)")
    ap.add_argument("--pre", type=float, default=45, help="seconds before the chat peak (default 45)")
    ap.add_argument("--post", type=float, default=12, help="seconds after the chat peak (default 12)")
    ap.add_argument("--max-len", type=float, default=60, help="max clip length in seconds (default 60)")
    ap.add_argument("--min-gap", type=float, default=240, help="min seconds between two clips (default 240)")
    ap.add_argument("--skip-start", type=float, default=300,
                    help="ignore the first N seconds (stream intro / greetings, default 300)")
    ap.add_argument("--min-emotion", type=float, default=0.2,
                    help="drop peaks whose emotional-chat score (0-1, relative to the stream's "
                         "strongest moment) is below this; 0 also keeps pure hype spikes (default 0.2)")
    ap.add_argument("--layout", choices=["blur", "crop", "landscape"], default="blur",
                    help="blur: full frame on blurred 9:16 background (default); "
                         "crop: centre-crop to 9:16; landscape: keep 16:9")
    ap.add_argument("--crf", type=int, default=20, help="x264 quality, lower = better (default 20)")
    ap.add_argument("--timestamps", help='manual moments, e.g. "1:02:10-1:02:58, 3:15:00-3:15:45"')
    ap.add_argument("--video", type=Path, help="local copy of the full stream (skips per-clip download)")
    ap.add_argument("--chat", type=Path, help="local *.live_chat.json (skips chat download)")
    ap.add_argument("--info", type=Path, help="local *.info.json (skips metadata download)")
    ap.add_argument("--no-chat", action="store_true", help="don't download chat; use heatmap only")
    ap.add_argument("--analyze-only", action="store_true", help="only find and list the moments")
    ap.add_argument("-o", "--out", type=Path, default=Path("shorts_out"), help="output folder")
    ap.add_argument("--yt-dlp-arg", action="append", default=[], metavar="ARG",
                    help="extra argument passed to every yt-dlp call (repeatable)")
    args = ap.parse_args(argv)

    out = args.out
    work = out / "_work"
    work.mkdir(parents=True, exist_ok=True)
    vid = video_id_from_url(args.url)

    # 1. metadata + chat ----------------------------------------------------
    info_path, chat_path = args.info, args.chat
    need_fetch = (info_path is None) or (chat_path is None and not args.no_chat and not args.timestamps)
    if need_fetch and not (work / f"{vid}.info.json").exists():
        print("[1/3] Downloading stream info and chat replay (can take a few minutes for long streams)...")
        fetch_metadata(args.url, work, want_chat=not (args.no_chat or args.timestamps or chat_path),
                       extra=args.yt_dlp_arg)
    info_path = info_path or (work / f"{vid}.info.json")
    if chat_path is None and (work / f"{vid}.live_chat.json").exists():
        chat_path = work / f"{vid}.live_chat.json"

    info = json.loads(info_path.read_text(encoding="utf-8")) if info_path and info_path.exists() else {}
    title = info.get("title", vid)
    if info.get("is_live") or info.get("live_status") == "is_live":
        print("! The stream is still live. Chat replay and heatmap only exist after it ends; "
              "run this again once YouTube has processed the VOD.")
    duration = float(info.get("duration") or 0)
    if args.video and not duration:
        duration = float(ffprobe_json(args.video)["format"]["duration"])

    # 2. moments --------------------------------------------------------------
    if args.timestamps:
        moments = moments_from_timestamps(args.timestamps, duration or None)
    else:
        chat = load_chat(chat_path) if chat_path and chat_path.exists() else []
        print(f"[2/3] Analysing {len(chat):,} chat messages"
              f"{' + most-replayed heatmap' if info.get('heatmap') else ''}...")
        if not duration:
            duration = (chat[-1][0] + 60) if chat else 0
        moments = detect_moments(duration, chat, info.get("heatmap"), args)

    print(f"\nFound {len(moments)} moments in “{title}”:")
    for m in moments:
        print(f"  #{m.rank}  {fmt_ts(m.start)} → {fmt_ts(m.end)}  ({m.duration:.0f}s)  {m.reason}")
        if m.chat_samples:
            print("       chat: " + " | ".join(m.chat_samples[:3]))
    write_report(moments, out, vid, title)
    if args.analyze_only:
        print(f"\nReport: {out / 'moments.md'}")
        return 0

    # 3. cut + render ---------------------------------------------------------
    print("\n[3/3] Cutting and rendering vertical clips...")
    for m in moments:
        name = f"{m.rank:02d}_{fmt_ts(m.start).replace(':', '-')}"
        dst = out / f"{name}.mp4"
        if args.video:
            src, ss = args.video, m.start
        else:
            src, ss = download_section(args.url, m.start, m.end, work / f"raw_{name}", args.yt_dlp_arg), 0.0
        render(src, ss, m.duration, dst, args.layout, args.crf)
        thumbnail(dst, min(m.peak - m.start, m.duration - 1), out / f"{name}.jpg")
        m.file = dst.name
        print(f"  ✓ {dst}")
    write_report(moments, out, vid, title)
    print(f"\nDone. Clips and report (moments.md) are in: {out.resolve()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
