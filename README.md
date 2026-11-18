# 中国房价交互舆图 (China House Price Interactive Atlas)

覆盖全国 34 个省级行政区、**372 个地级/直辖/特区/直管市单元（100% 覆盖）**、**3,296 个区县/乡镇/堂区单元（100% 着色覆盖，含 905 个核心区县实测多维基本面）**、**78 城 3,675 个核心街道/商圈板块房价样本** 与 **按需混合获取的代表小区体检与局部置业诊断引擎** 的渐进式空间房产决策工作台，支持本地混合服务与 GitHub Pages 纯静态部署。

- **主入口**：`index.html` / `china.html`
- **兼容跳转**：`gba.html`、`jingjinji.html`、`yangtze-delta.html`、`chengyu.html`、`middle-yangtze.html`、`west-coast.html`、`shandong-peninsula.html` 自动平滑跳转至全国地图对应城市群视角

## 核心特性

1. **全层级共顶点无缝拓扑与四级渐进下钻（城市 → 区县 → 街道/商圈 → 小区）**
   - **零裂缝共顶点几何体系**：省、市、区县三级行政边界基于统一 GCJ-02 共顶点源数据构建（含 2026 重庆两江新区行政区划调整、新疆兵团新星市/白杨市等最新建制），并通过共享弧段拓扑简化引擎（`src/topo_simplify.js`）对相邻边界单次规范化抽稀，确保相邻多边形共享 100% 一致的顶点序列。
   - **四级空间粒度平滑切换**：
     - `1.0x – 2.8x`：全国 372 城总览视图；
     - `2.8x – 9.0x`：自动按视口懒加载并展开 **3,296 个区县/乡镇单元**（含东莞 34 镇街与松山湖/生态园、中山 23 镇街、香港 18 区、澳门 8 堂区及台湾 **366 个乡镇市区**），自动隐藏底层粗粒度城市底面；
     - `9.0x – 20x`：在区县内部动态叠加经过屏幕碰撞避让的 **街道/商圈板块房价胶囊**，并在右侧档案卡展示全国 3,207 个区县的官方行政街道/乡镇名录；
     - `12x – 28x+`（点击街道/板块后）：按需加载该板块 Top 代表小区均价与涨跌，点击任意小区即可获取 **竣工楼龄、容积率、绿化率、建筑结构、社区户数、物业费、在售/整租样本与实算租售比**，并将 BD-09 坐标精准转换至 **GCJ-02 地图图钉** 落图展示。

2. **四通道轻量按需小区引擎（无需全量预爬几十万小区）**
   - 按 `7天浏览器缓存 → 12核心城静态预热分片 (data/communities/<city>.json) → 本地/边缘代理 (/api/plate & /api/community) → 浏览器 CORS 直连兜底` 顺序自动降级获取，单次请求仅 `<30–50 KB`，兼顾零封禁风险、极速响应与纯静态托管兼容性。

3. **五维量化局部置业诊断 + 可选 BYOK AI 深度看房顾问**
   - **内置五维确定性量化诊断（零成本秒出）**：针对当前选中的城市、区县、街道板块乃至具体小区，自动生成 **① 估值水位与周期位置、② 一二手倒挂/溢价选筹策略、③ 租售比与房贷利率现金流安全垫、④ 具体小区建筑指标（楼龄/容积率/塔板结构）实地看房核查清单、⑤ 25km 通勤圈低价平替片区推荐**。
   - **可选 BYOK AI 深度顾问**：支持填入兼容 OpenAI 协议的接口（如 DeepSeek 等，API Key 仅存本地浏览器），将当前区域、板块、候选小区物理指标与 25km 通勤平替打包为实测 JSON 上下文，结合个人预算与通勤需求生成定制看房建议。

4. **多源深度基本面融合与同源配对标尺校准**
   - **城市 + 区县双层实测基本面**：以禧泰数据/中国房价行情（`creprice.cn`）为主标尺，深度融合聚汇数据（`gotohui.com`：360+ 城市及 **905 个核心市辖区/县** 的独立实测在售新房均价、同比、年租金回报率、房价收入比、近十年峰值回撤及 **1,250+ 条城市与区县级近 12 个月走势曲线** `data/china_city_trends.json`）、房天下（`fang.com`：78 城 **3,675 个核心街道/商圈板块** `data/china_street_plates.json`）及港澳台官方统计（香港 RVD + 中原 CCL、澳门 DSEC、台湾内政部实价登录）。
   - **同城/同区配对标尺对齐**：自动计算跨源配对比例系数 $\kappa$（限幅保护并完整保留原始采集值），将新房均价、十年极值、补充县域、街道板块与小区均价对齐至同一可比标尺，消除跨源统计口径偏差造成的虚假倒挂或断层。

