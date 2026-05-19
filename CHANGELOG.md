# Changelog

## V1.1.0

- ปรับ UX/UI หน้า Control ให้เป็น Dock UI แบบกะทัดรัดใกล้แนว VAR Replay Control Center
- เปลี่ยน layout เป็นแนวตั้งเต็มจอ เหมาะกับ OBS Custom Browser Dock
- เพิ่ม header แบบ OBS VAR REPLAY / PEPS CONTROL CENTER V1.1
- เพิ่ม Drop Zone แบบ compact พร้อมสถานะ Loading / Ready
- เพิ่ม Timeline custom พร้อม Track Fill, Loop Range และ Marker A/B แบบลากได้
- เพิ่ม Navigator ด้านล่าง Timeline รองรับลากขอบเพื่อซูมช่วง และลากกลางเพื่อเลื่อนช่วง
- เพิ่ม Speed slider 0.01x - 2.0x
- เพิ่ม Pan & Zoom box แบบ viewport draggable พร้อม Zoom แนวตั้ง 1.0x - 10.0x
- เพิ่มปุ่ม Play / Pause / Set A / Set B / Clear Loop ให้เรียงแบบ Dock Control
- เพิ่ม Utility buttons: Jump A, Jump B, -1s, +1s
- เพิ่ม Modal Get Link สำหรับ Copy Screen/Control Link
- เพิ่ม Modal Sponsor เวอร์ชัน PepsLive แทนข้อมูลแบรนด์ต้นฉบับ
- ปรับ Screen mode ให้โปร่งใสสำหรับ OBS Browser Source
- ปรับระบบ sync ด้วย BroadcastChannel + IndexedDB ให้ Control และ Screen ใช้งานร่วมกัน
- ตรวจ JavaScript syntax ด้วย `node --check` แล้วผ่าน

## V1.0.0

- สร้าง Peps VAR Replay Studio เวอร์ชันแรก
- เพิ่ม Control mode และ Screen mode ในไฟล์เดียว
- เพิ่ม Drag & Drop video
- เพิ่ม IndexedDB video cache
- เพิ่ม BroadcastChannel sync
- เพิ่ม Play / Pause / Set A / Set B / Clear Loop
- เพิ่ม Timeline และ Navigator zoom
- เพิ่ม Speed control
- เพิ่ม Zoom / Pan / Reset View
- เพิ่ม Copy OBS Screen Link
- เพิ่ม Keyboard Shortcuts
- เพิ่ม README และ Workflow analysis
