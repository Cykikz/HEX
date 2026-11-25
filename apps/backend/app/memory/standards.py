"""Read-only retrieval from the same standards Markdown used by the memory index."""

import re
from pathlib import Path

MAX_DOCUMENT_BYTES = 64 * 1024
MAX_QUERY_CHARS = 400
MAX_HITS = 3
MAX_EXCERPT_CHARS = 1200
WORDS = re.compile(r"[^\W_]+")
STOP_WORDS = frozenset(
    "a an and are can do for how i in is it of on or should the to what with".split()
)


def chunk_markdown(text: str) -> list[str]:
    """Split a standards document at level-2 headings, keeping the title with each chunk."""
    title_match = re.match(r"#\s+(.+)", text)
    title = title_match.group(1).strip() if title_match else ""
    sections = re.split(r"(?m)^(?=##\s)", text)
    chunks = []
    for section in sections:
        section = section.strip()
        if not section or (
            section.startswith("# ") and "\n##" not in section and len(sections) > 1
        ):
            continue
        chunks.append(f"{title}\n{section}" if title and not section.startswith("# ") else section)
    return chunks


def search_standards(docs_dir: Path, query: str) -> list[tuple[str, str]]:
    """Return ranked source names and excerpts using local text matching."""
    if len(query) > MAX_QUERY_CHARS:
        raise ValueError(f"use a query of at most {MAX_QUERY_CHARS} characters")
    terms = set(WORDS.findall(query.casefold())) - STOP_WORDS
    if not terms:
        raise ValueError("enter a specific coding topic to search for")

    matches: list[tuple[int, str, str]] = []
    for path in sorted(docs_dir.glob("*.md")):
        if path.is_symlink() or not path.is_file():
            continue
        try:
            with path.open("rb") as document:
                data = document.read(MAX_DOCUMENT_BYTES + 1)
            if len(data) > MAX_DOCUMENT_BYTES:
                continue
            text = data.decode("utf-8")
        except (OSError, UnicodeError):
            continue
        for chunk in chunk_markdown(text):
            text_terms = set(WORDS.findall(chunk.casefold()))
            hits = len(terms & text_terms)
            if hits:
                headings = " ".join(line for line in chunk.splitlines() if line.startswith("#"))
                heading_hits = len(terms & set(WORDS.findall(headings.casefold())))
                matches.append((hits * 2 + heading_hits, path.name, chunk))

    matches.sort(key=lambda match: -match[0])
    return [
        (source, text if len(text) <= MAX_EXCERPT_CHARS else text[:MAX_EXCERPT_CHARS] + "…")
        for _, source, text in matches[:MAX_HITS]
    ]
