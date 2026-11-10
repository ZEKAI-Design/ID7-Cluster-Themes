# ID7 Cluster Themes for BMW G05

0.7.2 是 2019 BMW X5 xDrive40i（G05、iDrive 7、12.3 英寸仪表）的停车验证包。中控页用示例数据预览样式。实际仪表预览使用收到的车况数据，缺失的读数以 `--` 显示。

## 车机预览

- 依赖 MGU Store 和已经运行的 `cluster-render`。安装包只包含仪表主题 App。
- 主题包含 **BMW original**、**Five Dial**、**Silver Trio** 和 **Digital**。**Five Dial** 与 **Digital** 可在 **Customize** 分别设置四个位置，导航和媒体只出现在内圈选项。
- **Silver Trio** 是劳斯莱斯风格的固定三圆布局。左侧显示转速，中央显示车速，右侧显示油量和续航。油量指针按 xDrive40i 约 83 L 油箱折算，外侧显示时间、外温和挡位。 [BMW Canada MY19 配置表](https://www.press.bmwgroup.com/canada/article/attachment/T0289548EN/432931)
- 三套自定义主题使用 Hanken Grotesk，字形参照保时捷红盘仪表，字号较上一版缩小 10%。车速和转速刻度用较粗字重，数字采用等宽排版。实时 Waze 画面内的文字由 Waze 渲染。 挡位信号使用车机支持的订阅接口。
- **Five Dial** 的 **Face colour** 有原版深蓝、石板蓝、青绿、紫红、中央红环五套配色。**Digital speed** 可选 **Centre** 或 **Lower**。低位模式把数字车速放到指针轴下方，并显示从圆心出发的转速长针。两项设置独立保存，也可从中控预览左侧的快捷卡片切换。
- 车辆停稳挂 P 挡，选择 **Preview on cluster**。需要同时读到明确的 P 挡和零车速。一次最多 12 秒。选择 **BMW original**、离开页面、换挡、信号中断或渲染连接断开时，App 会撤下主题。启动默认显示原厂。当前车机上的告警层和恢复时序还需实车验证。
- Waze 圆内窗口需要已经可用、支持 Cluster Layouts 窗口交接的 Waze on Cluster 版本。标准居中地图版本会显示你选的备用内容。地图流停止、断开或窗口被另一个 App 占用时也使用备用内容。
- **Now playing (demo)** 的曲名和封面仅在中控预览中展示。当前版本未接入 BMW 原厂实时媒体，真实仪表显示媒体来源不可用。

## MGU Store 安装

在 MGU Store 打开 **Settings → Add source**，输入 `ZEKAI-Design/ID7-Cluster-Themes`，选择 **Releases**，然后安装 **ID7 Cluster Themes**。需要 `cluster-render` 0.5.2 或更新版本，可从 MGU Store 的 [idrive-apps](https://github.com/robertnisipeanu/idrive-apps) 来源获取。

## USB

将 USB 压缩包解压到 U 盘根目录，保留 `mgu-repo/cluster-themes/catalog.json` 和同一目录的 `.tgz`。在 MGU Store 的 USB 来源中安装 **ID7 Cluster Themes**。停车且依赖已运行时再启动仪表预览。

## 构建与验证

- `python3 kit/tools/build.py --omit-sdk zekai_cluster_themes`
- `node --test test/app.test.js`

OAP SDK 由车机安装器提供。仪表渲染客户端来自 Robert Nisipeanu 的 idrive-apps（提交 `a0a4cbf`，MPL-2.0），对应源文件位于 `apps/zekai_cluster_themes/cluster_render_client.js`。中控运行时和构建器沿用 Cabin Ambient 的 MIT 版 idrive7-apps Kit。Waze 窗口接入遵循 eroobeeroo Cluster Layouts 的共享窗口协议。

仪表字体由 [Hanken Grotesk](https://github.com/google/fonts/tree/main/ofl/hankengrotesk) 烘焙而来，SIL OFL 许可证随字形图集打包。重建时可用 Pillow 11.3 和 `python3 kit/tools/bake_dial_type.py /path/to/HankenGrotesk.ttf`，参数为带有字重轴的可变字体文件。
