from app.proxy.guards import Concurrency, TokenBucket


def test_token_bucket_limits_and_refills():
    tb = TokenBucket(capacity=2, refill_per_sec=1.0)
    assert tb.allow("c", now=0.0)
    assert tb.allow("c", now=0.0)
    assert not tb.allow("c", now=0.0)  # bucket empty
    assert tb.allow("c", now=1.0)  # +1 token after 1s
    assert not tb.allow("c", now=1.0)


def test_token_bucket_is_per_client():
    tb = TokenBucket(capacity=1, refill_per_sec=0.0)
    assert tb.allow("a", now=0.0)
    assert not tb.allow("a", now=0.0)
    assert tb.allow("b", now=0.0)  # separate bucket


def test_concurrency_cap_refuses_over_limit():
    c = Concurrency(2)
    assert c.try_acquire()
    assert c.try_acquire()
    assert not c.try_acquire()  # maxInstances reached → refuse
    c.release()
    assert c.try_acquire()
