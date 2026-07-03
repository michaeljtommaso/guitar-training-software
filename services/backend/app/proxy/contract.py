# The ADR-011 CAPABILITY CONTRACT the coach binds to — NOT a provider name.
# Any adapter that satisfies this interface can back the coach: multimodal
# messages in (text + base64 image blocks), streamed text deltas out, plus a
# final token-usage report. The registry picks the concrete adapter by env.
from __future__ import annotations

from dataclasses import dataclass, field
from typing import AsyncIterator, Literal, Protocol, Union, runtime_checkable


@dataclass
class TextBlock:
    text: str
    type: Literal["text"] = "text"


@dataclass
class ImageBlock:
    # base64-encoded JPEG keyframe (≤3 per turn, §10 sparse keyframes).
    data: str
    media_type: str = "image/jpeg"
    type: Literal["image"] = "image"


Block = Union[TextBlock, ImageBlock]


@dataclass
class Message:
    role: Literal["user", "assistant"]
    content: list[Block] = field(default_factory=list)


@dataclass
class Usage:
    input_tokens: int
    output_tokens: int


@dataclass
class StreamDelta:
    """An incremental chunk of coach text."""

    text: str


@dataclass
class StreamEnd:
    """Terminal event carrying token accounting for the turn."""

    usage: Usage


StreamEvent = Union[StreamDelta, StreamEnd]


@runtime_checkable
class CoachProvider(Protocol):
    """A coaching backend. `name` labels the source so a fake is never passed
    off as a live model. `stream` yields text deltas then exactly one StreamEnd."""

    name: str

    def stream(
        self, *, system: str, messages: list[Message], max_tokens: int
    ) -> AsyncIterator[StreamEvent]: ...


class ProviderError(RuntimeError):
    """Provider failed (network, auth, bad response). WS falls back to templates."""
