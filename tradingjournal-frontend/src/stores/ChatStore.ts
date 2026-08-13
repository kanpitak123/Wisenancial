// src/stores/ChatStore.ts
import { defineStore } from 'pinia';
import axios from 'axios';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';

const API = 'http://localhost:3000';

// 📋 กำหนดโครงสร้างข้อมูลข้อความแชทให้ตรงกับที่หลังบ้าน (Prisma) ส่งมา
export interface ChatMessage {
  id: number;
  room_name: string;
  user_id: number;
  message: string;
  created_at: string;
  users: {
    id: number;
    username: string;
    full_name: string;
  };
}

export const useChatStore = defineStore('chat', {
  state: () => ({
    socket: null as Socket | null,
    messages: [] as ChatMessage[],
    currentRoom: 'General', // ห้องเริ่มต้นเมื่อเปิดหน้าแชทครั้งแรก
    isLoading: false,
  }),

  actions: {
    // 🔑 ดึง Header สำหรับเรียก HTTP API (ถอดแบบมาจาก CommunityStore)
    getHeaders() {
      let token = localStorage.getItem('token') || localStorage.getItem('access_token');
      if (!token) {
        console.warn('❌ ไม่พบ Token ในเครื่อง กรุณา Login ใหม่ก่อนเข้าแชท');
        return {};
      }
      token = token.replace(/^"(.*)"$/, '$1');
      return { Authorization: `Bearer ${token}` };
    },

    // 🔌 ฟังก์ชันเชื่อมต่อ WebSocket Gateway ไปหลังบ้าน
    connectSocket() {
      // ป้องกันการเชื่อมต่อซ้ำซ้อนถ้าเชื่อมต่ออยู่แล้ว
      if (this.socket?.connected) return;

      let token = localStorage.getItem('token') || localStorage.getItem('access_token');
      if (token) {
        token = token.replace(/^"(.*)"$/, '$1');
      }

      // เริ่มเชื่อมต่อเซิร์ฟเวอร์ พร้อมส่ง Token ไปให้ Gateway ตรวจสอบ (ผ่าน auth และ extraHeaders)
      this.socket = io(API, {
        auth: { token: token },
        extraHeaders: { Authorization: `Bearer ${token}` },
      });

      // 📡 ดักฟัง Event เมื่อเชื่อมต่อสำเร็จ
      this.socket.on('connect', () => {
        console.log('📡 Connected to Chat WebSocket Server');
        // พอต่อติดปุ๊บ ให้สั่งเข้าห้องแชทปัจจุบันทันที
        this.joinRoom(this.currentRoom);
      });

      // ✉️ ดักฟัง Event "newMessage" เมื่อมีคนส่งข้อความใหม่ในห้อง
      this.socket.on('newMessage', (message: ChatMessage) => {
        // ตรวจสอบก่อนว่าข้อความที่เด้งมา เป็นของห้องที่เราเปิดอยู่ตอนนี้จริงไหม (ป้องกันข้อความข้ามห้อง)
        if (message.room_name === this.currentRoom) {
          this.messages.push(message);
        }
      });

      // ❌ ดักฟังเมื่อตัดการเชื่อมต่อ
      this.socket.on('disconnect', () => {
        console.log('❌ Disconnected from Chat WebSocket Server');
      });
    },

    // 🚪 ฟังก์ชันเปลี่ยนห้องแชท (เช่น จาก General -> XAU/USD)
    async changeRoom(roomName: string) {
      this.currentRoom = roomName;
      this.messages = []; // เคลียร์ข้อความห้องเก่าออกก่อน

      // 1. ดึงประวัติข้อความเก่าของห้องใหม่จากฐานข้อมูลผ่าน HTTP API ก่อน
      await this.fetchChatHistory(roomName);

      // 2. บอก WebSocket เซิร์ฟเวอร์ว่าเราขอย้ายไปสิงที่ห้องใหม่นี้แล้วนะ
      this.joinRoom(roomName);
    },

    // ส่งสัญญาณบอกหลังบ้านว่าขอเข้าห้องนี้ (Join Room ใน socket.io)
    joinRoom(roomName: string) {
      if (this.socket?.connected) {
        this.socket.emit('joinRoom', { roomName });
      }
    },

    // 📜 ฟังก์ชันดึงประวัติแชทย้อนหลังผ่าน HTTP GET Method
    async fetchChatHistory(roomName: string) {
      this.isLoading = true;
      try {
        const res = await axios.get(`${API}/chat/history/${encodeURIComponent(roomName)}`, {
          headers: this.getHeaders(),
        });
        this.messages = res.data;
      } catch (error) {
        console.error('Error fetching chat history:', error);
      } finally {
        this.isLoading = false;
      }
    },

    // ✉️ ฟังก์ชันส่งข้อความแชทใหม่ของเราออกไปหาทุกคนในห้อง
    sendMessage(messageText: string) {
      if (!messageText.trim() || !this.socket?.connected) return;

      // ยิง Event "sendMessage" ส่งข้อมูลห้องและข้อความไปให้หลังบ้านจัดการต่อ
      this.socket.emit('sendMessage', {
        roomName: this.currentRoom,
        message: messageText.trim(),
      });
    },

    // 🔌 ฟังก์ชันเคลียร์การเชื่อมต่อเมื่อผู้ใช้งานย้ายออกจากหน้าแชทไปหน้าอื่น
    disconnectSocket() {
      if (this.socket) {
        this.socket.disconnect();
        this.socket = null;
      }
    },
  },
});
