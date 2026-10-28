package com.synced.app.network

import java.io.DataInputStream
import java.io.DataOutputStream
import java.net.Socket

class SecureChannel(socket: Socket, sendKey: ByteArray, receiveKey: ByteArray) {
    private val input = DataInputStream(socket.getInputStream())
    private val output = DataOutputStream(socket.getOutputStream())
    private val sender = PacketCipher(sendKey)
