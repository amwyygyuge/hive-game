# 模型素材清单（Polyfork）

下载方式：`https://polyfork.dev/cdn/<id>.glb`（免 key）。许可证：Polyfork licence — 可商用、免署名、禁止再分发素材文件，故 GLB 不入仓，本地存于 `assets-src/`（不纳入版本管理）。

## 已下载并验证（2026-11-27，demo 首批）

| 用途 | ID | 实测尺寸 | 动画 | 备注 |
|---|---|---|---|---|
| 主角 | base-commander-0ec028 | 高 1.70 m | Idle/Walk/Run | 已定主角：隐藏数据板 mesh、右手挂枪、制服压暗 |
| 巢虫 | alien-hive-bug-base | 4.75 m（原生巨型） | Walk/Idle/Run | 入游戏缩放 ~×0.35；参数：眼 1.3、颚 1.3、外颚 1.25、腹 1.15，条纹毒绿 #7dff4a、肉血红 #6e1423 |
| 酸爆蚜 | green-aphid-base | 0.56 m | Walk/Idle/Run | 改荧光绿 |
| 跳蛛 | tarantula-base | 0.33 m | Idle/Walk/Run | 放大 ×4.5 到 ~1.5 m |
| 横行蟹 | reef-crab-base | 0.9 m | Idle/Walk/Run | 放大 ×1.6 |
| 电池组 | battery-bank-b4d362 | 1.5×1.88×1.1 m | 无 | 大门供电单元/电池点底座 |
| 管道 | pipe-run-280a0d | 长 4 m | 无 | 布景；同系还有 concrete-full-pipe-section-00e1b6、pipe-junction-5b146a |
| 弹药箱 | ammo-crate-ee3ec0 | 0.88 m | 无 | 布景/商店陈列 |
| 铁门 | iron-bound-door-e0e953 | 1.93×2.68 m | 无 | 房间门；大门（重型闸门）待另选 |
| 卵囊 | ant-pupa-cocoon-3e6ebd | 1.09 m | 无 | 蚁后区布设，搏动用缩放动画程序化实现 |

共同短板：全部模型无攻击/死亡动画 — 程序化补（瞄准转向+武器挂手、攻击用位移突进、死亡倒地旋转+沉降）。

## 阵容其余模型（未下载，见 design-v3.md 阵容表）

stone-centipede-base（掘地蜈蚣）、ant-queen-base（蚁后）、common-wasp-base（毒蜂）、bat-base（墓穴蝠）、praying-mantis-base（螳螂）、stag-beetle-base（锹甲）、velociraptor-base（迅猛龙）、honey-moth-base（人面蛾）、flesh-eater-base（食尸兽）、moon-jellyfish-base（月光水母）、hermit-crab-base（寄居蟹）、moray-eel-base（排水鳗）、earthworm-base（沙虫 Boss）、leopard-slug-base（蛞蝓 Boss）、site-generator-298792（发电机）、orb-web-133aba / cobweb-drape-f65d43（蛛网）、ant-nest-chamber-6b786b（蚁巢腔）、skull-and-bone-scatter-3dea4c（骨骸散落，使用前需逐个核对非人骨造型）

## 不采用（存档）

- bitkiln PSX Horror Monsters 样品：Hound 已实测（GLB 合法、8 动画、双皮肤、可商用禁再分发），风格不搭不混用；Shambler 为人形，不用
- 步兵 infantry-rifleman-c1c0a5：WW1 造型，主角落选
