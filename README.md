# Peps VAR Replay Studio

เว็บคอนโทรล VAR Replay สำหรับ OBS Browser Source / OBS Custom Browser Dock แบบ Static ใช้ลง GitHub Pages ได้ทันที

> โปรเจกต์นี้เป็นงานสร้างใหม่สำหรับ PepsLive/Pepsproduction โดยออกแบบฟังก์ชันให้ใกล้กับแนวทาง VAR Replay Control Center แต่ไม่ได้คัดลอกซอร์สโค้ด, asset, QR, branding หรือไฟล์ของเว็บต้นฉบับ

## ฟีเจอร์หลัก

- เปิดเป็นหน้า Control Center ด้วย `?mode=control`
- เปิดเป็นหน้า Screen สำหรับ OBS Browser Source ด้วย `?mode=screen`
- คลิกหรือ Drag & Drop ไฟล์วิดีโอ
- บันทึกคลิปล่าสุดไว้ใน IndexedDB ของ browser
- Sync Control → Screen ด้วย BroadcastChannel
- Play / Pause
- Set A / Set B สำหรับ Loop A-B
- Clear Loop
- Timeline seek
- Navigator สำหรับซูมช่วง Timeline โดยลากขอบซ้าย/ขวา
- Speed 0.25x - 2.0x
- Zoom 1.0x - 3.0x
- Pan X/Y
- Reset Zoom & Position
- ปุ่ม Copy Screen Link / Control Link
- Shortcut keyboard
- Screen mode พื้นหลังโปร่งใส เหมาะกับ OBS Browser Source

## วิธีใช้งานบน GitHub Pages

1. อัปโหลดไฟล์ทั้งหมดขึ้น repo เช่น `peps-var-replay-studio`
2. เปิด GitHub Pages จาก branch `main` และ root folder
3. เข้า URL หลัก เช่น

```text
https://YOURNAME.github.io/peps-var-replay-studio/index.html?mode=control
```

4. กด `Get Screen Link`
5. Copy ลิงก์ Screen ไปใส่ใน OBS Browser Source

```text
https://YOURNAME.github.io/peps-var-replay-studio/index.html?mode=screen
```

## วิธีใช้กับ OBS ที่แนะนำ

### แบบที่เสถียรสุด

- เพิ่ม `index.html?mode=control` เป็น OBS Custom Browser Dock
- เพิ่ม `index.html?mode=screen` เป็น OBS Browser Source
- โหลดวิดีโอจากหน้า Control Dock
- กด Play / Pause / Set A-B จากหน้า Control

การเปิดทั้ง Control และ Screen ใน OBS ช่วยให้ browser context มีโอกาสแชร์ IndexedDB/BroadcastChannel ได้ดีที่สุด

Performance note: if multiple Control Dock UIs are open, the dock used most recently becomes the active controller. Other control docks stay passive and do not send playback heartbeat, which helps keep Screen playback smooth.

### หมายเหตุสำคัญเรื่องไฟล์วิดีโอ

OBS Browser Source / Chromium เล่นไฟล์บาง codec ไม่ได้ แม้ไฟล์จะเปิดใน VLC ได้ เช่น `HEVC/H.265` ใน `.mkv` อาจทำให้เวลาเดินแต่ภาพไม่ decode และดูเหมือนค้าง ให้ใช้ไฟล์ `H.264 MP4` สำหรับ VAR Replay

แปลงคลิป OBS Replay เป็น H.264 MP4 ได้ด้วย:

```powershell
powershell -ExecutionPolicy Bypass -File tools\convert-replay-to-h264.ps1 -InputPath "Replay 2026-05-23 09-43-35.mkv"
```

ไฟล์ที่ลากเข้า browser เป็นไฟล์ local ของเครื่อง ผู้ใช้ทั่วไปไม่สามารถส่งไฟล์ local จาก Chrome ไปยัง OBS Browser Source คนละ browser profile ได้โดยตรง เพราะติด sandbox/security ของ browser

ดังนั้นหากเปิด Control ใน Chrome แต่เปิด Screen ใน OBS แล้ว Screen ไม่เห็นคลิป ให้ใช้วิธีนี้แทน:

- เปิด Control เป็น OBS Custom Browser Dock
- หรืออัปโหลดคลิปไปไว้บน URL สาธารณะแล้วปรับเพิ่ม `src=` ในโค้ดภายหลัง

## Keyboard Shortcuts

| ปุ่ม | การทำงาน |
|---|---|
| Space | Play / Pause |
| A | Set A |
| B | Set B |
| C | Clear Loop |
| R | Reset Zoom & Position |
| ← / → | Seek -1s / +1s |
| [ / ] | ลด/เพิ่ม Speed |
| + / - | เพิ่ม/ลด Zoom |

## โครงไฟล์

```text
peps-var-replay-studio/
├─ index.html
├─ VAR_Replay_V1.0.html
├─ assets/
│  ├─ var-replay.css
│  └─ var-replay.js
├─ data/
│  └─ sample-config.json
├─ tools/
│  └─ convert-replay-to-h264.ps1
├─ ANALYSIS_AND_WORKFLOW.md
├─ CHANGELOG.md
└─ README.md
```

## ปรับแบรนด์/สี

แก้สีหลักได้ที่ไฟล์:

```text
assets/var-replay.css
```

ตัวแปรหลักอยู่ใน `:root`

```css
--orange: #ff8a1c;
--orange-2: #ffb347;
--blue: #62d6ff;
```

## ข้อจำกัดเวอร์ชันนี้

- ยังไม่ใช่ระบบจับ replay จาก live input แบบ capture card/NDI โดยตรง
- เป็นระบบเล่นไฟล์วิดีโอ replay ที่ผู้ใช้โหลดเข้าไปเอง
- Screen page จะ sync ได้ดีที่สุดเมื่อ Control และ Screen อยู่ใน browser context เดียวกัน เช่น OBS Custom Browser Dock + OBS Browser Source
- ยังไม่มีระบบตัดคลิปอัตโนมัติจาก live stream buffer

## แนวทางพัฒนาต่อ

- เพิ่ม recording buffer จาก OBS/NDI/WebRTC
- เพิ่มปุ่ม Instant Replay 5s / 10s / 15s
- เพิ่ม transition VAR Checking / Decision / Goal / No Goal
- เพิ่ม scoreboard overlay sync กับ PepsLive Dock UI
- เพิ่ม preset สำหรับ Football / Futsal / Basketball
- เพิ่ม hotkey ผ่าน OBS WebSocket
- เพิ่มระบบ export replay highlight เป็นไฟล์ MP4
