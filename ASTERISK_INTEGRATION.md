# HƯỚNG DẪN CẤU HÌNH TỔNG ĐÀI ASTERISK VOIP $\rightarrow$ ZALO OA SHIPBOT

Tài liệu này cung cấp cấu hình Dialplan mẫu cho tổng đài **Asterisk / FreePBX** để thực hiện kịch bản:
1. Khi khách hàng gọi vào Hotline (`19006022` / `0901778008`), tổng đài tự động nhấc máy.
2. Phát file âm thanh lời chào thu sẵn báo rằng **Đi Chung Express sẽ nhắn tin ngay qua Zalo của số điện thoại khách vừa gọi để tư vấn và lên đơn**.
3. Tự động gọi Webhook sang ShipBot (`https://ai.dichung.vn/api/asterisk/incoming-call`) truyền kèm `CallerID` (SĐT khách gọi).
4. Tự động cúp máy (`Hangup()`).
5. ShipBot tự động gửi tin nhắn chào từ **Zalo OA** tới SĐT đó và khởi động lại luồng thu thập thông tin đơn hàng.

---

## 1. Cấu hình Dialplan Asterisk (`/etc/asterisk/extensions_custom.conf`)

Thêm đoạn context sau vào file `/etc/asterisk/extensions_custom.conf` (hoặc `extensions.conf`) và gán Inbound Route của Hotline trỏ về `from-dce-shipbot-ivr,s,1`:

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

> **Lưu ý bảo mật (Tùy chọn):** Nếu bạn cấu hình biến môi trường `ASTERISK_WEBHOOK_SECRET` trên VPS ShipBot, hãy thêm header `-H "x-api-key: <SECRET_CUA_BAN>"` vào lệnh `curl` ở trên.

---

## 2. Cấu hình Zalo ZNS (Dành cho khách mới chưa từng nhắn Zalo OA)

Theo chính sách của Zalo, **Zalo OA CS API** chỉ nhắn được cho người đã từng quan tâm/tương tác với OA.
- Nếu SĐT gọi đến **đã từng tương tác OA**: ShipBot tự tra `user_id` trong `crm_customers` và gửi thẳng tin nhắn chào qua Zalo OA CS API ngay lập tức.
- Nếu SĐT gọi đến **là khách mới hoàn toàn**:
  1. Đăng ký 01 **ZNS Template** trên Zalo Cloud Account với nội dung chào hỏi và 01 nút CTA **"Nhắn tin ngay"** trỏ về Zalo OA của DC Express.
  2. Điền **Template ID** vào phần cấu hình **Tổng đài Asterisk & Zalo ZNS** ngay trong mục `Zalo OA` trên Web UI của ShipBot (hoặc biến `ZALO_ZNS_TEMPLATE_ID`).

---

## 3. Kiểm thử nhanh (Test Webhook bằng tay)

Bạn có thể test nhanh bằng lệnh `curl` hoặc nút **Test Cuộc Gọi** trên Web UI:

```bash
curl -X POST https://ai.dichung.vn/api/asterisk/incoming-call \
  -H "Content-Type: application/json" \
  -d '{"callerPhone":"0987654321","uniqueId":"test-call-001"}'
```
