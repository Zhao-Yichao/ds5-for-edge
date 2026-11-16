# DS5 for Edge

用 Sony DualSense 在 Microsoft Edge 中浏览网页：L1/R1 切换标签页，摇杆或方向键选择链接与按钮，× 确认。视频播放控制作为增强功能。

当前版本：**0.9.14 · 预览版**。基于 TypeScript、WXT 和 Manifest V3，当前实现为纯浏览器扩展。

## 功能

- 在普通 HTTP(S) 网页中按空间方向选择可交互元素，显示高亮并按需滚动。
- 跨标签页切换、返回上一页，通过功能菜单关闭当前标签页。
- 控制视频播放、进度、全屏和静音，并提供 B 站适配。
- 可拖动的手柄入口、按键说明和功能菜单，记忆控件位置与启用状态。
- 保留网页原有键鼠操作，失焦、断连和切换页面时重置持续输入。

0.9.14 修复功能菜单与按键说明往返后，说明图随鼠标移动消失的问题；菜单新增“返回按键指示”。

## 安装与使用

1. 从 [Releases](https://github.com/Zhao-Yichao/ds5-for-edge/releases) 下载最新预览版 ZIP，解压到固定目录。GitHub 的 Source code ZIP 是源码包，需要先构建。
2. 在 Edge 打开 `edge://extensions`，启用“开发人员模式”，点击“加载解压缩的扩展”，选择包含 `manifest.json` 的解压目录。
3. 在普通网页中打开手柄入口或扩展弹窗，选择“启用控制”，并按浏览器提示允许网站访问。
4. 连接 DualSense，点击网页并按一次手柄按键，让浏览器发现设备；释放按键和摇杆后开始操作。

更新时用新包替换解压目录内容，然后在扩展页重新加载。也可从源码构建后加载 `artifacts/build/extension/edge-mv3/`。

| 输入 | 操作 |
| --- | --- |
| 方向键 / 左摇杆 | 高亮选择网页元素 |
| 右摇杆上下 | 滚动网页 |
| × / ○ | 确认 / 取消或逐层返回 |
| L1 / R1 | 上一 / 下一标签页 |
| L3（按下左摇杆） | 返回上一页 |
| □ / △ | 播放暂停 / 播放器全屏 |
| L2 / R2 | 后退 / 前进 5 秒，按住连续跳转 |
| R3（按下右摇杆） | 视频静音 |
| Options | 功能菜单，含关闭当前标签页 |

关闭窗口内最后一个标签页会关闭该窗口。控制无响应时，先确认网站访问权限和启用状态，再释放按键，点击网页后重新唤醒手柄。扩展弹窗可查看连接状态及切换诊断。

## 权限与数据

扩展声明 `activeTab`、`storage`、`scripting` 及普通 HTTP(S) 网站访问权限，以便跨站显示控制入口、读取网页布局并执行操作。可通过 Edge 的网站访问设置限制范围。

启用状态和控件位置保存在扩展本地存储。切换诊断仅在内存保留有限事件与耗时，不记录网页正文、完整 URL、搜索词或设备唯一标识。项目不配置遥测服务。

## 支持范围

- 主要面向 Windows 上的 Edge 和标准映射手柄；实体 USB、蓝牙兼容性、系统缩放及具体网站效果仍需实际环境确认。
- `edge://`、浏览器工具栏和受保护商店页面无法注入网页控制；地址栏聚焦时需用键鼠回到网页。
- 当前没有触摸板系统指针或 Windows 本地助手，复杂网页控件及播放器全屏受浏览器能力约束。
- 0.9.14 的既有验证记录为 82 项单元、67 项 Chromium 和 43 项本机 Edge 自动化检查；手柄使用合成 Gamepad。这些自动化检查不替代实体设备与具体网页的实际体验。

## 从源码构建

准备 Node.js 22 与 npm，以及 PowerShell；依赖固定在包内锁文件，不需要全局安装 WXT。

```powershell
git clone https://github.com/Zhao-Yichao/ds5-for-edge.git
cd ds5-for-edge
./scripts/build-demo.ps1
```

脚本依次准备类型、执行类型检查与单元测试、构建并打包。扩展位于 `artifacts/build/extension/edge-mv3/`，ZIP 位于 `artifacts/releases/`。如 PowerShell 策略阻止运行，也可在 `src/extension/` 手动执行：

```powershell
npm ci
npm run prepare
npm run check
npm test
npm run build
```

## 仓库内容

公开仓库保留扩展源码、固定版本的依赖清单、运行资源与许可、构建脚本和构建检查所需的单元测试。`tests/unit/` 的测试通过 `npm test` 执行。

Release ZIP 仅包含加载扩展所需的文件和许可声明。内部活动日志、需求调研、协作规则、临时诊断及浏览器测试资料只在本地维护，不纳入公开上传。新增公开目录或文件需先更新 `.gitignore` 中的发布白名单。

## 反馈与许可

通过 [Issues](https://github.com/Zhao-Yichao/ds5-for-edge/issues) 提交问题，请提供扩展/Edge 版本、连接方式、页面类别、操作步骤和实际结果，并隐去账号与私人内容。

项目源码尚未指定开源许可证。第三方 DualSense 图形采用 MIT 许可，作者与固定版本见 [资源说明](assets/controller/README.md) 和 [许可原文](assets/demo/LICENSE-controller.txt)；[其他第三方声明](assets/demo/THIRD-PARTY-NOTICES.txt) 随扩展分发。项目与 Sony、Microsoft 无隶属关系。

