package com.synced.app.network

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/** One decision for one connection. A rejection, revocation or timeout cannot become an approval. */
class ApprovalGate {
    private val decision = AtomicReference<Boolean?>(null)
    private val ready = CountDownLatch(1)
    fun resolve(allow: Boolean) { if (decision.compareAndSet(null, allow)) ready.countDown() }
    fun await(timeout: Long, unit: TimeUnit): Boolean {
        if (!ready.await(timeout, unit)) resolve(false)
        return decision.get() == true
    }
}
