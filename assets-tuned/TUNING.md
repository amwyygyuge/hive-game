# 模型调参记录（2026-11-27 烘焙进 GLB）

调参方式：Polyfork 的颜色是顶点色（COLOR_0 float），直接改二进制烘焙；尺寸用根节点 scale 烘焙；几何参数用骨骼节点 scale。原始文件在 assets-src/，调后文件在 assets-tuned/，脚本 tune_glb.py 可重跑。校验：全部 GLB 结构合法、动画片段完好、尺寸复测如下。

## 逐个记录

| 模型 | 尺寸烘焙 | 颜色烘焙 | 几何 |
|---|---|---|---|
| 巢虫 alien-hive-bug | ×0.32 → 体长 1.52 m、高 0.9 m | 芥末黄条纹 (0.58,0.36,0.04) → 毒绿 (0.35,0.85,0.18)；暗红肉色 → 血红 (0.40,0.07,0.12)；甲壳去饱和 25%、压暗至 0.9、微紫染 | 双颚节点 ×1.3、腹（Gaster）×1.15 |
| 酸爆蚜 green-aphid | ×1.6 → 长 0.9 m | 体绿 → 荧光酸绿 (0.45,1.0,0.16)；眼 → 亮红 (0.38,0.03,0.03) | — |
| 跳蛛 tarantula | ×4.5 → 1.5 m | 橙褐斑纹 → 灰褐 (0.38,0.24,0.15)；全体去饱和 45%、提亮 1.15（变异兽族灰褐系） | — |
| 横行蟹 reef-crab | ×1.6 → 宽 1.44 m | 亮红壳 → 暗红 (0.40,0.05,0.035)（甲壳族暗红系）；米色 → 去饱和 (0.44,0.35,0.24)；全体压暗 0.9 | — |
| 主角 base-commander | ×1.0（高 1.70 m） | 制服蓝灰 → 深炭蓝 (0.055,0.075,0.115)；全体去饱和 15%、压暗 0.92 | 隐藏右手数据板（46 号节点 mesh 移除）；右手挂枪为运行时挂 attach-righthand |
| 道具 ×5（电池组/管道/弹药箱/铁门/卵囊） | ×1.0 | 全体去饱和 25%、压暗 0.85，与怪物同一画风管线 | — |

## 第二批：枪械与建筑（2026-11-27 补，脚本 tune_glb2.py）

枪械（去饱和 35%、压暗 0.8，枪械金属系；尺寸原生即手持比例）：

| 游戏武器 | 模型 | 尺寸 | 说明 |
|---|---|---|---|
| 手枪 | pistol-42de05 | 长 0.22 m | 初始武器 |
| 冲锋枪 | rifle-df1815 | 长 1.16 m | 站内无 SMG/突击步枪，此为步枪廓形代用 — 斜俯视角下廓形优先 |
| 霰弹枪 | bolt-action-rifle-2f1793 | 长 1.1 m | 长枪廓形代用霰弹 |
| 脉冲机枪 | rotary-cannon-e2114b | ×0.62 → 长 1.12 m | 旋转多管炮廓形，缩至手持 |
| 火箭筒 | rocket-launcher-032299 | 长 1.3 m | 原生即火箭筒 |
| 消音器 | 无模型 | — | 引擎内用圆柱几何程序化生成，挂枪口 |

建筑（工业件：去饱和 30%、压暗 0.72–0.78、冷色染 (0.94,0.98,1.06)；巢穴有机件：去饱和 15–20%、压暗 0.8–0.85、暖染）：

| 用途 | 模型 | 尺寸 | 说明 |
|---|---|---|---|
| 走廊直段 | corridor-section-ca3da4 | 3×3×4 m | 与下两件同系成套 |
| 走廊拐角 | corridor-corner-8661f8 | 3.5×3×3.5 m | |
| 走廊 T 口 | corridor-t-junction-237109 | 4×3×4 m | |
| 站式走廊 | station-corridor-d7efdb | 1.85×1.85×4.58 m | 窄段/气闸感 |
| 墙板排 | formwork-wall-panel-run-52e9f5 | 4×3.78 m | 混凝土模板墙，腔体围墙 |
| 地砖 | terminal-floor-tile-d863d6 | 4×4 m | 工业地砖，铺地基元 |
| 蜂巢面板 | wild-honeycomb-panel-877542 | 5×4.75 m | 巢穴有机墙面贴皮 |
| 蚁巢腔 | ant-nest-chamber-6b786b | 8×4.95×8 m | 整腔件，孵化腔直接用 |

## 已知取舍

- 巢虫「眼睛 ×1.3」无法单独烘焙：眼睛与头部是同一 mesh、无独立节点，Polyfork 的 .mjs 参数靠运行时变形，GLB 里做不到；颚和腹已按参数烘焙。影响很小（斜俯视角下眼睛本就不是焦点）
- 全部模型仍无攻击/死亡动画，维持程序化补位方案
- 调参可逆：assets-src 原始文件未动，改 tune_glb.py 重跑即可出新版本

## 入仓说明

GLB 为二进制，GitHub 连接器只能传文本，故模型文件不经连接器入仓；本记录与 ASSETS.md 入仓，模型 zip 由 Amani 在会话中交付，本地 assets-tuned/ 为准。