5. **七维空间分析与置业决策工具箱**
   - **七维着色切换**：**二手挂牌 · 新房均价 · 同比涨跌 · 租金回报 · 房价收入比 · 峰值回撤（距十年高点%） · 一二手价差（倒挂/溢价%）**。
   - **近 12 个月房价时光机（时光轴回放）**：支持拖动月份滑块或一键自动播放全国城市与区县近一年月度价格演变，可自由切换 **「当月绝对均价」** 与 **「较首月累计涨跌幅%」**。
   - **15 / 30 / 50 km 都市通勤圈与圆规测距仪**：点击地图任意核心区（如深圳南山、广州天河、上海黄浦、北京海淀）即可绘制大圆等距通勤环与鼠标实时测距尺，自动统计三层通勤圈中位房价并挖掘 **50km 内跨区低价性价比洼地**。
   - **多因子智能选房评分雷达**：支持按总价预算找房，或一键启用 **「刚需低负担」/「高租售比现金流」/「超跌筑底寻优」** 三大置业评分模型。
   - **多区域同屏 PK 对比 + 走势同图指数叠加**：最多 4 个城市或区县同屏横向对比，自动绘制 `首月=100` 归一化走势对比折线图。
   - **视野实时联动统计 + 色阶占比分布条 + 本地收藏夹**：右侧统计栏随地图平移缩放实时重算当前视野中位单价/租售比/收入比；图例内置 8 档样本占比条；支持收藏重点关注区域并导出 CSV / 高清 PNG。

6. **采集防拦截与历史快照兜底（Anti-Blocking & Snapshot Resilience）**
   - 所有采集脚本均内置随机礼貌节流、并发限流、HTTP `403 / 429 / 456 / 503` 与验证码识别熔断器（Circuit Breaker）及 `Last-Known-Good` 历史有效快照回退保护。

## 本地预览（推荐混合按需服务）

```powershell
cd D:\gba-house-price-map
# 启动静态页面 + 小区按需获取与7天持久化缓存服务（默认 8788 端口）
node scripts\serve-local.js 8788
```

若部署于 GitHub Pages 纯静态托管，前端会自动走 `预热分片 -> 浏览器 CORS 直连兜底`；也可按需部署 `scripts/cloudflare-xiaoqu-worker.js`（免费版 Cloudflare Worker）并通过 `?worker=https://your-worker.workers.dev` 启用边缘缓存加速。

## 数据更新与页面构建

```powershell
# 完整拉取多源最新城市、区县基本面及街道板块数据并重建全部图层
node scripts\update-weekly-data.js --generate

# 单独增量刷新区县实测基本面（新房/租售比/收入比/十年极值/12月走势）
node scripts\update-district-fundamentals.js

# 单独更新核心城市街道/商圈板块价格与全国街道乡镇名录
node scripts\update-street-plates.js

# 预热 12 座核心城市热门板块与代表小区静态分片
node scripts\update-community-shards.js

# 仅基于本地已有 JSON 数据快速重建全部页面与图层
node generate_all_maps.js
```

## 目录与脚本说明

- `scripts/serve-local.js`：本地静态服务 + `/api/plate` 与 `/api/community` 按需抓取解析与 7 天落盘缓存代理
- `scripts/cloudflare-xiaoqu-worker.js`：供 GitHub Pages 可选接入的零成本 Cloudflare Worker 边缘缓存代理
- `scripts/update-community-shards.js`：挂载全国核心街道小区列表索引并预热 12 城静态分片 `data/communities/*.json`
- `scripts/update-china-data.js`：多源抓取、配对标尺校准与快照兜底融合（输出 `data/china_house_prices.json` 与 `data/china_city_trends.json`）
- `scripts/update-district-fundamentals.js`：采集并标尺对齐核心城市下辖区县实测新房价、租售比、收入比、十年极值与区县级 12 个月走势
- `scripts/update-street-plates.js`：采集并标尺校准 78 城街道/商圈板块均价，整合全国区县下辖街道乡镇名录（输出 `data/china_street_plates.json`）
- `scripts/build-watertight-geo.js` / `scripts/update-china-geo.js`：构建与维护全国省市区县 GCJ-02 共顶点无缝边界及台湾 366 乡镇市区边界
- `src/xiaoqu_parser.js` / `src/client_xiaoqu_advisor.js`：BD-09→GCJ-02 坐标转换、小区物理指标解析、四通道混合加载与五维置业诊断 + BYOK AI 顾问引擎
- `src/topo_simplify.js`：共享弧段共顶点拓扑 Douglas-Peucker 简化引擎
- `src/china_map_shared.js`：行政区划标准化、WGS-84→GCJ-02 坐标转换、多源配对估算与港澳台分区基准
- `src/simple_map_core.js` / `src/client_map_app.js`：高性能 SVG 舆图生成核心与前端七维空间决策交互引擎
- `generate_china_map.js`：生成 `index.html`、`china.html` 及 34 个省级细化图层 `data/layers/province-*.json`
