# 云间 · 海天

一望无际的海面与缓慢流动的云，共享同一个视角。海面波纹、云层倒影、日光与暮色都由本机实时绘制，没有图片拼接和分层拖动。

## 启动

Windows 双击 `启动云间.cmd`，自动启动后台服务并打开浏览器。重复启动会复用服务；重启电脑后再次双击即可。需要 Node.js 18 或更新版本，以及支持 WebGPU、开启硬件加速的 Chrome 或 Edge，无需安装依赖。

也可运行 `node server.mjs`，访问 http://127.0.0.1:4187/ 。如果连接被拒绝，先重新启动服务。

## 操作

- 拖动或方向键环顾整个海天，滚轮调整视角。
- 点击云朵吹动局部云体；点击海面不会吹云。画面获得焦点后，回车作用于中央云朵。
- 空格同时冻结海浪和云的自然流动；主动吹云、换景和切换光照仍可使用。
- “换一片天空”渐变切换五类随机云形，海面倒影同步变化。
- 拖动“太阳高度”滑杆让太阳升降，从 32° 日光到 -5° 暮色；经过 0° 时太阳沉入海平线。天空、云层受光与海面倒影连续变化。暂停时也可调节。

系统开启“减少动态效果”时默认暂停。

## 实现与验证

`src/sky-renderer.mjs` 使用统一相机和世界方向绘制三维体积云与无限海平面。多尺度行进波改变海面法线，反射方向重新采样相同云场，以视角相关反射、日光闪烁和远处空气透视连接海天。它是实时观景近似，不是海洋或天气预测模型。

`src/experience.mjs` 管理播放与界面；`sky-noise.mjs` 生成三维噪声；`sky-scenes.mjs` 管理云形；`sky-interaction.mjs` 管理点击射线和局部气流。运行时不请求外部服务。

运行 `npm run check` 检查 JavaScript 语法，`npm test` 验证射线投影与气流生命周期。GPU 着色器编译与视觉效果需在支持 WebGPU 的浏览器中检查；页面会显示图形初始化错误。

## 展示视频

`tools/render-showcase.mjs` 直接调用网页的渲染器，输出日光海风（12 秒）、流云变幻（16 秒）、海上日落（18 秒）三段无界面视频。固定随机序列、1280×720、24 fps，每帧累积 6 次采样，不依赖实时运行帧率；云与海浪采用两倍时间展示。日落在短片内加速完成，仍使用网页同一套光照。

复现需要 FFmpeg 和 Playwright：先 `npm install --no-save playwright`、`npx playwright install chromium`，再启动本机网站，运行 `node tools/render-showcase.mjs`。如 FFmpeg 不在 PATH，可设置 `FFMPEG_PATH`；可通过 `CHROME_PATH` 指定 Chromium。文件写入 `showcase/`，不参与源码提交。

采用 H.264、yuv420p、CRF 18、BT.709 和 MP4 faststart。没有生成虚构景物或后期替换天空。

参考：[逐帧处理与时间戳](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Using_the_WebCodecs_API)、[FFmpeg 容器与 faststart](https://ffmpeg.org/ffmpeg-formats.html)。

## GitHub Pages

项目没有构建依赖，入口为根目录 `index.html`。推送仓库后，Pages 发布源选择 `main` 分支根目录；`.nojekyll` 保留静态文件原样发布。所有页面资源使用相对地址，支持仓库子路径。在线运行仍需支持 WebGPU 的浏览器。
