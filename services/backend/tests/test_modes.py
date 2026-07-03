import asyncio

import pytest

from app.coach import modes
from app.proxy.contract import StreamDelta, StreamEnd
from app.proxy.fake import FakeProvider
from app.schemas import validate_output
from app.schemas import CoachRequest


def _run_mode(mode: str):
    req = CoachRequest(
        mode=mode,
        session_id="s",
        target_chord="C",
        recent_diagnoses=[{"code": "muted_string", "string": 2, "conf": 0.6, "severity": 0.5}],
        question="why does my C sound bad?",
    )
    system = modes.build_system(mode)
    messages = modes.build_messages(req)

    async def run():
        text = ""
        chunks = 0
        usage = None
        async for evt in FakeProvider().stream(system=system, messages=messages, max_tokens=512):
            if isinstance(evt, StreamDelta):
                text += evt.text
                chunks += 1
            elif isinstance(evt, StreamEnd):
                usage = evt.usage
        return text, chunks, usage

    return asyncio.run(run())


@pytest.mark.parametrize("mode", ["conversational", "ambiguity", "summary", "content"])
def test_each_mode_streams_and_validates(mode):
    text, chunks, usage = _run_mode(mode)
    assert chunks >= 1  # streamed incrementally
    assert usage is not None and usage.output_tokens > 0
    model = validate_output(mode, text)
    assert model is not None, f"{mode} output failed schema validation: {text}"


def test_ambiguity_returns_ranked_hypotheses_not_ground_truth():
    text, _, _ = _run_mode("ambiguity")
    resolution = validate_output("ambiguity", text)
    assert len(resolution.hypotheses) >= 2
    ranks = [h.rank for h in resolution.hypotheses]
    assert ranks == sorted(ranks)  # ranked


def test_content_mode_produces_loadable_drill():
    text, _, _ = _run_mode("content")
    drill = validate_output("content", text)
    assert drill.steps[0].chord
    assert drill.steps[0].accepted_fingerings
