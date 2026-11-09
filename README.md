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
   templates/recipients),
   [`0002_template_images_bucket.sql`](supabase/migrations/0002_template_images_bucket.sql)
   (storage bucket `template-images` cho ảnh chèn trong editor),
   [`0003_admin_profiles.sql`](supabase/migrations/0003_admin_profiles.sql)
   (bảng `profiles` đánh dấu admin — tự động cấp quyền admin cho
   `vuutruongnhatthanh@gmail.com` nếu tài khoản đó đã tồn tại, và cho mọi
   tài khoản tạo sau này có đúng email đó),
   [`0004_template_attachments.sql`](supabase/migrations/0004_template_attachments.sql)
   (bảng `template_attachments` + storage bucket private `template-attachments`
   cho file đính kèm),
   [`0005_reply_snippets.sql`](supabase/migrations/0005_reply_snippets.sql)
   (bảng `reply_snippets` — mẫu phản hồi nhanh). Khi có thêm thay đổi DB
   sau này, thêm file mới đánh số tăng dần (`0006_...`) thay vì sửa lại
   file cũ.
3. Vào **Project Settings > API**, lấy `Project URL`, `anon public key`, `service_role key`.
4. Copy `.env.example` → `.env` ở thư mục gốc, điền 3 giá trị trên + `GEMINI_API_KEY`
   (lấy tại [aistudio.google.com/apikey](https://aistudio.google.com/apikey),
   dùng cho tính năng "Soạn bằng AI") — và copy tiếp thành `web/.env.local`
   (Next.js chỉ đọc file env trong `web/`, không đọc file ở thư mục gốc).
5. Vào **Authentication > Sign In / Providers > Email**, **tắt "Allow new
   users to sign up"** (hoặc tương đương tuỳ phiên bản dashboard) — trang
   web đã bỏ hẳn form đăng ký, nhưng tắt thêm ở đây để chặn cả việc gọi
   thẳng API đăng ký công khai từ bên ngoài. Tài khoản chỉ còn tạo được
   qua trang **Admin** trong app (xem mục 5 bên dưới), hoặc thủ công qua
   **Authentication > Users > Add user**.

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

Mở http://localhost:3000 → đăng nhập bằng `vuutruongnhatthanh@gmail.com`
(tài khoản admin có sẵn từ migration `0003`, dùng đúng mật khẩu đã đặt lúc
tạo tài khoản đó trên Supabase Dashboard) → tạo template → thêm người nhận
& gán template (hoặc Import CSV với cột `email,name,company,template_name`).

Nội dung template dùng editor có đậm/nghiêng/gạch chân, chọn font, chọn màu
chữ, chèn danh sách và chèn ảnh. Ảnh chèn vào được tự convert sang WebP
ngay trên trình duyệt trước khi upload lên Supabase Storage (bucket
`template-images`, public để email client load được ảnh khi gửi).

**Soạn bằng AI**: ô "✨ Soạn bằng AI" phía trên — gõ mô tả nội dung cần
viết, chọn **độ dài** (ngắn gọn ~100 từ / đầy đủ ~250 từ) và **văn phong**
(trang trọng / thân thiện / chuyên nghiệp / thuyết phục), bấm "Tạo nội
dung" — gọi Gemini qua route server-side
[`web/src/app/api/ai/compose/route.ts`](web/src/app/api/ai/compose/route.ts)
(key `GEMINI_API_KEY` không lộ ra trình duyệt), điền thẳng vào Tiêu đề +
Nội dung (hỏi xác nhận nếu đã có nội dung sẵn để tránh ghi đè nhầm). AI có
thể tự chèn `{{name}}`/`{{company}}` nếu hợp ngữ cảnh.

**File đính kèm**: trong form sửa template (phải **lưu template trước**,
mục đính kèm mới hiện ra) có mục "File đính kèm" — upload file lên bucket
private `template-attachments` (chỉ chủ sở hữu đọc/ghi được, không public
như ảnh). Giới hạn nhắc 25MB (giới hạn của Gmail).

Khi extension điền template vào Gmail, nó tự gắn file vào email bằng
quyền **`debugger`** của Chrome (Chrome DevTools Protocol) — tải file từ
Supabase, lưu tạm xuống máy qua `chrome.downloads`, dùng debugger giả lập
1 cú kéo-thả "thật" (trusted) vào ô soạn thư, rồi xoá file tạm đi. Lý do
phải đi đường này: Gmail chặn mọi sự kiện kéo-thả do script tự tạo
(`event.isTrusted = false`) — đã test và xác nhận không ăn — chỉ debugger
protocol mới tạo được sự kiện ở tầng trình duyệt mà Gmail chấp nhận.

**Đánh đổi**: mỗi lần attach file, Chrome sẽ hiện **banner vàng** báo
*"[tên extension] đang debug trình duyệt này"* trong vài giây (tới khi
debugger detach xong). Đây là hành vi mặc định của Chrome khi bất kỳ
extension nào dùng quyền `debugger`, không che giấu được. Nếu không có
file đính kèm, bước này được bỏ qua hoàn toàn, không có banner nào cả.

### Quản lý tài khoản (trang Admin)

Không còn form đăng ký công khai — chỉ admin mới tạo được tài khoản mới,
qua tab **Admin** (chỉ hiện với tài khoản admin) trong trang quản lý:
nhập email + mật khẩu (có nút tạo mật khẩu ngẫu nhiên), tick **"Cấp quyền
admin"** nếu muốn tài khoản mới cũng được quyền tạo tài khoản khác. Tài
khoản tạo ra dùng được ngay, không qua bước xác nhận email nào (nên cũng
không đụng tới giới hạn gửi email của Supabase). Mật khẩu phải tự gửi cho
người đó qua kênh riêng (Zalo, Slack…) — hệ thống không tự gửi email nào.

Việc này chạy qua route server-side
[`web/src/app/api/admin/users/route.ts`](web/src/app/api/admin/users/route.ts)
dùng `service_role key` (không bao giờ lộ ra trình duyệt) để gọi Supabase
Admin API, có kiểm tra người gọi thật sự là admin (qua bảng `profiles`)
trước khi cho tạo tài khoản mới.

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

Khi **trả lời 1 email trong luồng thư** (không phải soạn thư mới), ô trả
lời cũng có icon riêng — bấm vào để tìm và **chèn nhanh 1 mẫu phản hồi**
(quản lý ở tab "Mẫu phản hồi") vào đúng vị trí con trỏ đang gõ, không ghi
đè nội dung đã gõ sẵn.

### Lưu ý về Gmail DOM

Gmail không có API DOM chính thức cho extension bên thứ ba; các selector
dùng để tìm ô Tiêu đề / Nội dung / To-Cc-Bcc nằm hết trong
[`extension/src/content/selectors.ts`](extension/src/content/selectors.ts).
Nếu Google đổi giao diện Gmail và icon/điền tự động ngừng hoạt động, đây là
nơi duy nhất cần sửa — mở DevTools trên Gmail, kiểm tra lại `aria-label`
của ô tương ứng rồi cập nhật selector.

**File đính kèm** — đã thử giả lập sự kiện kéo-thả thuần DOM
(`dragenter`/`dragover`/`drop`) trước, nhưng Gmail chặn vì đó là sự kiện
không do người dùng thật tạo ra (`event.isTrusted = false`): dữ liệu đúng,
không lỗi gì, nhưng file không bao giờ xuất hiện. Đổi sang dùng quyền
`debugger` của Chrome ([`extension/src/background/debuggerAttach.ts`](extension/src/background/debuggerAttach.ts))
để tạo sự kiện kéo-thả "thật" ở tầng trình duyệt — xem chi tiết đánh đổi
(banner cảnh báo) ở mục 3 phía trên. Nếu Google thay đổi cách CDP xử lý
`Input.dispatchDragEvent` hoặc cách Gmail nhận file, đây là file cần sửa.

## Dev loop cho extension

```bash
npm run dev:extension   # rebuild khi có thay đổi
```

Sau mỗi lần rebuild, vào `chrome://extensions` bấm nút reload trên thẻ
extension để Chrome nạp lại code mới.
