# 房价交互地图

静态站点入口是 `index.html`，可直接通过 GitHub Pages 部署。

- `index.html` / `china.html`：全国渐进式房价地图
- `gba.html`、`jingjinji.html`、`yangtze-delta.html` 等旧地址：保留为兼容跳转，主体验统一回到全国地图

## 本地预览

```powershell
cd D:\gba-house-price-map
python -m http.server 8765 --bind 127.0.0.1
```

然后打开：

```text
http://127.0.0.1:8765/
```

旧专题地址仍然可访问，会跳回全国地图并定位：

```text
http://127.0.0.1:8765/jingjinji.html
```

## 数据口径

- 全国城市：禧泰数据/中国房价行情首页城市排行，住宅挂牌均价；GitHub Actions 每周一 04:00（北京时间）尝试抓取最新页面并重新生成站点。
- 渐进细化：全国初始显示城市级边界；放大到任意地区时，会按省份懒加载县/区级边界和标签。
- 县区价格：已有区县独立房价的区域优先使用区县数据；其他县区沿用所属城市住宅挂牌均价作为底色和标签，并在详情口径中标注。
- 旧专题：页面不再显示专题按钮；旧专题 URL 仅用于兼容已分享链接。
- `※` 标记：表示该区域使用不同来源的补充估算，便于和主数据一起粗略对比。
- 香港：按香港差饷物业估价署（RVD）私人住宅均价与 Centadata 分区指数折算为人民币/㎡。
- 澳门：按澳门统计暨普查局 2026 年第一季住宅楼价指数折算为人民币/㎡。
- 东莞、中山等不设县级区划的地级市：全国图放大后按 OSM 镇街边界展示；有独立房价的镇街优先用独立数据，其余沿用城市均价。
- 边界：白线为城市或区县边界，深色线为省/市范围。
- 底图：行政边界使用阿里云 DataV.GeoAtlas；可在页面开启高德中文瓦片真实地图叠加，并用滑块调节房价图层透明度。

## 生成脚本

- `generate_all_maps.js`：统一生成所有地图页面。
- `generate_china_map.js`：生成全国渐进式地图，并同步写入 `index.html` 和 `china.html`，同时输出按省懒加载的 `data/layers/province-*.json` 细节图层。
- `scripts/update-china-geo.js`：缓存全国市级 `_full` 边界源文件，供县区级图层生成使用。
- `generate_gba_house_price_map.js`：生成大湾区页面和静态 SVG/HTML。
- `generate_jjj_map.js`：基于 `src/simple_map_core.js` 生成京津冀页面。
- `generate_redirect_pages.js`：把旧专题 URL 改成全国地图的兼容跳转入口。
- `src/simple_map_core.js`：可复用的 SVG 交互地图核心，后续新增区域优先复用它。

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
