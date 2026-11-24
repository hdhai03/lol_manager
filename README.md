# Rift Manager — Giả lập HLV Liên Minh Huyền Thoại

Game quản lý đội tuyển LMHT chuyên nghiệp chạy trên trình duyệt, **mặc định tiếng Việt** và có thể đổi sang **tiếng Anh** (nút 🇻🇳/🇬🇧 ở góc trên).

## Tính năng (bản chơi đơn)

- **7 khu vực thật**: LCK, LPL, LEC, LCS, LCP, CBLOL, VCS, gồm 62 đội và hơn 330 tuyển thủ với đội hình theo dữ liệu mùa 2026.
- **Chỉ số tuyển thủ dựa trên thống kê thật**: tỉ lệ thắng, KDA, CS/phút, sát thương/phút, vàng/phút, tầm nhìn, số trận quốc tế. Các chỉ số này được chuẩn hoá theo vị trí trong từng giải, rồi nhân với hệ số sức mạnh của khu vực.
- **15 chỉ số chi tiết, chia 4 nhóm**: Kỹ thuật (last-hit, độ chính xác chiêu, né chiêu, vị trí đứng), Tư duy (nhận thức bản đồ, phán đoán, độ hổ báo, kiên nhẫn, sáng tạo), Tinh thần (tập trung, bản lĩnh, thể lực bền) và Đồng đội (phối hợp, chỉ huy, thích nghi). Chỉ số được suy ra từ số liệu thật của từng tuyển thủ (CS/phút, KDA, sát thương, tầm nhìn, tỉ lệ thắng, độ rộng tướng tủ, tuổi, kinh nghiệm), và OVR được tính theo trọng số riêng của từng vị trí. Ngoài ra còn có đặc điểm (vua đường, tay to lúc khó, mắt thần, nóng nảy, dễ tilt...), thể lực và tinh thần.
- **Chiến thuật**: nhịp độ, ưu tiên mục tiêu, lối chơi (giao tranh tổng / bắt lẻ / đẩy lẻ), mục tiêu giao tranh, hướng đi rừng và chỉ đạo riêng cho từng tuyển thủ.
- **Mô phỏng trong trận (`js/engine.js`)**: trận đấu không được định trước kết quả. Mỗi nhịp 15 giây, 10 AI tuyển thủ tự farm, đổi máu, gank, roam, tranh Rồng/Bọ/Sứ Giả/Baron, công/thủ trụ, đẩy lẻ, bắt lẻ và giao tranh tổng. Chỉ số không cộng thẳng vào sát thương mà quyết định hành vi: trúng/né chiêu, có phát hiện gank hay không, đọc được giao tranh thắng/thua, rút lui đúng lúc, outplay, cướp mục tiêu... Màn xem trận phát lại đúng các khung hình này, kèm bình luận viên giải thích từng pha.
- **Tướng tủ thật**: lấy từ những tướng mỗi tuyển thủ đã chơi trong năm 2026.
- **Meta tướng chuyên nghiệp**: xếp hạng S/A/B/C/D theo tỉ lệ có mặt, cấm/chọn và tỉ lệ thắng ở các patch gần nhất. Trang bị pro được tính từ các trận thật.
- **Mùa giải đầy đủ**: Split 1 → Playoffs → MSI → Split 2 → Playoffs → CKTG (vòng bảng và loại trực tiếp) → kỳ chuyển nhượng → mùa mới.
- **Ngày thi đấu**: tự cấm/chọn theo thứ tự chuẩn giải đấu (20 lượt, có độ hợp tướng với từng tuyển thủ), xem trận diễn biến trực tiếp với biểu đồ chênh lệch vàng, rồng, Baron, trụ và giao tranh, hoặc giả lập nhanh.
- **Quản lý**: xếp đội hình, chọn giáo án tập luyện, mua/bán/giải phóng/gia hạn hợp đồng, theo dõi tài chính (lương, tài trợ, tiền thưởng). Mỗi mùa có tân binh mới, và tuyển thủ lớn tuổi có thể giải nghệ.
- **Lưu game**: tự lưu mỗi ngày, có 3 ô lưu tay, xuất/nhập file save `.json`.

## Chạy game

Game là web tĩnh, không cần build, nhưng phải chạy qua một web server vì trình duyệt chặn `fetch` khi mở file trực tiếp:

```bash
python3 -m http.server 8000
```

