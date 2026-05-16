# 粤港澳大湾区房价交互地图

静态站点入口是 `index.html`，可直接通过 GitHub Pages 部署。

## 本地预览

```powershell
cd D:\gba-house-price-map
python -m http.server 8765 --bind 127.0.0.1
```

然后打开：

```text
http://127.0.0.1:8765/
```

## 数据口径

- 内地城市：禧泰数据/中国房价行情，住宅挂牌均价；GitHub Actions 每周一 04:00（北京时间）尝试抓取最新页面并重新生成站点。
- `※` 标记：表示该区域使用不同来源的补充估算，便于和主数据一起粗略对比。
- 香港：按香港差饷物业估价署（RVD）私人住宅均价与 Centadata 分区指数折算为人民币/㎡。
- 澳门：按澳门统计暨普查局 2026 年第一季住宅楼价指数折算为人民币/㎡。
- 中山补充镇街：使用房天下查房价二手房参考均价；小榄镇已包含 2021 年并入的东升片区行政边界。
- 深圳：大鹏新区是功能区，页面将其从龙岗区面中单列；当前房价源未单列大鹏新区时，该区域显示边界但不参与排行。
- 东莞、中山：属于不设县级区划的地级市，页面使用 OSM 镇街边界展示；无房价数据的镇街保持浅灰。
- 边界：白线为区县/镇街边界，深色线为 9+2 城市范围。
- 底图：行政边界使用阿里云 DataV.GeoAtlas 与 OSM；可在页面开启 OpenStreetMap 真实地图叠加，并用滑块调节房价图层透明度。

手动更新可以在 Actions 页面运行 `Deploy GitHub Pages` 工作流，或本地执行：

```powershell
node scripts\update-weekly-data.js --generate
```

## GitHub Pages 发布

如果 GitHub Actions 的 Pages 部署一直停在 queued，可以改用分支发布：

- Settings → Pages
- Source: Deploy from a branch
- Branch: main
- Folder: /root

站点入口文件是仓库根目录的 `index.html`。
