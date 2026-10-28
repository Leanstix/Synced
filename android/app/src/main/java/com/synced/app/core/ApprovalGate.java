package com.synced.app.core;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** A single local decision for a single authenticated connection. */
public final class ApprovalGate {
    private final AtomicReference<Boolean> decision = new AtomicReference<>();
    private final CountDownLatch ready = new CountDownLatch(1);
    public void resolve(boolean allow) { if (decision.compareAndSet(null, allow)) ready.countDown(); }
    public boolean await(long timeout, TimeUnit unit) throws InterruptedException {
        if (!ready.await(timeout, unit)) resolve(false);
        return Boolean.TRUE.equals(decision.get());
    }
}
