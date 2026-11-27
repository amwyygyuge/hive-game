import './style.css';
import { GameApplication } from './app/GameApplication';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('游戏挂载节点不存在');

try {
  const application = new GameApplication(root);
  // Diagnostics deliberately expose values, never a writable session or debug gameplay controls.
  Object.defineProperty(window, '__hiveDiagnostics', { value: () => application.getDiagnostics(), configurable: true });
  void application.initialize();
  import.meta.hot?.dispose(() => application.dispose());
} catch (error: unknown) {
  root.textContent = `无法启动游戏：${error instanceof Error ? error.message : String(error)}。请使用支持 WebGL 2 的桌面浏览器。`;
  console.error(error);
}
