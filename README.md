# HIVE / BELOW · 深层巢穴

单张异星工业巢穴地图的单人斜俯视生存射击。杀怪攒金币、购买武器、升级三选一，集齐六块电池，守住开门倒计时并穿过出口。每拔走一块电池，巢穴就更黑、虫群就更狂暴。

## 本地启动

需要支持 WebGL 2 / Web Audio 的桌面浏览器、Node.js 与 pnpm，以及本地 `assets-tuned/` 模型。

```sh
pnpm install
pnpm dev
```

打开 http://127.0.0.1:5173 。模型加载完成后点击「进入巢穴」，同时解锁浏览器声音。

```sh
pnpm check    # TypeScript 静态检查
pnpm test     # 确定性领域规则测试
pnpm build    # 检查类型并生成 dist/
pnpm preview  # 预览生产构建
```

## 操作

| 输入 | 操作 |
|---|---|
| WASD | 移动 |
| 鼠标 / 左键 | 瞄准 / 射击 |
| R / 空格 | 换弹 / 冲刺 |
| E | 电池、商店、大门、防火门交互 |
| F | 近身处决，回复生命与弹匣 |
| Q | 满槽释放肾上腺素 |
| 1–5 | 切换已购买武器 |
| Tab / Esc | 展开战术地图 / 暂停 |

商店不是安全区。升级选择会暂停战斗，打开商店不会。页面失焦自动暂停，回来后主动继续。

## 实现与扩展

- TypeScript + Three.js；调参后的本地 GLB、骨骼动画和程序化攻击 / 死亡反馈。
- 领域模拟与渲染、音频、UI 分离；固定步长推进，经快照和事件协作。
- Web Audio 合成分层配乐与方位拟音；正式音频可在音频边界替换。
- 机制和内容状态、扩展步骤、验收方法见 **[DEVELOPMENT.md](DEVELOPMENT.md)**，后续 Agent 从这里开始。

## 策划与资源依据

- [design-v3.md](design-v3.md)：整体策划、机制、数值与画风。
- [music-design.md](music-design.md)：正式音乐和声音制作规格。
- [assets-tuned/TUNING.md](assets-tuned/TUNING.md)：62 个本地模型的调参记录，以此处烘焙尺寸为准。
- [assets/ASSETS.md](assets/ASSETS.md)：初期资源调研清单；其中下载进度早于完整本地资源。
- [reference/preview.html](reference/preview.html)：早期 CDN 模型预览，不是当前游戏入口。

## 许可证与发布

Polyfork 模型遵循其许可。原始清单标注可商用、免署名、禁止再分发素材文件本身。不要将 `assets-tuned/` 或构建产物当成独立素材包发布；公开部署前自行复核网站运行分发方式是否符合当前许可。

模型通过本地打包接入，不需要游戏运行时访问 Polyfork CDN。缺失模型时应恢复授权资源，不能用占位物冒充完成。仓库中的音乐需求书描述正式制作目标，不代表约 220 条成品音频已经完成。
