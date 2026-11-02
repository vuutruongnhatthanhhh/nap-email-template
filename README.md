# Nạp Email Template

Tiện ích Chrome tích hợp vào Gmail để điền nhanh template email, kèm trang
quản lý template & danh sách người nhận. Gửi hàng loạt dùng **Bcc** nên các
người nhận không thấy nhau trong CC.

## Cấu trúc

```
extension/   Chrome extension (Manifest V3, Vite + React) — chạy trên mail.google.com
web/         Trang quản lý (Next.js) — CRUD template & người nhận
shared/      Type dùng chung giữa extension và web
supabase/    migrations/*.sql — chạy lần lượt trong Supabase SQL editor
```

## 1. Thiết lập Supabase

1. Tạo project tại [supabase.com](https://supabase.com).
2. Mở **SQL Editor**, chạy lần lượt từng file trong
   [`supabase/migrations/`](supabase/migrations) theo đúng thứ tự số:
   [`0001_init_schema.sql`](supabase/migrations/0001_init_schema.sql) (bảng
   templates/recipients) rồi
   [`0002_template_images_bucket.sql`](supabase/migrations/0002_template_images_bucket.sql)
   (storage bucket `template-images` cho ảnh chèn trong editor). Khi có
   thêm thay đổi DB sau này, thêm file mới đánh số tăng dần (`0003_...`)
   thay vì sửa lại file cũ.
3. Vào **Project Settings > API**, lấy `Project URL`, `anon public key`, `service_role key`.
4. Copy `.env.example` → `.env` ở thư mục gốc, điền 3 giá trị trên — và copy
   tiếp thành `web/.env.local` (Next.js chỉ đọc file env trong `web/`,
   không đọc file ở thư mục gốc).
5. Vào **Authentication > Sign In / Providers > Email**, tắt **Confirm
   email** — để tạo tài khoản xong là đăng nhập được ngay, khỏi cần xác
   nhận qua email (trang đăng ký đã tự xử lý cả hai trường hợp).

Extension đọc chung file `.env` ở thư mục gốc (Vite được cấu hình `envDir`
trỏ về đó) — chỉ cần điền một lần. `web/.env.local` là file riêng vì
Next.js không đọc file env ở thư mục gốc.

## 2. Cài đặt

```bash
npm install
```

## 3. Chạy trang quản lý (web)

```bash
npm run dev:web
```

Mở http://localhost:3000 → tạo tài khoản (email/mật khẩu) → tạo template →
thêm người nhận & gán template (hoặc Import CSV với cột `email,name,company,template_name`).

Nội dung template dùng editor có đậm/nghiêng/gạch chân, chọn font, chọn màu
chữ, chèn danh sách và chèn ảnh. Ảnh chèn vào được tự convert sang WebP
ngay trên trình duyệt trước khi upload lên Supabase Storage (bucket
`template-images`, public để email client load được ảnh khi gửi).

## 4. Build & cài extension

```bash
npm run build:extension
```

Chrome → `chrome://extensions` → bật **Developer mode** → **Load unpacked**
→ chọn `extension/dist`. Mở extension popup, đăng nhập bằng đúng tài khoản
đã dùng ở trang quản lý.

Khi dùng: mở Gmail, bấm **Soạn thư**, sẽ thấy icon nhỏ cạnh ô Tiêu đề:
- **Điền nhanh** — chọn 1 người nhận → tự điền To, Tiêu đề, Nội dung (thay
  `{{name}}`, `{{email}}`, `{{company}}` theo người đó).
- **Gửi hàng loạt (Bcc)** — chọn 1 template → tick những người nhận dùng
  template đó → có 2 nút:
  - **Gửi hết tự động (N)** — rủi ro cao nhất: hỏi xác nhận 1 lần, rồi **tự
    động mở từng cửa sổ soạn thư mới, điền đúng `{{name}}`/`{{company}}`
    riêng cho từng người, tự bấm Send — liên tục cho đến hết N người**,
    không dừng lại hỏi han gì thêm. Có thẻ tiến độ ở góc màn hình với nút
    **Dừng lại** trong lúc chạy. Nếu bất kỳ bước nào thất bại (không mở
    được cửa sổ mới, không điền được, không gửi được) thì **dừng ngay lập
    tức**, báo rõ đã gửi tới đâu — không tự ý bỏ qua người lỗi rồi chạy
    tiếp.
  - **Gửi từng người (N)** — điền **To** + thay đúng `{{name}}`/`{{company}}`
    riêng cho từng người, nhưng mỗi người là **1 email riêng** (không gộp
    Bcc). Cửa sổ soạn thư hiện tại được điền sẵn người đầu tiên — anh tự
    kiểm tra rồi bấm Send thật. Mỗi lần bấm **Soạn thư** mới sau đó, cửa sổ
    tiếp theo tự điền sẵn người kế tiếp trong danh sách, cứ vậy cho đến hết.
    Khác với nút trên, chế độ này **không bao giờ tự bấm Send** — luôn
    cần anh tự xác nhận từng email trước khi gửi. Panel sẽ hiện banner
    xanh báo còn bao nhiêu người, có nút **Huỷ** nếu muốn dừng giữa chừng.

### Lưu ý về Gmail DOM

Gmail không có API DOM chính thức cho extension bên thứ ba; các selector
dùng để tìm ô Tiêu đề / Nội dung / To-Cc-Bcc nằm hết trong
[`extension/src/content/selectors.ts`](extension/src/content/selectors.ts).
Nếu Google đổi giao diện Gmail và icon/điền tự động ngừng hoạt động, đây là
nơi duy nhất cần sửa — mở DevTools trên Gmail, kiểm tra lại `aria-label`
của ô tương ứng rồi cập nhật selector.

## Dev loop cho extension

```bash
npm run dev:extension   # rebuild khi có thay đổi
```

Sau mỗi lần rebuild, vào `chrome://extensions` bấm nút reload trên thẻ
extension để Chrome nạp lại code mới.
