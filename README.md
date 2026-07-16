# PEPS VAR Replay Studio

เครื่องมือควบคุม VAR Replay และ Highlight Playlist สำหรับ OBS ทำงานเป็น Static Web App และเปิดผ่าน GitHub Pages ได้โดยไม่ต้องมี Backend

## โหมดใช้งาน

- `?mode=control` ใช้เป็น OBS Custom Browser Dock สำหรับควบคุม VAR และ Highlight
- `?mode=screen` ใช้เป็น OBS Browser Source สำหรับภาพ VAR
- `?mode=highlight-screen` ใช้เป็น OBS Browser Source สำหรับ Highlight Playlist

หน้า Control แบ่งขั้นตอนตามงานจริง:

1. เลือกหรือลากคลิป
2. ตรวจดูเฟรมและลาก Timeline โดยภาพจะเลื่อนตามตำแหน่งที่ลาก
3. ตั้งจุด A และ B สำหรับช่วง Replay
4. ปรับ Zoom, Pan, Speed และ Output เฉพาะเมื่อต้องการ

## ตั้งค่า OBS

1. เปิด URL `index.html?mode=control` เป็น Custom Browser Dock
2. กด `Sources` ที่ด้านล่างของ Dock
3. Copy URL หรือ Copy Setup ของ Source ที่ต้องการ
4. เพิ่ม `VAR Screen` และ `Highlight Screen` เป็น Browser Source ขนาด `1920x1080`
5. เปิด `Keep source active when hidden` ให้ทั้งสอง Browser Source

แนะนำให้ใช้ Control Dock กว้าง `420-520` พิกเซล และสูงประมาณ `900` พิกเซล

## VAR Replay

- รองรับ Click, Drag and Drop และการเลือกไฟล์เดิมซ้ำ
- ตรวจสอบว่า Chromium decode เฟรมได้ก่อนเปลี่ยนคลิปที่กำลังใช้งาน
- ถ้าคลิปใหม่ใช้ไม่ได้ ระบบจะเก็บคลิปเดิมไว้แทนการทำให้หน้าจอดำ
- Timeline และ Marker A/B seek แบบตรงตำแหน่งขณะลาก
- Screen ส่งเวลาการเล่นจริงกลับมาที่ Control เพื่อรักษาความลื่นเมื่อเปิดหลาย Dock
- Double buffer ลดการกระพริบตอนโหลดหรือเปลี่ยนคลิป
- มี Zoom preset `1x`, `2x`, `5x`, `10x` และลาก Pan ได้

## Highlight Replay

- เพิ่มหลายคลิปพร้อมกันและจัด Playlist ได้
- เล่นตามลำดับหรือสุ่ม พร้อม Loop Playlist
- รองรับ Speed และ Transition หลายรูปแบบ
- จำคลิปและตำแหน่งล่าสุดด้วย IndexedDB
- Highlight Screen ส่งสถานะการเล่นและเหตุการณ์จบคลิปกลับ Control
- ถ้า Control Dock ถูกลดความสำคัญโดย Chromium, Source ยังสามารถสั่งเดิน Playlist ต่อได้
- ปุ่ม Clear ล้างทั้ง Playlist, IndexedDB และ Source ที่กำลังเล่น

## Codec ที่แนะนำ

OBS Browser Source ใช้ Chromium ซึ่งอาจอ่าน metadata ของ `HEVC/H.265` ในไฟล์ MKV ได้ แต่ไม่สามารถ decode ภาพได้ ทำให้ดูเหมือนคลิปค้างหลังเริ่มเล่น

ใช้ `H.264 + AAC` ในไฟล์ MP4 เพื่อความเสถียร:

```powershell
powershell -ExecutionPolicy Bypass -File tools\convert-replay-to-h264.ps1 -InputPath "Replay.mkv"
```

ไฟล์ผลลัพธ์จะมีชื่อ `Replay-h264.mp4` และใช้ `yuv420p` พร้อม `faststart`

## Keyboard

### VAR

| ปุ่ม | คำสั่ง |
|---|---|
| `Space` | Play / Pause |
| `A` | ตั้งจุด A |
| `B` | ตั้งจุด B |
| `C` | ล้างช่วง A-B |
| `R` | Reset Zoom และ Pan |
| `Left` / `Right` | ย้อนหรือเดินหน้า 1 วินาที |
| `[` / `]` | ลดหรือเพิ่ม Speed |
| `+` / `-` | เพิ่มหรือลด Zoom |

### Highlight

| ปุ่ม | คำสั่ง |
|---|---|
| `Space` | Play / Pause |
| `R` | เริ่มคลิปปัจจุบันใหม่ |
| `Left` / `Right` | คลิปก่อนหน้า / ถัดไป |
| `[` / `]` | ลดหรือเพิ่ม Speed |

## โครงสร้างหลัก

```text
index.html
assets/
  var-replay.css
  var-replay.js
  highlight-replay.js
data/
  sample-config.json
tools/
  convert-replay-to-h264.ps1
```

`VAR_Replay_V1.0.html` เก็บไว้เป็น Compatibility Redirect ไปยัง `index.html`

## หมายเหตุ

- Control Dock และ Browser Source ควรเปิดอยู่ใน OBS เดียวกันเพื่อให้ IndexedDB และ BroadcastChannel ทำงานใน browser context เดียวกัน
- ถ้าเปิด Control Dock หลายหน้าต่าง หน้าต่างที่ใช้งานล่าสุดจะเป็นตัวควบคุมหลัก
- ระบบนี้เล่นไฟล์ Replay ที่ผู้ใช้เลือก ไม่ได้จับ Live Input หรือ OBS Replay Buffer โดยตรง