Sau đó mở http://localhost:8000. Có thể deploy thẳng lên GitHub Pages, Cloudflare Pages hoặc Netlify.

## Cập nhật dữ liệu

```bash
node scripts/fetch-data.mjs
```

Script tải lại toàn bộ dữ liệu vào thư mục `data/`. Kết quả truy vấn Leaguepedia được cache trong `scripts/.cache/`. Đặt biến `NO_CACHE=1` để tải mới, ví dụ khi giải đấu có cập nhật. Muốn đổi giải hoặc split, sửa mảng `LEAGUES` ở đầu script.

| Nguồn | Dùng cho |
|---|---|
| [Leaguepedia](https://lol.fandom.com) (Cargo API, CC BY-SA 3.0) | Đội, đội hình, thông tin và thống kê tuyển thủ, pick/ban chuyên nghiệp |
| [Riot Data Dragon](https://developer.riotgames.com/docs/lol#data-dragon) | Tướng, trang bị (tên tiếng Việt + Anh), hình ảnh |

> Meta lấy từ trận đấu **chuyên nghiệp** chứ không lấy từ op.gg, vì op.gg không có API công khai và điều khoản của họ cấm thu thập dữ liệu tự động. Với game quản lý đội pro, meta thi đấu chuyên nghiệp cũng sát thực tế hơn meta xếp hạng.

## Logo & ảnh tuyển thủ

```bash
node scripts/fetch-images.mjs
```

Script tải logo 7 giải, MSI và CKTG, logo 62 đội và ảnh chân dung của tuyển thủ (326/332 người có ảnh, ai thiếu sẽ hiện chữ cái đầu) từ Leaguepedia. Ảnh được thu nhỏ, chuyển sang WebP và lưu trong `assets/`. Đường dẫn ảnh nằm trong `data/images.json`. Logo quá tối sẽ tự được đặt trên nền sáng.

> Logo đội/giải và ảnh tuyển thủ thuộc bản quyền của các đội, Riot Games và nhiếp ảnh gia. Chỉ dùng cho dự án fan phi thương mại; nếu phát hành rộng, hãy cân nhắc bỏ thư mục `assets/team`, `assets/player`, `assets/league`. Game vẫn chạy bình thường khi thiếu chúng.

### Gói ảnh (tuỳ chọn)

```bash
python3 scripts/build_pack.py
```

Lệnh này gộp toàn bộ ảnh thành một file `data/assets-pack.json` (khoảng 2MB). Dùng gói này khi deploy lên nơi giới hạn số file. Muốn game dùng gói, đặt `window.RIFT_PACK = true` trước `js/main.js`. File gói không được commit lên repo.

## Kiểm thử

```bash
node tests/sim-season.mjs "T1"
```

Lệnh này giả lập tự động 2 mùa giải và in nhà vô địch các giải, kích thước file save và các lỗi đội hình nếu có.

```bash
node tests/engine-stats.mjs 400
```

Lệnh này chạy 400 ván ngẫu nhiên rồi in thống kê của engine: thời lượng, số mạng, trụ, rồng, Baron, CS/sát thương/vàng mỗi phút theo vị trí, số lần xảy ra từng loại tình huống, và tỉ lệ thắng theo chênh lệch OVR.

## Cấu trúc

```
index.html          trang chính
css/style.css       giao diện
js/i18n.js          bản dịch Việt / Anh
js/data.js          tải dữ liệu
js/state.js         trạng thái game, lưu/tải
js/season.js        lịch thi đấu, playoffs, MSI, CKTG, chuyển nhượng
js/attrs.js         hệ chỉ số chi tiết, đặc điểm, thể lực, chiến thuật
js/engine.js        mô phỏng trong trận theo nhịp 15 giây
js/sim.js           cấm/chọn AI, nối engine với mùa giải
js/match.js         màn hình ngày thi đấu
js/ui.js            các màn hình còn lại
scripts/fetch-data.mjs  script lấy dữ liệu
```

---

Rift Manager không được Riot Games xác nhận và không phản ánh quan điểm của Riot Games hay bất kỳ ai tham gia sản xuất hoặc quản lý League of Legends. League of Legends và Riot Games là thương hiệu hoặc thương hiệu đã đăng ký của Riot Games, Inc. Chỉ số tuyển thủ là ước tính của game, không phải đánh giá chính thức.
