# OSE-SCDP frontend (P3-2)

React + TypeScript (Vite) + Tailwind. Gọi API `ose-scdp-backend` (mặc định `http://127.0.0.1:8000`, đổi bằng `VITE_API_BASE`).

Tab: 01 Dữ liệu · 02 Bay plan · 03 Thiết bị · 04 Ổn định (biểu đồ nghiêng, GMcorr, chúi) · 05 Tối ưu & DES (B1 hoặc CP-SAT, vòng lặp D-09, tải JSON/Excel) · 06 Lần lặp DES ·
07 Replay 2D/3D (mặt bằng dọc bến, bay plan, 3D Three.js, Gantt, chạy/dừng/tua) · 08 KPI · 09 Kịch bản (B1, B1S, tối ưu, độ nhạy số xe).
Hình ở mọi thời điểm là hàm thuần của event log (`src/lib/replay.ts`, phép thử T15); ổn định luôn NOT VERIFIED ở G2a.

```powershell
Set-Location C:\apps\ose-scdp-frontend
npm install
npm test            # T15: replay 2D (7) + 3D (4)
npm run typecheck
npm run dev         # http://localhost:5173 (API phải đang chạy)
```
