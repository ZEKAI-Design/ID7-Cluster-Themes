# ID7 Cluster Themes for BMW G05

0.8.22 面向 2019 BMW X5 xDrive40i（G05、iDrive 7、12.3 英寸仪表）。MGU 平台启动时会自动启动已启用的主题，主题在中控页面离开后继续显示，直到选择 **BMW original**。车机关闭时后台进程随平台停止；下次启动时按保存的开关状态和主题恢复。仪表覆盖层和绘制画布均为 1920×720。Porsche 铺开至约 98% 的可绘宽度，中央表圈覆盖约 95% 的可绘高度，四边保留约 18 像素。中控页使用示例数据；仪表使用实时车况信号，缺失读数显示 `--`。

本 App 使用 `cluster-render` 在仪表上绘制全屏覆盖层，BMW 仪表 ECU 继续使用车辆自身的编码。0.8.22 的挡位窗口、数据延迟和 BMW 告警显示需在车上验证。验证前请在行驶时使用 **BMW original**。

## 车机预览

- 点开颜色、指针效果或侧圈内容，会显示可直接选择的选项。多项颜色和读数组合以两列显示；也可以用 iDrive 旋钮移到选项再按下确认。

- 依赖 MGU Store 和 `cluster-render` 0.5.2 或更新版本。安装包只包含仪表主题 App。
- 主题包含 **BMW original**、**Porsche**、**Rolls Royce** 和 **Digital**。**Porsche** 与 **Digital** 可在 **Customize** 分别设置四个位置，导航和媒体只出现在内圈选项。
- 新增 **Waze Full Map** 概念主题：实车布局为全仪表地图，顶部显示实时车速、时间和挡位，底部显示续航、转速、水温和油温。中控预览用绘制的示例地图；实车全屏依赖支持 Cluster Layouts 窗口协议的 Waze on Cluster 提供实时地图。先从 MGU Store 的 `eroobeeroo/idrive-apps` 来源安装或更新 Waze on Cluster，再把它的 **Show on** 设为 **Cluster**。本主题在地图启动期间保留窗口请求，收到全屏地图就绪状态后才显示读数栏。普通地图仍在 BMW 地图位置或地图断开时，仪表让出覆盖层，中控会显示具体等待原因。Waze 视频流没有可供本 App 读取的转弯、ETA 或路名数据，所以这些信息不作为实时独立字段显示。
- 新增 **VW 2000**：按参考图保留双大圆表、中央经济/指示灯/信息窗的老大众布局，双圆表等比例放大以接近屏幕四边，电子指针显示 BMW 车速和转速，附带 MPH 与 km/h 双刻度、燃油和水温小表、油耗、总里程与行程读数。中央 MPG 小表、中段原图四组指示图标/彩色灯位及底部数字车速屏均收在参考图标出的中央区域内；LCD 显示数字车速，并移除了重复读数行。车速、转速、燃油、水温、油温、续航和总里程使用当前车况/仪表信号；中央 MPG 表显示 BMW 行车电脑的平均油耗并统一换算为 US MPG。行程距离来自 Kombi 的 `wayPassed` 字段，官方解码目录标注该字段缩放尚需车辆核对；未收到或数值无效时显示短横线。左侧第一颗绿色转向灯读取 BMW 的车身灯光通知，左转、右转及双闪都使用这颗灯。转向状态来自车机支持的 StatusFunctionsIndicators / StatusFunctionsIndicators2 通知，闪烁节奏由应用绘制。其余灯罩为示意。
- **Rolls Royce** 是劳斯莱斯风格的固定三圆布局。**Face colour** 可切换 10 种参考 Spectre Bespoke 的配色，默认 **Silver Grey Bright**。中央显示车速。默认左圈显示转速指针和数字转速，右圈显示油量指针和剩余续航。左右圆盘可以在 **Customize** 独立切换为 Waze、胎压、水温与油温等内容。切换后，对应的数字读数移到侧圈下方。选择 Waze 时，地图未连接则显示指定的备用内容。同一时间有一个实时地图窗口。油量指针按 xDrive40i 约 83 L 油箱折算，外侧显示时间、外温和挡位。 [BMW Canada MY19 配置表](https://www.press.bmwgroup.com/canada/article/attachment/T0289548EN/432931)
- **Rolls Royce** 的中央表盘使用直径 700 像素的正圆，上下各距画布边缘 10 像素。左右表盘的银边及光晕朝中央对称开口，并在缺口两端渐隐。十种配色的主题文字统一为白色，浅色盘的数字车速和单位带有深色阴影方便辨认。左下方的 P/R/N/D 用粗体标出当前挡位。实车主题在右下方给宝马原厂挡位留出一小块透明窗口，宝马仍可能在窗口里显示自己的挡位。其他车型的原厂挡位位置可能不同。
- **Rolls Royce → Needle effect** 可切换 **Classic** 和 **Starlight**。渲染器预加载车速和转速的指针、字形及星光图层，数据变化时只更新针角、字形和星光参数。**Starlight** 会在中央时速指针扫过的区域留下银白光点，停针后约 0.65 秒内淡出。中控预览使用模拟车速展示动画。渲染器的共享像素内存不足时，应用会用较小的表盘背景纹理自动重试，仪表仍占满 1920×720，指针与数显继续独立更新。内存仍不足时，应用可暂时关闭星光，或在必要图层无法加载时显示宝马原厂仪表并等候重试。遇到其他指针或数字图层错误时，应用释放覆盖层，显示宝马原厂仪表。
- 三套自定义主题使用 Hanken Grotesk，字形参照保时捷红盘仪表，字号较上一版缩小 10%。车速和转速刻度用较粗字重，数字采用等宽排版。实时 Waze 画面内的文字由 Waze 渲染。挡位信号使用车机支持的订阅接口。
- **Porsche** 有石墨灰、电光蓝、白字珍珠白、洋红、红、黄、白、蓝四款中央宽环配黑色侧圈，共八种配色。**Restore Porsche layout** 会把数字车速移到下方，并把四个可定制位置恢复为 12 V 电池、指针时速表、油压及油温、冷却液温度。下部数显车速是新设置的默认位置，已保存的车速位置继续有效。中央转速表边框上的续航弧线按当前公里数与 **Full range for arc** 的比例填充，默认满刻度 800 km。
- **Clock** 支持 Vancouver（UTC−7）、车机本地时间、US Pacific、UTC 或自定义 UTC 偏移，以及分钟校正和 12/24 小时格式。此设置只影响主题自己的时钟。
- 车速和转速优先使用 BMW 的实时通知，通知静默 300 毫秒后才补读。Rolls Royce 和 Porsche 的车速与转速在收到新读数后独立更新。Porsche 的数字车速、中央转速指针和所有配置为指针时速表的副表使用预载图层，不会随车速和转速重绘位图；两种数字位置使用相同的更新路径。时速副表的刻度和单位画在背景内，避免单独的刻度位图占满 Waze 同用的渲染器内存。应用侧合并 16 毫秒内的读数并发送最新值。信号断开或读数超过 750 毫秒显示短横线。Rolls Royce 和 Porsche 的车速持续失效 1.5 秒后让出覆盖层，车速恢复稳定后重新显示主题。挂入 P 挡时清除非零车速，收到车辆的零速信号后显示 0。仪表连接持续堵塞时应用让出覆盖层并尝试恢复。日志记录车速及转速的通知数、补读数、读数年龄和渲染器的传输预算。实际显示延迟随车辆信号和仪表渲染器而变。
- 12 V 电压和机油压力通过 DME 只读量取得，前者在没有电压数据时可使用 BMW 广播的电池荷电状态。机油压力是绝对压力减去同一控制器报告的大气压力，字段缺失时显示短横线。读取只在相应 Porsche 侧圈启用、仪表可用且收到车速信号时进行。油温和冷却液温度使用原有 BMW 实时车况信号。
- 在车机的 **Settings → Start selected theme at boot** 中启用自动启动，然后用 **Enable selected theme** 显示所选主题。选择 **BMW original** 会关闭覆盖层并记住此状态；再次启用即可恢复。渲染器断开或画面绘制失败后，客户端会尝试重连并恢复已选主题。面板被其他图层临时占用时等待渲染器释放，日志记录面板状态和错误原因。
- Waze 圆内窗口需要支持 Cluster Layouts 窗口交接的 Waze on Cluster，例如 [eroobeeroo 版 0.9.107 或更新版本](https://github.com/eroobeeroo/idrive-apps#this-fork)。Waze 还需开启 Cluster 输出。标准居中地图版本会显示你选的备用内容。地图流停止、断开或窗口被另一个 App 占用时也使用备用内容。
- **Now playing** 优先读取 BMW `MediaPlayer` 的 `CarPlayMedia` 实例，并从 `HmiMediaState/HMI_CID` 读取前排曲目和可用的封面图。若车机没有提供封面，可开启 **Online album covers (share track details)**，通过 MGU Store 的网络连接把当前搜索所需曲目信息发送给 MusicBrainz，从 Cover Art Archive 取图。音乐来源缺失或查不到封面时使用原有音乐图标。发布包的媒体字体包含 Unicode 17.0 简繁及扩展汉字。

- G 值选项已删除。旧圆盘选项中的 G 值改为胎压；Waze 的旧 G 值备用选项改为油温和水温。

## MGU Store 安装

在 MGU Store 打开 **Settings → Add source**，输入 `ZEKAI-Design/ID7-Cluster-Themes`，选择 **Releases**，然后安装或更新 **ID7 Cluster Themes**。需要 `cluster-render` 0.5.2 或更新版本，可从 MGU Store 的 [idrive-apps](https://github.com/robertnisipeanu/idrive-apps) 来源获取。

## USB

将 USB 压缩包解压到 U 盘根目录，保留 `mgu-repo/cluster-themes/catalog.json` 和同一目录的 `.tgz`。在 MGU Store 的 USB 来源中安装或更新 **ID7 Cluster Themes**。安装后，默认启用自动启动和 Porsche 主题。

## 构建与验证

- `python3 kit/tools/build.py --omit-sdk zekai_cluster_themes`
- `node --test test/*.test.js`

GitHub 发布构建先用 CC0 的 [Jigmo 2025-09-12](https://kamichikoichi.github.io/jigmo/) 生成媒体汉字字形包，再检查各汉字扩展区的覆盖。手动构建完整字库时，安装 Pillow 和 fontTools，然后运行 `python3 kit/tools/bake_han.py Jigmo-20250912.zip kit/runtime/fonts/han.bin`。

OAP SDK 由车机安装器提供。仪表渲染客户端来自 Robert Nisipeanu 的 idrive-apps（提交 `a0a4cbf`，MPL-2.0），对应源文件位于 `apps/zekai_cluster_themes/cluster_render_client.js`。中控运行时和构建器沿用 Cabin Ambient 的 MIT 版 idrive7-apps Kit。Waze 窗口接入遵循 eroobeeroo Cluster Layouts 的共享窗口协议。

仪表字体由 [Hanken Grotesk](https://github.com/google/fonts/tree/main/ofl/hankengrotesk) 烘焙而来，SIL OFL 许可证随字形图集打包。重建时可用 Pillow 11.3 和 `python3 kit/tools/bake_dial_type.py /path/to/HankenGrotesk.ttf`，参数为带有字重轴的可变字体文件。
