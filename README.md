# ID7 Cluster Themes for BMW G05

0.8.5 面向 2019 BMW X5 xDrive40i（G05、iDrive 7、12.3 英寸仪表）。MGU 平台启动时会自动启动已启用的主题，主题在中控页面离开后继续显示，直到选择 **BMW original**。车机关闭时后台进程随平台停止；下次启动时按保存的开关状态和主题恢复。仪表覆盖层和绘制画布均为 1920×720。Five Dial 等比例铺开至约 98% 的可绘宽度，左右保留约 18 像素，圆表保持圆形。中控页使用示例数据；仪表使用实时车况信号，缺失读数显示 `--`。

本 App 使用 `cluster-render` 在仪表上绘制全屏覆盖层，不会刷写或替换 BMW 仪表 ECU。0.8.5 尚未在行驶中完成实车验证，BMW 原厂告警层与自定义覆盖层的优先级也需在车上确认；如果原厂告警或任何关键读数被遮挡，请选择 **BMW original**。

## 车机预览

- 依赖 MGU Store 和 `cluster-render` 0.5.2 或更新版本。安装包只包含仪表主题 App。
- 主题包含 **BMW original**、**Five Dial**、**Silver Trio** 和 **Digital**。**Five Dial** 与 **Digital** 可在 **Customize** 分别设置四个位置，导航和媒体只出现在内圈选项。
- 新增 **Waze Full Map** 概念主题：实车布局为全仪表地图，顶部显示实时车速、时间和挡位，底部显示续航、转速、水温和油温。中控预览用绘制的示例地图；实车布局需要兼容全屏窗口交接的 Waze on Cluster，并且依赖它提供实时地图画面。Waze 视频流没有可供本 App 读取的转弯、ETA 或路名数据，所以这些信息不作为实时独立字段显示。
- 新增 **VDO Retro 2000**：按参考图保留双大圆表、中央经济/指示灯/信息窗的老大众布局，双圆表等比例放大以接近屏幕四边，电子指针显示 BMW 车速和转速，附带 MPH 与 km/h 双刻度、燃油和水温小表、油耗、总里程与行程读数。中央 MPG 小表、中段原图四组指示图标/彩色灯位及底部数字车速屏均收在参考图标出的中央区域内；LCD 显示数字车速，并移除了重复读数行。车速、转速、燃油、水温、油温、续航和总里程使用当前车况/仪表信号；中央 MPG 表显示 BMW 行车电脑的平均油耗并统一换算为 US MPG。行程距离来自 Kombi 的 `wayPassed` 字段，官方解码目录标注该字段缩放尚需车辆核对；未收到或数值无效时显示短横线。参考图中的转向、电池、水温、机油压力、远光及警告灯位置以彩色灯罩示意；当前 App 没有这些灯的实时状态信号，颜色仅用于辨认位置，不代表车辆告警状态。
- **Silver Trio** 是劳斯莱斯风格的固定三圆布局。中央显示车速，数字转速和剩余续航分别显示在中央白盘的左下方和右下方。左右圆盘默认显示转速和油量指针，可以在 **Customize** 独立切换为 Waze、胎压、水温与油温等内容。三圆按更大的等比例布局绘制，保留底部读数空间。选择 Waze 时，地图未连接则显示指定的备用内容。同一时间有一个实时地图窗口。油量指针按 xDrive40i 约 83 L 油箱折算，外侧显示时间、外温和挡位。 [BMW Canada MY19 配置表](https://www.press.bmwgroup.com/canada/article/attachment/T0289548EN/432931)
- 三套自定义主题使用 Hanken Grotesk，字形参照保时捷红盘仪表，字号较上一版缩小 10%。车速和转速刻度用较粗字重，数字采用等宽排版。实时 Waze 画面内的文字由 Waze 渲染。挡位信号使用车机支持的订阅接口。
- **Five Dial** 的 **Face colour** 有原版深蓝、石板蓝、青绿、紫红、中央红环五套配色。**Digital speed** 可选 **Centre** 或 **Lower**。低位模式把数字车速放到指针轴下方，并显示从圆心出发的转速长针。两项设置独立保存，也可从中控预览左侧的快捷卡片切换。续航弧线按当前公里数与 **Full range for arc** 的比例填充，默认满刻度 800 km。
- 在车机的 **Settings → Start selected theme at boot** 中启用自动启动，然后用 **Enable selected theme** 显示所选主题。选择 **BMW original** 会关闭覆盖层并记住此状态；再次启用即可恢复。渲染器断开或画面绘制失败后，客户端会尝试重连并恢复已选主题。面板被其他图层临时占用时等待渲染器释放，日志记录面板状态和错误原因。
- Waze 圆内窗口需要支持 Cluster Layouts 窗口交接的 Waze on Cluster，例如 [eroobeeroo 版 0.9.107 或更新版本](https://github.com/eroobeeroo/idrive7-cluster-info/tree/main/apps/cluster_layouts)。Waze 还需开启 Cluster 输出。标准居中地图版本会显示你选的备用内容。地图流停止、断开或窗口被另一个 App 占用时也使用备用内容。
- **Now playing (demo)** 的曲名和封面仅在中控预览中展示。当前版本未接入 CarPlay 曲名、歌手和封面数据；真实仪表显示缺少曲目信息。

- G 值选项已删除。旧圆盘选项中的 G 值改为胎压；Waze 的旧 G 值备用选项改为油温和水温。

## MGU Store 安装

在 MGU Store 打开 **Settings → Add source**，输入 `ZEKAI-Design/ID7-Cluster-Themes`，选择 **Releases**，然后安装或更新 **ID7 Cluster Themes**。需要 `cluster-render` 0.5.2 或更新版本，可从 MGU Store 的 [idrive-apps](https://github.com/robertnisipeanu/idrive-apps) 来源获取。

## USB

将 USB 压缩包解压到 U 盘根目录，保留 `mgu-repo/cluster-themes/catalog.json` 和同一目录的 `.tgz`。在 MGU Store 的 USB 来源中安装或更新 **ID7 Cluster Themes**。安装后，默认启用自动启动和 Five Dial 主题。

## 构建与验证

- `python3 kit/tools/build.py --omit-sdk zekai_cluster_themes`
- `node --test test/app.test.js`

OAP SDK 由车机安装器提供。仪表渲染客户端来自 Robert Nisipeanu 的 idrive-apps（提交 `a0a4cbf`，MPL-2.0），对应源文件位于 `apps/zekai_cluster_themes/cluster_render_client.js`。中控运行时和构建器沿用 Cabin Ambient 的 MIT 版 idrive7-apps Kit。Waze 窗口接入遵循 eroobeeroo Cluster Layouts 的共享窗口协议。

仪表字体由 [Hanken Grotesk](https://github.com/google/fonts/tree/main/ofl/hankengrotesk) 烘焙而来，SIL OFL 许可证随字形图集打包。重建时可用 Pillow 11.3 和 `python3 kit/tools/bake_dial_type.py /path/to/HankenGrotesk.ttf`，参数为带有字重轴的可变字体文件。
