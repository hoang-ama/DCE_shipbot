# HƯỚNG DẪN CẤU HÌNH TỔNG ĐÀI ASTERISK VOIP $\rightarrow$ ZALO OA SHIPBOT

Tài liệu này cung cấp cấu hình Dialplan mẫu cho tổng đài **Asterisk / FreePBX** và mô tả luồng xử lý tại [`src/modules/asterisk/routes.ts`](src/modules/asterisk/routes.ts):
1. Khi khách hàng gọi vào Hotline (`19006022` / `0901778008`), tổng đài tự động nhấc máy.
2. Phát file âm thanh lời chào thu sẵn báo rằng **Đi Chung Express sẽ nhắn tin ngay qua Zalo của số điện thoại khách vừa gọi để tư vấn và lên đơn**.
3. Tự động gọi Webhook sang ShipBot (`https://ai.dichung.vn/api/asterisk/incoming-call`) truyền kèm `CallerID` (`callerPhone`) và `uniqueId`.
4. Tự động cúp máy (`Hangup()`).
5. ShipBot tự động tra cứu / khởi tạo **phiên chat 24h cố định (`CHAT-DDMM-XXXX`)** với `subVertical = 'express'`, tôn trọng trạng thái **`humanTakeover`**, rồi gửi tin nhắn chào qua **Zalo OA** hoặc **Zalo ZNS**.

---

## 1. Cấu hình Dialplan Asterisk (`/etc/asterisk/extensions_custom.conf`)

Thêm đoạn context sau vào `/etc/asterisk/extensions_custom.conf` (hoặc `extensions.conf`) và gán Inbound Route của Hotline trỏ về `from-dce-shipbot-ivr,s,1`:

```ini
[from-dce-shipbot-ivr]
exten => s,1,NoOp(=== DCE ShipBot: Nhan cuoc goi tu ${CALLERID(num)} ===)
 same => n,Answer()
 same => n,Wait(0.5)
 ; Phat file loi chao thu san (chuan WAV 8kHz 16-bit mono hoac gsm)
 ; Noi dung: "Cam on quy khach da goi toi Di Chung Express. He thong dang nhan tin ngay qua Zalo cua so dien thoai quy khach vua goi de bao gia va len don nhanh nhat. Xin cam on!"
 same => n,Playback(custom/dce-zalo-greeting)
 ; Goi Webhook sang ShipBot kem CallerID va UniqueID (chay ngam background '&' de khong tre cup may)
 same => n,System(curl -s -X POST "https://ai.dichung.vn/api/asterisk/incoming-call" -H "Content-Type: application/json" -d '{"callerPhone":"${CALLERID(num)}","uniqueId":"${UNIQUEID}"}' >/dev/null 2>&1 &)
 same => n,Wait(0.5)
 same => n,Hangup()
```

Sau khi lưu, nạp lại dialplan trên Asterisk CLI:

```bash
asterisk -rx "dialplan reload"
```

> **Lưu ý bảo mật (Tùy chọn):** Nếu cấu hình biến môi trường `ASTERISK_WEBHOOK_SECRET` trên VPS ShipBot, hãy thêm header `-H "x-api-key: <SECRET_CUA_BAN>"` vào lệnh `curl` ở trên.

---

## 2. Cơ chế Xử lý Trong ShipBot Backend (`src/modules/asterisk/`)

1. **Chống trùng lặp & Chuẩn hóa SĐT**: Chuẩn hóa `callerPhone` (`09...` / `849...`), bỏ qua webhook lặp lại trong vòng 5 phút và lưu nhật ký vào bảng `asterisk_call_logs`.
2. **Tích hợp Phiên chat 24h cố định & Handover**:
   - Với khách **đã từng tương tác OA** (`crm_customers` khớp SĐT): hệ thống gọi `ensureActiveChatSession(matchedUserId, { initialInfo: sessionInfo })` để mở hoặc tiếp nối phiên 24h (`CHAT-DDMM-XXXX`) mặc định `subVertical: 'express'`.
   - **Tôn trọng Human Handover**: Nếu phiên 24h hiện tại đang ở trạng thái `humanTakeover = true` (Ops đang trực tiếp tư vấn cho khách), ShipBot chỉ ghi nhận cuộc gọi vào CRM theo `sessionId` và **không tự ý gửi tin bot** chen ngang.
   - Nếu AI đang bật, hệ thống gửi lời chào tiếp nhận qua **Zalo OA CS API** và chờ khách phản hồi tiếp.
3. **Khách mới hoàn toàn (chưa từng nhắn Zalo OA)**:
   - Theo chính sách Zalo, **Zalo OA CS API** không gửi được chủ động cho người chưa tương tác.
   - ShipBot sẽ dùng **ZNS Template** (cấu hình Template ID ngay trong mục `Tổng đài Asterisk & Zalo ZNS` trên Web UI hoặc `/api/config/asterisk` / `ZALO_ZNS_TEMPLATE_ID`) để gửi tin chào kèm nút **"Nhắn tin ngay"**, hoặc chuyển cảnh báo tới **DCE Ops** kèm link `https://zalo.me/<SĐT>`.

---

## 3. Kiểm thử nhanh (Test Webhook bằng tay)

Endpoint `POST /api/asterisk/incoming-call` luôn mở cho tổng đài gọi (nếu không đặt `ASTERISK_WEBHOOK_SECRET`); trong khi `GET /api/asterisk/calls` là endpoint quản trị (yêu cầu passcode nếu VPS có đặt `ADMIN_PASSCODE`):

```bash
curl -X POST https://ai.dichung.vn/api/asterisk/incoming-call \
  -H "Content-Type: application/json" \
  -d '{"callerPhone":"0987654321","uniqueId":"test-call-001"}'
```
