#!/usr/bin/env python3
"""HTML caption of a release post. usage: tg-caption.py <version> <commit_sha> <release_tag>
The first line must stay "Linked Emoji <version>"."""
import html
import sys

REPO = "mrvokintos-plugins/linked-emoji"


def link(url, text):
    return f'<a href="{html.escape(url)}">{html.escape(text)}</a>'


version, sha, tag = sys.argv[1:4]
print("\n".join([
    f"<b>Linked Emoji {html.escape(version)}</b>",
    "Premium emoji without Premium, compatible with exteraless.",
    "",
    link(f"https://github.com/{REPO}/releases/tag/{tag}", "Release")
    + " · " + link(f"https://github.com/{REPO}/commit/{sha}", sha[:7])
    + " · " + link(f"https://github.com/{REPO}", "GitHub"),
]))
