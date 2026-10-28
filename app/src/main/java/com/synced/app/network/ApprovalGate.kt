package com.synced.app.network

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/** One decision for one connection. A rejection, revocation or timeout cannot become an approval. */
class ApprovalGate {
    private val decision = AtomicReference<Boolean?>(null)
    private val ready = CountDownLatch(1)
