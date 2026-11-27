# hive-game — 孤胆枪手网页游戏

类似《孤胆枪手》的网页版双摇杆射击：单张大地图的异星深层巢穴里，杀怪攒金币买枪、升级三选一，集齐 6 块电池解锁大门逃离。恐怖拉满，敌人全部非人形。

- 技术：TypeScript + Three.js，low-poly 3D 斜俯视角（Rotten Row 式）
- 模型：Polyfork 免费 low-poly GLB（清单见 assets/ASSETS.md）
- 画风：D 的感觉（Alien Swarm 式可读性）+ A 的光影（Darkwood 手电/遮挡）+ B 的底色（SIGNALIS 冷灰工业）

## 文档

- [design-v3.md](design-v3.md) — 设计定稿：核心规则、融合机制、阵容、数值体系 v1（已确认）、布景、画风、视角
- [music-design.md](music-design.md) — 音乐与声音设计需求：自适应分层音乐、怪物盲听辨位音效、交付清单
- [assets/ASSETS.md](assets/ASSETS.md) — 模型素材清单（ID、CDN 地址、实测动画/尺寸、许可证说明）
- [reference/preview.html](reference/preview.html) — 早期怪物阵容 3D 预览页（走 Polyfork CDN 加载）

## 待补传（二进制文件）

GitHub 连接器只能传文本，以下文件在本机 `~/workspace/hive-preview/` 与 `~/workspace/hive-game/assets-src/`，需经 GitHub 网页端或本地 git 补传到对应路径：

- styles/ — 画风参考图（style-sheet.png、darkwood.jpg、signalis.png、teleglitch.jpg、swarm.jpg、psx.png、lowpoly.jpg），design-v3.md 已按此路径引用
- sheet1.png / sheet2.png — 怪物阵容拼图（hive-preview 目录下）

## 许可证注意

- Polyfork 模型走 Polyfork licence：可商用、免署名，**禁止再分发素材文件本身** — 因此 GLB 不入仓，按 assets/ASSETS.md 的 CDN 地址重新下载到本地 assets-src/ 使用
- bitkiln PSX 样品（仅作工艺标杆，不采用）同理不入仓
