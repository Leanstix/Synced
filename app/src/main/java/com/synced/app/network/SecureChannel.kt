package com.synced.app.network

import java.io.DataInputStream
import java.io.DataOutputStream
import java.net.Socket

class SecureChannel(socket: Socket, sendKey: ByteArray, receiveKey: ByteArray) {
    private val input = DataInputStream(socket.getInputStream())
    private val output = DataOutputStream(socket.getOutputStream())
    private val sender = PacketCipher(sendKey)
    private val receiver = PacketCipher(receiveKey)
    @Synchronized fun send(type: Int, body: ByteArray) = Framing.write(output, sender.encrypt(byteArrayOf(type.toByte()) + body))
    fun read(): Pair<Int, ByteArray> {
        val plain = receiver.decrypt(Framing.read(input))
        require(plain.isNotEmpty()) { "Empty message" }
        return (plain[0].toInt() and 255) to plain.copyOfRange(1, plain.size)
    }
    companion object { const val FRAME = 1; const val CONTROL = 2; const val STATUS = 3; const val PING = 4 }
}
