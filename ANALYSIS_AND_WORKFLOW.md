# วิเคราะห์และ Workflow: VAR Replay Control สำหรับ OBS

## 1. สิ่งที่หน้าเว็บต้นแบบทำได้

จากหน้าเว็บต้นแบบที่ตรวจได้ โครงหลักเป็น `OBS VAR REPLAY` และ `CONTROL CENTER V1.1` มีการใช้งานแบบโหลดไฟล์วิดีโอเข้าหน้าเว็บ แล้วควบคุม playback เพื่อใช้เป็นภาพ Replay/VAR ใน OBS

องค์ประกอบที่พบ:

- พื้นที่คลิกหรือ Drag & Drop ไฟล์วิดีโอ
- รองรับคลิปหลายความยาว
- สถานะ Loop A-B
- จุด A / B
- เวลาเริ่ม/เวลาปัจจุบัน
- Navigator สำหรับซูม Timeline
- ปุ่ม Play / Pause
- ปุ่ม Set A / Set B
- ปุ่ม Clear Loop
- Speed 1.0x
- Zoom 1.0x
- Reset Zoom & Position
- หน้าต่าง Graphic Link สำหรับ OBS Browser Source
- Modal สนับสนุนผู้พัฒนา

## 2. แกนการทำงานที่ควรมีในเวอร์ชันของเรา

### Control Page

ใช้เป็นหน้าควบคุมหลัก มีหน้าที่:

- รับไฟล์วิดีโอ
- เล่น/หยุดคลิป
- seek เวลา
- ตั้ง loop A-B
- ปรับความเร็ว
- ปรับ zoom/pan
- ส่ง state ไปยัง Screen Page

### Screen Page

ใช้เป็น OBS Browser Source มีหน้าที่:

- แสดงวิดีโอแบบเต็มจอ
- ซ่อน UI control ทั้งหมด
- พื้นหลังโปร่งใส
- รับ state จาก Control
- sync เวลา/playback/speed/loop/zoom/pan

### Data Bridge

ใช้เทคนิค browser-native:

- `IndexedDB` เก็บคลิปล่าสุดใน browser
- `BroadcastChannel` ส่งคำสั่ง Control → Screen แบบ realtime

## 3. Workflow ใช้งานจริง

1. เปิด OBS
2. เพิ่ม Custom Browser Dock เป็น Control Page
3. เพิ่ม Browser Source เป็น Screen Page
4. Drag & Drop คลิป replay เข้า Control Page
5. กด Set A ตอนจุดเริ่มรีเพลย์
6. กด Set B ตอนจุดจบรีเพลย์
7. เปิด Loop A-B หรือกด Play เพื่อส่งภาพออก OBS
8. ปรับ Speed / Zoom / Pan ตามจังหวะภาพ
9. ใช้ Scene หรือ Source Visibility ของ OBS ตัดเข้า-ออกระหว่าง Live กับ VAR Replay

## 4. จุดที่ควรพัฒนาต่อให้เหนือกว่าเว็บต้นแบบ

### Phase 2 — Instant Replay Preset

เพิ่มปุ่ม:

- Replay 5s
- Replay 10s
- Replay 15s
- Replay 30s

เหมาะกับจังหวะฟาวล์/ประตู/ลูกปัญหา

### Phase 3 — VAR Decision Overlay

เพิ่มกราฟิก:

- VAR CHECKING
- GOAL
- NO GOAL
- OFFSIDE
- FOUL
- PENALTY

ให้กดขึ้น overlay ได้ทันที โดยไม่ต้องเปลี่ยน scene

### Phase 4 — OBS WebSocket Integration

เพิ่มการเชื่อม OBS WebSocket เพื่อ:

- Show/Hide Source อัตโนมัติ
- สั่งเปลี่ยน Scene
- Trigger replay transition
- Trigger sound effect
- Trigger score animation หลัง replay

### Phase 5 — Live Buffer

พัฒนาระบบรับภาพ live แล้วบันทึก buffer ย้อนหลัง เช่น:

- MediaRecorder จาก capture source
- NDI/WebRTC bridge
- ffmpeg local bridge
- OBS Replay Buffer API

นี่คือจุดที่จะทำให้ระบบกลายเป็น VAR Replay จริง ไม่ใช่แค่ video player control

## 5. สรุปสั้น

เวอร์ชันนี้เหมาะสำหรับเริ่มใช้งานเป็น VAR Replay Dock แบบ Static ลง GitHub Pages ได้ทันที ใช้งานง่าย ไม่ต้องมี server และพร้อมต่อยอดเข้า PepsLive Dock UI / OBS WebSocket ในเฟสถัดไป
