# TEST-ONLY provider (env COACH_PROVIDER=fake). Deterministic canned JSON per
# mode so the stream plumbing and all four modes are provable end to end WITHOUT
# a live key. `name = "fake"` is surfaced to the client so a fake turn is NEVER
# presented as a live-model result. Not for production.
from __future__ import annotations

from typing import AsyncIterator

from .contract import ImageBlock, Message, StreamDelta, StreamEnd, StreamEvent, TextBlock, Usage

# Each payload validates against its mode's schema (schemas.validate_output).
_RESPONSES = {
    "conversational": (
        '{"code":"muted_string","message":"The B string sounds muted — arch that '
        'finger so its pad clears the string and let it ring.","confidence":0.72,"hedged":false}'
    ),
    "ambiguity": (
        '{"hypotheses":['
        '{"code":"muted_string","rationale":"Audio is missing a pitch class while a '
        'finger is leaning on the neighbouring string.","rank":1},'
        '{"code":"behind_fret","rationale":"The finger may sit too far behind the fret, '
        'buzzing rather than ringing.","rank":2}],'
        '"note":"Ranked possibilities only — not a verdict."}'
    ),
    "summary": (
        '{"summary":"You muted the B string on several C chords and a couple of changes '
        'landed late.","recurring":["muted_string","late_strum"],'
        '"next_drills":["Arched-finger C holds","Slow-metronome C to G changes"]}'
    ),
    "content": (
        '{"id":"drill_fake_c","title":"C arched-finger drill","steps":[{"chord":"C",'
        '"accepted_fingerings":[{"index":{"string":2,"fret":1},"middle":{"string":4,"fret":2},'
        '"ring":{"string":5,"fret":3}}],"expected_strings":[1,2,3,4,5],"avoid_strings":[6],'
        '"success_criteria":{"hold_time_ms":1200,"min_audio_conf":0.6,"max_muted_strings":0},'
        '"feedback_priority":["muted_string","wrong_fret"]}]}'
    ),
}


def _mode_of(system: str) -> str:
    first = system.split("\n", 1)[0]
    if first.startswith("MODE="):
        return first[len("MODE=") :].strip()
    return "conversational"


def _estimate_input(system: str, messages: list[Message]) -> int:
    chars = len(system)
    for m in messages:
        for b in m.content:
            if isinstance(b, TextBlock):
                chars += len(b.text)
            elif isinstance(b, ImageBlock):
                chars += len(b.data)
    return max(1, chars // 4)


class FakeProvider:
    name = "fake"

    async def stream(
        self, *, system: str, messages: list[Message], max_tokens: int
    ) -> AsyncIterator[StreamEvent]:
        payload = _RESPONSES.get(_mode_of(system), _RESPONSES["conversational"])
        # Deterministic 3-way split so the client proves incremental streaming.
        third = max(1, len(payload) // 3)
        for i in range(0, len(payload), third):
            yield StreamDelta(payload[i : i + third])
        yield StreamEnd(
            Usage(
                input_tokens=_estimate_input(system, messages),
                output_tokens=max(1, len(payload) // 4),
            )
        )