## 第三批：全阵容补齐（2026-11-27，脚本 tune_glb3.py）

按族色板统一处理：虫群族=去饱和25%+压暗0.9+紫染；变异兽族=去饱和45%灰褐；甲壳族=去饱和20%+压暗0.88；S级=去饱和50%+压暗0.8苍白灰；Boss=去饱和30%+压暗0.85；工业道具=冷灰；有机布景=暖暗。

| 模型 | 角色 | 缩放→实测尺寸 | 动画 |
|---|---|---|---|
| stone-centipede-base | 掘地蜈蚣 | ×1.4 → 长 3.56 m | Crawl/Idle |
| ant-queen-base | 蚁后 | ×1.3 → 长 2.46 m | Walk/Idle/Run |
| common-wasp-base | 毒蜂 | ×0.4 → 长 0.86 m | Idle/Fly/Fly fast |
| bat-base | 墓穴蝠 | ×1.6 → 翼展 0.88 m | Walk/Idle/Run/Fly |
| praying-mantis-base | 镰刀螳螂 | ×0.3 → 高 1.74 m | Walk/Idle/Run |
| stag-beetle-base | 冲锋锹甲 | ×0.3 → 长 1.88 m | Walk/Idle/Run |
| velociraptor-base | 迅猛龙 | ×1.3 → 长 2.12 m、高 1.29 m | Idle/Walk/Run |
| honey-moth-base | 人面蛾 | ×3.0 → 翼展 1.2 m | Idle/Fly/Fly fast |
| flesh-eater-base | 大颚食尸兽 | ×1.5 → 长 2.24 m | Walk/Idle/Run |
| hermit-crab-base | 假电池寄居蟹 | ×0.7 → 0.64 m（电池大小，拟态前提） | Idle/Walk/Run |
| moray-eel-base | 排水鳗 | ×1.3 → 长 1.65 m | Idle/Swim/Swim fast |
| moon-jellyfish-0fa43c | 月光水母 | ×0.5 → 高 1.22 m，半透明材质（BLEND）保留 | Idle/Swim/Swim fast |
| earthworm-base | Boss 钻地沙虫 | ×1.5 → 长 10.0 m | Crawl/Idle |
| leopard-slug-base | Boss 豹纹巨蛞蝓 | ×1.0 → 长 7.24 m | Crawl/Idle |
| octopus-base | 备用（深水区怪） | ×0.5 → 1.76 m | Idle/Swim×3 |
| garden-orb-weaver-base | 备用（织网蛛） | ×0.3 → 1.63 m | Walk/Idle/Run |

布景补齐（×1.0，除注明）：混凝土整管 concrete-full-pipe-section（4 m）、管道接头 pipe-junction、栅栏牢门 barred-cell-door（大门候选）、油桶 oil-drum（环境杀核心道具）、野战控制台 field-console（商店终端）、工地发电机 site-generator、蛛网 orb-web（×0.15 → 3.4×6.5 m 装饰）、蛛网垂幕 cobweb-drape、骨骸散布 skull-and-bone-scatter（使用前需目检骨骼形状是否人形）、黑曜石岩 obsidian-fang-rock、红渣岩 red-scoria-rock。

注：月光水母的正确资产 ID 是 moon-jellyfish-0fa43c（旧记 moon-jellyfish-base 不存在，CDN 404）。

## 第四批：楼宇（2026-11-27 补，脚本 tune_glb4.py）

整栋建筑，统一工业冷灰处理（去饱和 30%、压暗 0.78、冷染）。原生即楼宇尺度，除维修机库外均 ×1.0。

| 模型 | 楼宇 | 尺寸（宽×高×深 m） | 游戏用途 |
|---|---|---|---|
| command-center-e65850 | 指挥中心 | 8×7.7×8 | 基地主楼/大门厅地表对应物 |
| reactor-block-13fe72 | 反应堆楼 | 8×6×8 | 供电区地标（电池/大门动力主题） |
| habitat-dome-8d3499 | 居住穹顶 | 8×7.1×8 | 生活区 |
| shuttle-hangar-8ff9a3 | 航天机库 | 12×6×12 | 大型库房 |
| maintenance-hangar-6fab99 | 维修机库 | 原生 56×25×48，×0.3 → 16.8×7.5×14.4 | 维修区 |
| vehicle-depot-hangar-6adb80 | 车辆库 | 16×13×16 | 车库（全批最高） |
| observation-tower-69b692 | 观察塔 | 4×12.2×4 | 塔楼地标 |
| concrete-pillbox-ea855a | 混凝土碉堡 | 4×2.2×4 | 防御工事 |
| brick-depot-warehouse-3dd642 | 砖仓 | 12×7.2×8 | 储藏区 |
| dock-warehouse-bf0967 | 码头仓库 | 6×5.2×8 | 储藏区 |
| rolled-plate-silo-42304a | 筒仓 | 4×9.4×4 | 存储塔 |
| standby-generator-enclosure-9d48f6 | 发电机楼 | 4×3.6×2 | 供电点小楼 |

至此模型总数 62：角色 1、怪物 20、备用怪 2、枪械 5、建筑构件 8、楼宇 12、道具 14。
