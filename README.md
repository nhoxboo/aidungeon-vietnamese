# ⚔️ AI Dungeon Tiếng Việt (VietDungeon Assistant)

**VietDungeon** là công cụ Userscript cao cấp giúp bạn trải nghiệm thế giới game phiêu lưu nhập vai AI Dungeon (`play.aidungeon.com`) hoàn toàn bằng **Tiếng Việt 100%** mượt mà, tiện lợi và tự nhiên.

---

## 🌟 Các Tính Năng Nổi Bật

| Tính năng | Mô tả chi tiết |
| :--- | :--- |
| 📖 **Dịch cốt truyện thời gian thực (Realtime Story Translation)** | Tự động nhận diện khi AI Dungeon sinh ra diễn biến mới và dịch tức thì sang tiếng Việt. Hỗ trợ 3 chế độ: **Song ngữ** (Hiện cả tiếng Anh gốc + Tiếng Việt), **Thuần Việt** (Ẩn tiếng Anh), và **Gốc** (EN). |
| ⚡ **Hỗ trợ nhập Action Tiếng Việt (Vietnamese Input Helper)** | Gõ tiếng Việt tự nhiên vào ô lệnh (`Tôi rút thanh kiếm và xông vào hang động`). Script tự động dịch sang tiếng Anh chuẩn RPG trước khi gửi vào AI Dungeon, đảm bảo AI hiểu chính xác ngữ cảnh 100%. |
| ⌨️ **Live Preview & Phím tắt nhanh** | Xem trước bản dịch tiếng Anh bên dưới ô gõ trước khi gửi; phím tắt chọn nhanh mode: **Do (Hành động)**, **Say (Nói)**, **Story (Kể tiếp)**. |
| 🚀 **Bộ Engine dịch thuật linh hoạt** | Mặc định sử dụng **Google Translate API** tốc độ cao, hoàn toàn miễn phí và không cần cấu hình API key. Hỗ trợ tùy chọn nâng cao dùng **AI LLM (Gemini / Groq / DeepSeek / OpenAI)** cho câu từ trau chuốt theo phong cách tiểu thuyết nhập vai kỳ ảo. |
| 🎨 **Giao diện HUD Hiện đại (Theme White-Blue)** | Biểu tượng nổi `[🇻🇳 VN]` ở góc màn hình, cho phép bật/tắt dịch, đổi chế độ hiển thị và tùy biến chỉ với 1 cú click. |

---

## 🛠️ Hướng Dẫn Cài Đặt (Dễ Dàng Trong 1 Phút)

### 👉 Cài Đặt 1-Click (Khuyên dùng)
Nếu trình duyệt của anh đã có tiện ích **Tampermonkey** hoặc **Violentmonkey**, chỉ cần click vào link bên dưới:
👉 **[Cài Đặt Trực Tiếp Script (Raw UserScript)](https://raw.githubusercontent.com/nhoxboo/aidungeon-vietnamese/main/aidungeon-vietnamese.user.js)**

---

### Cách Cài Thủ Công

1. Cài đặt tiện ích mở rộng **Tampermonkey** hoặc **Violentmonkey** trên trình duyệt của bạn (Chrome, Edge, Brave, Cốc Cốc, Firefox):
   - [Tampermonkey cho Chrome / Edge / Brave](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
2. Mở Dashboard của Tampermonkey -> Chọn tab **Utilities (Tiện ích)** hoặc dấu `+` để thêm script mới.
3. Sao chép toàn bộ nội dung file:
   `E:\hermes-workspace\aidungeon-vietnamese\aidungeon-vietnamese.user.js`
4. Dán vào và bấm **File -> Save (Lưu)**.
5. Truy cập [https://play.aidungeon.com/](https://play.aidungeon.com/) và tận hưởng game bằng tiếng Việt!

---

## 🎮 Cách Chơi Với Tool

1. **Đọc truyện**:
   - Khi vào bất kỳ kịch bản hoặc cuộc phiêu lưu nào, các đoạn văn sẽ tự động có khung dịch tiếng Việt `[🇻🇳 VI]` màu xanh dương dịu mắt ngay dưới đoạn văn tiếng Anh.
2. **Gửi hành động bằng tiếng Việt**:
   - Gõ trực tiếp bằng tiếng Việt vào ô `What happens next?` ở cuối màn hình.
   - Khi gõ, khung **VietDungeon Input** sẽ hiện live preview bản dịch tiếng Anh.
   - Nhấn **Enter**: Script sẽ tự động chuyển câu lệnh sang tiếng Anh chuẩn và submit vào game cho AI sinh tiếp diễn biến!
3. **Tùy chỉnh chế độ**:
   - Bấm vào nút tròn `[🇻🇳 VN]` ở góc dưới bên phải màn hình để mở Bảng điều khiển:
     - Chuyển giữa: **Song ngữ** ↔ **Thuần Việt** ↔ **Nguyên bản**.
     - Bật/tắt tự động dịch.
     - Đổi máy chủ dịch (Google Translate hoặc AI Key cá nhân).
