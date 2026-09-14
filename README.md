# scratch-brand

蓝鲸创客练考平台对 [TurboWarp scratch-gui](https://github.com/TurboWarp/scratch-gui) 构建产物所做的**运行时品牌覆盖**，依 GPL-3.0 公开。

## 上游

- 仓库：https://github.com/TurboWarp/scratch-gui
- 使用的 commit：`b37d37828f8a540230e20bb2b2ab64bc7f713876`
- 未修改 TurboWarp 任何源文件；构建产物 `editor.html` 仅被注入下面两个文件的引用。

## 文件

| 文件 | 作用 |
|---|---|
| `apply-brand.sh` | 构建后执行：把 `brand.css`、`brand.js` 拷入 `build/`，并幂等地在 `editor.html` 注入 `<link>`/`<script>` |
| `brand.css` | 菜单栏配色 |
| `brand.js` | 隐去指向外站的按钮；注入「打开 / 保存」（作品存取到平台 `/api/works`）与任务模式「提交判分」；载入默认工程 |

`apply-brand.sh` 还会拷入平台自有的默认工程 `lanjing-default.sb3`（非 TurboWarp 衍生内容，不在本仓库）。

## 用法

```bash
# 在 TurboWarp scratch-gui 目录执行 npm run build 之后
./apply-brand.sh /path/to/scratch-gui/build
```

## 许可证

GPL-3.0，见 [LICENSE](LICENSE)。
