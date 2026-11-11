# 飞牛相册桌面版（非官方）

[![release](https://img.shields.io/github/v/release/Archettee/fnos-photos-desktop?style=flat-square&label=release)](https://github.com/Archettee/fnos-photos-desktop/releases)
[![downloads](https://img.shields.io/github/downloads/Archettee/fnos-photos-desktop/total?style=flat-square&label=downloads)](https://github.com/Archettee/fnos-photos-desktop/releases)
[![license](https://img.shields.io/github/license/Archettee/fnos-photos-desktop?style=flat-square)](LICENSE)
[![platform](https://img.shields.io/badge/platform-Windows%2010%2F11%20x64-0078d6?style=flat-square)](#%E5%AE%89%E8%A3%85)

把自建 [fnOS](https://www.fnnas.com/) 上的相册网页，封装成一个 Windows 桌面客户端。

> ⚠️ 本项目是第三方社区作品，**与飞牛官方无关**，也不包含飞牛的源码或素材喵。
> 它只是用 Electron 打开你自己 NAS 上的相册页面，并补上桌面端缺的几个能力喵。

## 它解决什么

官方相册只在浏览器里用，于是有这些麻烦：

- 浏览器标签页一关，登录就没了喵；
- 不能常驻托盘，开机还得手动打开喵；
- **照片只能"下载"，不能像本地文件一样拖到微信、QQ、资源管理器里**。

这个壳子把三件事补上了：托盘常驻 + 自动登录 + **按住照片直接拖出成原图文件**。

📖 **完整使用说明见 [docs/使用说明.md](docs/使用说明.md)**（安装、首次配置、多选拖拽、快捷键、常见问题）。

## 功能

| 功能 | 说明 |
| --- | --- |
| 首启向导 | 填入你的 NAS 地址（如 `http://192.168.1.10:5666`），仅保存在本机 |
| 托盘常驻 | 关窗口只是隐藏；托盘菜单可打开、隐藏、改地址、开机自启、退出 |
| 自动登录 | 首次登录时可选择保存账号（DPAPI 加密），之后自动填充并提交 |
| **拖拽导出** | 长按照片选中（支持多选），按住任意已选照片拖到桌面/文件夹/聊天窗口，松手即为**原图文件** |
| 原图直取 | 走 `/api/v1/stream/p/t/{id}/o/{sign}` 原图通道，不是缩略图 |
| 快捷键 | `F11` 全屏、`F5` 刷新、`Ctrl+Shift+Delete` 清除已存账号 |

## 安装

到 [Releases](../../releases) 下载 `FnOS-Photos-Setup-x.y.z.exe`，双击安装（当前用户级安装，无需管理员）。

首次启动会要求填写 NAS 地址；随时可以在托盘菜单「设置 NAS 地址…」里修改。

> 需要 Windows 10/11 x64，且电脑能访问你的 NAS。

## 拖拽导出怎么用

1. 在相册里**长按**一张照片 → 进入多选；继续长按可加选。
2. 按住其中任意一张已选照片（按**图片中间**，别按左上角勾选角标）往外拖。
3. 拖到资源管理器文件夹、桌面，或微信/QQ 聊天窗口，松手。

第一次拖大图会提示「正在取 N 张原图…」，稍等或松手再拖一次即可（第二次已缓存，瞬时完成）。

导出文件命名规则为 `照片_<照片ID>.<扩展名>`，因为原图接口不返回原始文件名。
缓存位于 `%TEMP%\FnOS-Photos-Drag`，12 小时后自动清理。

## 从源码运行 / 构建

```bash
git clone https://github.com/<you>/fnos-photos-desktop.git
cd fnos-photos-desktop
npm install
npm start          # 开发运行
npm run dist       # 生成 NSIS 安装包到 dist/
```

需要 Node.js 20+。构建产物在 `dist/`。

## 目录结构

```
src/main.js       主进程：窗口、托盘、配置、原图下载与 startDrag
src/preload.js    预加载：自动登录、拖拽拦截（读取相册自身多选状态）
src/setup.html    首次设置 NAS 地址
src/offline.html  连接失败提示
build/icon.ico    应用图标（由 build/make-icon.py 生成）
```

## 隐私

- NAS 地址、登录信息只存在本机 `%APPDATA%\FnOS Photos\`；
- 密码用 Windows DPAPI（`safeStorage`）加密，仅当前 Windows 用户可解；
- 不向任何第三方服务器发送数据，也没有遥测。

## 已知限制

- 只做了 Windows x64 的打包；
- 依赖 fnOS 相册网页的接口与 DOM（`/api/v1/stream/...`、选中卡片的 `primary-light-hover` 类），**飞牛升级后可能需要适配**；
- 不支持相册网页本身的视频播放以外的桌面特性（如系统级人脸索引等）。

## 免责声明

本项目与飞牛（fnOS）官方无任何关联，未获其授权或背书。"飞牛"、fnOS 等名称与商标归其权利人所有。
使用本软件产生的任何后果由使用者自行承担。

## License

[MIT](LICENSE)
