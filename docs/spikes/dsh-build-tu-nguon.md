# Build dsh từ mã nguồn — kết quả

> 26/10/2026 · dsh `0.2.1-rc.2` · repo `github.com/deepseek-ai/deepseek-harness` (MIT) · làm trong thư mục tạm, repo aris không bị sửa (ngoài tệp này).

## Kết luận

Build được. Mã chạy (`lib/` phía máy chủ) giống bản npm từng byte. Aris chạy được trên bản tự build: build xanh, 100 tệp test và 559 test đều qua. Có một điều kiện: tên lớp CSS đã băm của dsh phụ thuộc đường dẫn build, nên muốn ra đúng tên lớp như bản npm phải vá một dòng (xem mục "Khác biệt" và "Rủi ro").

## Môi trường và thời gian

| Mục | Giá trị |
|---|---|
| Commit | `687f282e8625c6b8d11ff58211a90524be2e4317` (tag `dsh-v0.2.1-rc.2`, merge PR #6408 "release-dsh-0.2.1-rc.2", 17/10/2026) |
| Node | 22.23.1 (repo đòi `^22.19.0 \|\| >=24`) |
| pnpm | repo ghim `11.28.5`; máy có 10.33.0 nên cài riêng bản 11.28.5 vào thư mục tạm |
| Công cụ khác | `cc` (clang) để biên dịch addon native; không cần Rust hay Python |
| Tải mã (`git clone`) | 2 phút 21 giây (mạng chậm, 517 MB) |
| `pnpm install --frozen-lockfile` | 1 phút 25 giây, 1402 gói |
| `pnpm run build` | 96 giây, 9/9 bước đạt |
| `pnpm run build:official` (build lại) | 32 giây |
| `vitest run` toàn repo | 6 phút 34 giây |
| Dựng bản sao aris (install, build, test) | khoảng 40 + 15 + 5 giây |

## Bước 1 · Tải mã, chọn commit

- Repo có tag `dsh-v0.2.1-rc.2` (tên tag có tiền tố `dsh-`, không phải `v0.2.1-rc.2`). Chọn tag này.
- Cách kiểm lại: trường `gitHead` trên npm không có (`npm view @deepseek-ai/dsh@0.2.1-rc.2 gitHead` trống). Ngày phát hành npm là 17/10/2026 08:36 UTC; tag là bản phát hành cùng ngày. Bằng chứng mạnh nhất là bước 5: 4305 tệp trùng từng byte với bản đã cài.
- Bản npm ghi sẵn commit `332895e` trong gói client. Commit này không có trong repo công khai: đó là commit của nhánh PR trước khi gộp. Tag trỏ vào commit gộp `687f282`. Hai chuỗi này là khác biệt duy nhất về commit.

## Bước 2 · Hướng dẫn build

Đọc `docs/development.md`, `package.json` gốc, `scripts/build.ts`, `native/system/scripts/build.ts`, `scripts/install-lefthook.mjs`.

- Cài: `pnpm install`. Lệnh này chạy hai script `postinstall`, cả hai đã đọc trước khi chạy:
  - `subprocess-local`: chỉ đặt quyền thực thi cho `spawn-helper` của node-pty.
  - `scripts/install-lefthook.mjs`: ghi hook git vào chính bản sao `src/` (không ra ngoài).
- Build: `pnpm run build` (đủ: addon native, tsc, tsdown, bundle desktop, bundle client, web, kiểm tra tổng).
- Addon native `flock` biên dịch tại chỗ bằng `cc` và header Node có sẵn. Không tải binary.
- `pnpm-workspace.yaml` chỉ cho `esbuild`, `lefthook`, `node-pty`, `koffi` chạy script cài. Electron không nằm trong danh sách, nên không có bước tải Electron.
- Không gặp `curl | sh` hay tải binary từ host lạ. Mạng chỉ dùng cho `registry.npmjs.org` và `github.com` (clone).

## Bước 3 · Cài và build

- `pnpm install`: đạt. Có cảnh báo gói không hợp nền tảng (native linux/x64) và phụ thuộc vòng; cả hai vô hại.
- `pnpm run build`: đạt, không lỗi. Ghi nhận 325 tệp client.
- Cần nhớ: build thường (`pnpm run build`) ra "bản cục bộ": tên sản phẩm lấy từ `brand.localBuild`, plugin brand-official tắt. Bản npm dùng profile chính thức. Muốn giống npm phải chạy `pnpm run build:official` (đặt `DSH_CLIENT_BUILD_PROFILE=official`, tên "DeepSeek Harness", commit và phiên bản; không cần khoá bí mật).

## Bước 4 · Test của repo

`vitest run` chạy hết trong 6 phút 34 giây: 2132 tệp, 44351 test. Qua 44101, bỏ qua 243, hỏng 6 (5 tệp ổn định hỏng, 1 tệp chập chờn).

| Test hỏng | Nguyên nhân (nhận định, chưa đào sâu) |
|---|---|
| `scripts/build.spec.ts` "keeps artifact steps in serial dependency order" | Quá 5 giây (timeout), máy đang tải nặng |
| `packages/experimental/worktree/tests/sandbox.spec.ts` "does not widen a linked-checkout grant…" | Hành vi git/sandbox khác trên macOS hoặc trong thư mục tạm |
| `packages/preset/agent-preset/tests/skills.spec.ts` "render below the pruner threshold" | 8239 > 8192; có vẻ phụ thuộc độ dài đường dẫn tuyệt đối |
| `packages/ptc-runtime/ptc-runtime-node/tests/persistent-process.spec.ts` | Nhận `output-limit` thay vì `exception` |
| `packages/subprocess/subprocess-local/tests/spawn-runner.spec.ts` | Test đường dẫn Windows, chạy trên macOS |
| `packages/boot/plugin-manager/tests/operations-process.spec.ts` | Chập chờn: hỏng khi chạy cả bộ, qua khi chạy riêng |

Chạy riêng 6 tệp này: 5 hỏng lại, 1 qua. Không hỏng nào liên quan tới hành vi aris dùng; không cố sửa.

## Bước 5 · So với bản npm

So 10 gói aris dùng nhiều nhất, theo đúng danh sách tệp mà `npm pack --dry-run` sẽ đóng gói, bằng băm SHA-256:

| Gói | Tệp trong gói | Trùng | Khác |
|---|---|---|---|
| dsh | 18 | 18 | 0 |
| dsh-session | 26 | 26 | 0 |
| dsh-agent | 22 | 22 | 0 |
| dsh-llm | 36 | 36 | 0 |
| dsh-storage-domain | 11 | 11 | 0 |
| dsh-api-session-controller | 79 | 79 | 0 |
| dsh-credentials-local | 7 | 7 | 0 |
| dsh-tools | 26 | 26 | 0 |
| dsh-user-approval | 10 | 10 | 0 |
| dsh-client-connection | 26 | 26 | 0 |

(Mỗi gói bản đã cài còn `LICENSE` và `package.json`; hai tệp này không so.)

Mở rộng ra toàn bộ 297 gói `@deepseek-ai/dsh-*` đang cài trong aris: 4459 tệp, **4305 trùng từng byte**, 60 tệp khác (đều là bundle trình duyệt `client*.js` và bộ DevTools), 94 tệp không có tên tương ứng trong bản build (tên chunk của DevTools).

Cái gì khác, theo từng lớp:

| Lớp khác biệt | Tệp | Giải thích |
|---|---|---|
| Đường dẫn tuyệt đối trong chú thích `//#region` | gần như mọi tệp client trong 60 tệp | Chỉ là chuỗi: bản npm ghi `/home/runner/work/deepseek-harness/deepseek-harness/...` |
| Tên lớp CSS đã băm (`hVGvvW_row`…) | Nhiều tệp client (hầu hết trong 60 tệp) | Băm theo đường dẫn tuyệt đối của tệp `.module.css` (đã kiểm: cùng tệp, đổi tiền tố đường dẫn là ra đúng `hVGvvW`). Quan trọng với aris, xem dưới |
| Chuỗi commit (`332895e` so với `687f282`) | `client-modules`, `client-ui-sidebar` | Chỉ chuỗi hiển thị phiên bản |
| Bản cục bộ so với bản chính thức | `client-ui-brand-official`, `client-ui-layout` | Chỉ khi chạy `build` thường. Dùng `build:official` thì hết |
| DevTools (`dsh-experimental-inspector`) | `devtools_app.js`, `resource-manifest.json`, 94 chunk | Tên chunk và băm khác (24.740 KB so với 24.760 KB). Nhánh thử nghiệm, aris không dùng |

Sau khi vá một dòng (xem dưới) và dùng `build:official`, phần còn khác chỉ là: chú thích đường dẫn, chuỗi commit, và DevTools. Mã chạy thật (phía máy chủ) không khác.

Mã thật chạy phía trình duyệt (bundle client) cũng trùng sau chuẩn hoá đường dẫn và commit, trừ DevTools.

### Điều kiện: tên lớp CSS của aris

`packages/aris-ui-theme/src/client/overrides.ts` ghi cứng tên lớp đã băm (`Sixlwa_bubble`, `oRe1gG_bubble`, `ROF66W_bubble`, `mna1RW_card`…). Bản build ra tên khác, nên `brand.test.ts` hỏng 4 test và CSS chỉnh của aris lặng lẽ hết tác dụng.

Cách vá thử (đã kiểm): bước ghi `lightningcss.transform({ filename })` trong `packages/client/tsdown.client.ts` đổi tiền tố đường dẫn thành `/home/runner/work/deepseek-harness/deepseek-harness` trước khi băm. Bản vá nằm ở `dsh-build/css-hash.patch` (bản lưu trong repo: [`docs/spikes/dsh-build/css-hash.patch`](dsh-build/css-hash.patch)) (1 dòng chức năng, đọc biến môi trường `DSH_CSS_HASH_PREFIX`). Với bản vá, tên lớp ra giống hệt npm và 4 test qua.

## Bước 6 · Aris chạy trên bản tự build

Làm trên bản sao `dsh-build/aris-copy` (xuất bằng `git archive HEAD`, commit `476b4eb`), không phải repo thật.

Cách làm cuối cùng:
1. Đóng gói mọi gói công khai của dsh: `pnpm --filter "./packages/*/*" --filter "./apps/cli" --filter @deepseek-ai/dsh-web-frontend pack --pack-destination tarballs` (344 tệp `.tgz`, 25 MB, 7 giây). `pnpm pack` đã đổi `workspace:` thành phiên bản cụ thể.
2. Chạy một registry cục bộ nhỏ (`dsh-build/registry.mjs`, bản lưu: [`docs/spikes/dsh-build/registry.mjs`](dsh-build/registry.mjs), 32 dòng Node, cổng 4873): phục vụ 344 gói này, chuyển tiếp mọi thứ khác tới `registry.npmjs.org`.
3. Trong bản sao: `.npmrc` với `@deepseek-ai:registry=http://127.0.0.1:4873/`, xoá `pnpm-lock.yaml`, `pnpm install`, `pnpm build`, `npx vitest run`.

Kết quả:
- Lockfile mới: 298 gói dsh, 0 gói từ npm (kiểm bằng `resolution` trong lockfile).
- `pnpm build`: đạt (15 giây).
- `npx vitest run`: **100/100 tệp, 559/559 test qua** (với bản vá CSS). Không vá: 99/100 tệp, 555/559 (4 test tên lớp CSS ở trên).
- `dsh --version` từ bản sao trả `0.2.1-rc.2` (dùng `DSH_HOME` tạm). Chưa chạy daemon, chưa gọi model.

Vướng ở đường `pnpm.overrides` (đã thử trước, bỏ):
- Bản đầu dùng `overrides` trỏ `file:` tới từng tarball. Kết quả là lẫn lộn: 278 gói từ tarball, phần còn lại vẫn từ npm. Lý do: nhiều gói dsh khai `peerDependencies` trỏ gói dsh khác (ví dụ `dsh-agent-preset` cần `dsh-agent-preset-registry`), `pnpm.overrides` không áp cho peer, mà `auto-install-peers` kéo bản npm về. Kết quả là hai bản của cùng một gói dsh trong cây. Không dùng cách này.
- `link:` tới `src/packages/...` không thử: gói liên kết dùng `node_modules` riêng của `src/`, dễ sinh hai bản `cordis`/`react`.
- Registry cục bộ giải quyết gọn vì mọi chỗ (kể cả peer) đều hỏi cùng một nơi.
- Bẫy khi làm lại: pnpm nhớ bản mô tả gói (packument) trong bộ nhớ đệm. Đổi tarball mà giữ `XDG_CACHE_HOME` cũ thì vẫn ra bản cũ. Đặt thư mục đệm mới mỗi lần đổi tarball.

## Cách làm lại từ đầu

Đặt `D` là thư mục làm việc. Chạy trong shell riêng, không đụng cấu hình toàn cục.

```sh
# 1. Mã nguồn đúng bản
git clone https://github.com/deepseek-ai/deepseek-harness $D/src
git -C $D/src checkout dsh-v0.2.1-rc.2

# 2. pnpm đúng bản, cài cục bộ (không toàn cục)
npm install --prefix $D/tools pnpm@11.28.5
export PATH=$D/tools/node_modules/.bin:$PATH
export pnpm_config_store_dir=$D/store XDG_CACHE_HOME=$D/cache XDG_DATA_HOME=$D/data

# 3. Cài và build bản giống npm
cd $D/src && pnpm install --frozen-lockfile
export DSH_CSS_HASH_PREFIX=/home/runner/work/deepseek-harness/deepseek-harness   # cần bản vá css-hash.patch
git apply /đường/dẫn/css-hash.patch
pnpm run build:official

# 4. Đóng gói
pnpm --filter "./packages/*/*" --filter "./apps/cli" --filter @deepseek-ai/dsh-web-frontend pack --pack-destination $D/tarballs

# 5. Phục vụ và dùng
node registry.mjs $D &      # cổng 4873
# trong repo aris: .npmrc thêm  @deepseek-ai:registry=http://127.0.0.1:4873/
# rồi bỏ lockfile cũ, pnpm install --store-dir ..., pnpm build, npx vitest run
```

Lưu ý: ghim `pnpm_config_store_dir`. Nếu quên, pnpm 11 ghi vào kho chung `~/Library/pnpm/store/v11` (lần chạy đầu của báo cáo này đã lỡ ghi vào đó khoảng 300 gói; chỉ là bộ nhớ đệm, không ảnh hưởng gì).

### Vá nhỏ bằng `pnpm patch`

Chưa chạy thử. Với một lỗi nhỏ ở một gói, không cần tự giữ cả dsh.

```sh
pnpm patch @deepseek-ai/dsh-session@0.2.1-rc.2    # sửa lib/ trong thư mục tạm in ra
pnpm patch-commit <thư mục tạm>                   # ghi patches/ và patchedDependencies
```

Với lỗi trong bundle client thì sửa trong `lib/client.js` (đã dựng sẵn). Với vá lớn hoặc nhiều gói, dùng cách tự build ở trên cho gọn.

## Rủi ro và việc cần làm nếu thật sự phải tự giữ dsh

Rủi ro:
- Đường dẫn CSS: tên lớp băm theo đường dẫn. Không vá thì lớp CSS chỉnh của aris hỏng lặng lẽ (test báo, nhưng giao diện lệch). Cách bền hơn: bỏ tên lớp băm ra khỏi CSS của aris, chuyển sang bộ chọn theo thuộc tính (`data-*`) hoặc tự gắn lớp qua plugin.
- pnpm 11.28.5 là bản ghim của dsh, aris đang dùng pnpm 10.33.0. Hai bản chạy được cùng nhau (bản sao aris dùng 10.33.0), nhưng nâng dần lên 11 sẽ gọn hơn.
- Một số test của repo dsh hỏng trên macOS (5 tệp, ở trên). Nếu tự giữ thì phải biết đâu là hỏng sẵn để không nhầm với lỗi mình gây ra.
- Bộ DevTools (`dsh-experimental-inspector`) không giống từng byte. Aris không dùng.
- Giấy phép MIT: được sửa và phân phối; giữ nguyên thông báo bản quyền (`LICENSE`, `THIRD_PARTY_NOTICES.md`).
- Dung lượng: `src` 2,7 GB sau khi build. Máy dev đủ, CI cần cache.
- dsh vẫn đang ra bản mới (đã có `0.2.1-rc.3`, 23/10/2026). Tự giữ nghĩa là tự quyết có hợp nhất bản mới hay không.

Việc cần làm:
1. Giữ một bản sao mã nguồn (fork) ở tag `dsh-v0.2.1-rc.2`, kèm `css-hash.patch`.
2. Đưa bước "dựng + đóng gói + so sánh" thành script (`scripts/`) và CI, mỗi lần so băm với bản npm (mã `lib/` phía máy chủ phải trùng từng byte).
3. Tách tên lớp CSS khỏi `overrides.ts` (xem trên).
4. Có sẵn registry cục bộ hoặc kho tarball trong repo riêng để `pnpm install` không phụ thuộc npm của DeepSeek.
5. Quyết định chính sách theo dõi bản mới: chỉ chọn vá bảo mật, hay hợp nhất định kỳ.

## Dọn dẹp và dung lượng

Thư mục `dsh-build` giữ nguyên để xem: `/private/tmp/claude-501/-Users-hoangbatau-Desktop-working-project-aris-agent--claude-worktrees-fervent-bose-b47879/937c696a-f6cb-479c-baeb-ecb957e4f53c/scratchpad/dsh-build/`

| Thư mục | Dung lượng |
|---|---|
| `src` (mã + build, trong đó `node_modules` 2,0 GB) | 2,7 GB |
| `aris-copy` | 643 MB |
| `xdg` (kho pnpm và bộ đệm cục bộ) | 1,1 GB |
| `tarballs` | 25 MB |
| `tools` (pnpm 11) | 23 MB |
| Tổng | 4,5 GB |

Đã làm ngoài thư mục tạm: lần chạy `pnpm install` đầu (trước khi ghim kho riêng) thêm khoảng 300 gói vào kho chung `~/Library/pnpm/store/v11`; `npm` ghi bộ đệm thường lệ ở `~/.npm`. Không đổi cấu hình nào.

Bản vá `css-hash.patch`, script `registry.mjs`, `cmpall.mjs`, `cmpnorm2.mjs` (so băm toàn bộ gói) đều nằm trong `dsh-build/`.
