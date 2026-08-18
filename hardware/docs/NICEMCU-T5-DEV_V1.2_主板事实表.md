# NICEMCU-T5-DEV V1.2 主板事实表

最后核验：2026-08-15  
一级资料：[`NICEMCU-T5-DEV_V1.2_原理图.pdf`](./NICEMCU-T5-DEV_V1.2_原理图.pdf)  
PDF SHA-256：`9545a4a6055833b65da58e025edcd40d07b273da3f0a4bac0285631e4534e85f`

## 1. 怎么使用这份表

后续模型和队友先区分四种证据：

| 标记 | 含义 |
|---|---|
| 原理图确认 | 电路设计中已经连出该器件或信号 |
| BSP 确认 | 当前 TuyaOpen `SPARKLEIOT_T5AI_DEV` 板级代码定义了对应驱动或引脚 |
| 当前固件使用 | 现有路演固件真正调用了这项能力 |
| 待实板确认 | 原理图和编译成功仍不能证明器件已焊、型号完全一致或运行稳定 |

原理图证明板卡设计能力，不自动证明每块实物都焊满所有器件。最终仍要看实物丝印、连接器和串口日志。

## 2. 板卡身份

| 项目 | 已确认内容 | 结论边界 |
|---|---|---|
| 原理图文件 | `NICEMCU-T5-DEV_V1.2.SchDoc` | 可以确认板级版本为 NICEMCU-T5-DEV V1.2 |
| 核心符号 | `TUYA-T5 (XH-WB5E)` | 原理图没有直接写 `T5-E1` 或 `T5-E1-IPEX`；具体商品模组型号还需看实物屏蔽罩丝印或供应商说明 |
| 当前 TuyaOpen BSP | `T5AI / SPARKLEIOT_T5AI_DEV` | 已能编译；仍需实板启动日志证明 BSP 与这块 NICEMCU 板完全匹配 |
| 摄像头 | OV2640，DVP 接口 | 原理图确认；当前固件选择 OV2640 驱动，仍待实板出流 |

## 3. 板载能力总表

| 能力 | 原理图给出的信息 | 当前项目使用情况 |
|---|---|---|
| USB-C 与串口 | USB-C 供电/数据；CH340C 连接 `U0TXD/U0RXD` | 用于烧录和 `460800` 串口日志 |
| 电池与电源 | 锂电充电/电源路径、`LI_VBAT`、3.3V 与 5V DC-DC、`P12_ADC` 电池电压采样 | 路演先用 USB 供电；便携电池留待后续 |
| 摄像头 | OV2640；独立 2.8V/1.8V 电源；DVP 数据与 SCCB 控制 | 当前 T5 固件只承诺 MJPEG `/stream` 与 `/snapshot` |
| 音频输入 | 一个 GMI9767 板载模拟麦克风接 `MP1/MN1/MBS` | 当前路演录音来自 Mac 麦克风；T5 麦克风尚未写入固件 |
| 回声参考 | `MP2/MN2` 经网络连接扬声器 `SPK+/SPK-` | 这是扬声器回采/AEC 参考，不能当作第二个独立麦克风 |
| 音频输出 | 差分功放、两针 `SPK+/SPK-` 接口；使能信号 `P7` | 当前固件未播放音频 |
| 屏幕 | 12 针 LCD 接口；SPI 信号、背光信号；BSP 使用 ST7789、240×320 | 当前路演网页显示在 Mac；T5 屏幕尚未实测 |
| 触摸 | I²C 触摸接口，含中断/复位相关信号 | BSP 使用 CST816X；原理图与 BSP 的复位/中断定义有冲突，见第 6 节 |
| TF 卡 | 6 线 SDIO：CLK、CMD、D0-D3 | BSP 已配置 GPIO14-19；当前摄像固件初始化 SDIO，但尚未实现录像写卡 |
| 加速度计 | SH3001，共用 I²C，总线外另有两个中断信号 | 当前固件未使用 |
| 温度传感器 | 原理图标为 `M117 sensor`，I²C + ALERT | 当前固件未使用；器件具体型号需看实物/BOM |
| RGB LED | 三路普通 RGB，分别接 GPIO23/25/6 | 当前路演状态灯由 ESP32 灯条承担；T5 RGB 尚未实测 |
| 按键 | `RST_EN` 复位键；GPIO8 用户键，低电平按下 | GPIO8 在 BSP 中有对应定义；当前摄像固件不把它映射为产品事件 |
| LoRa | 板上预留 LoRa 模块接口与 SPI/控制信号 | 是否已焊模块待实物确认；当前固件未使用 |
| PWM 接口 | 两个三针 5V/GND/信号口 | 信号复用 TF 卡 D2/D3，使用前必须处理冲突 |
| USB 扩展口 | 另有 VUSB、USB_D+、USB_D-、GND 接口 | 当前不使用 |

## 4. 摄像头与 TF 卡精确引脚

### OV2640

| 功能 | T5 GPIO |
|---|---|
| SCCB SCL / SDA | GPIO0 / GPIO1 |
| DVP MCLK | GPIO27 |
| DVP PCLK | GPIO29 |
| DVP HSYNC / HREF | GPIO30 |
| DVP VSYNC | GPIO31 |
| DVP D0-D7 | GPIO32、33、34、35、36、37、38、39 |

原理图把摄像头 RESET 接到板级 `RST_EN`，PWDN 由固定网络处理。当前 BSP 因此把摄像头独立 reset/power GPIO 设为“无”。

### TF 卡

| 功能 | T5 GPIO |
|---|---|
| SDIO CLK | GPIO14 |
| SDIO CMD | GPIO15 |
| SDIO D0 | GPIO16 |
| SDIO D1 | GPIO17 |
| SDIO D2 | GPIO18 |
| SDIO D3 | GPIO19 |

原理图、BSP 的 `board_sdcard_prepare()` 和 `app_resource_config.json` 三处一致。

## 5. 其他已知引脚

| 模块 | 引脚 |
|---|---|
| 用户按键 | GPIO8，低电平有效 |
| 扬声器功放使能 | GPIO7 |
| LCD SPI | GPIO44 CLK、GPIO45 CS、GPIO46 MOSI、GPIO47 DC；GPIO9 背光 |
| 触摸/SH3001 I²C | GPIO20、GPIO21，共享总线；SH3001 中断使用 GPIO28、GPIO26 |
| 温度传感器 | GPIO42 SCL、GPIO43 SDA、GPIO24 ALERT |
| RGB LED | GPIO23 蓝、GPIO25 红、GPIO6 绿 |
| LoRa SPI | GPIO2 SCK、GPIO3 NSS、GPIO4 MOSI、GPIO5 MISO；GPIO13、GPIO40、GPIO41 为控制信号 |
| 电池电压 ADC | GPIO12 |
| PWM 接口 1/2 | GPIO19 / GPIO18，同时也是 SDIO D3 / D2 |

## 6. 已发现的冲突和风险

### 6.1 PWM 与 TF 卡冲突

两个 PWM 三针口直接复用 GPIO18/19。当前 BSP 会把 GPIO14-19 全部切到 SDIO。只要 TF 卡功能启用，就不要同时把 GPIO18/19 当 PWM 输出。

### 6.2 屏幕/触摸定义存在原理图与 BSP 差异

- 原理图将 LCD 复位相关线标成 `RST_EN`，BSP 写成 GPIO6。
- 原理图的触摸部分显示 GPIO20/21 总线、GPIO22 中断及 `RST_EN`；BSP 使用 GPIO20/21、GPIO23 复位且没有中断脚。
- GPIO6 在原理图中同时标为 RGB 绿色通道。

因此，屏幕、触摸和 T5 RGB 在实板验证前不能当成已经可用。当前摄像功能不依赖这些 UI 外设；若启动日志在 display/touch 注册处报错，先记录错误，再决定是否从摄像专用固件中关闭它们。

### 6.3 LoRa、温度传感器和外接接口是否已焊

原理图画出了对应电路和接口，实物可能存在选配或空焊。需要拍摄主板正反面、核对丝印和连接器后再列为可用硬件。

### 6.4 当前固件初始化范围大于主演示范围

`SPARKLEIOT_T5AI_DEV` 的 Kconfig 会选择音频、按键、显示、触摸和摄像头；现有 `board_register_hardware()` 还会准备 SDIO。当前产品只需要 T5 摄像头出流。第一次烧录必须保存完整 `460800` 日志，尤其关注 audio、display、touch、camera、SDIO 的注册顺序和错误码。

## 7. 对当前双板方案的影响

明日路演仍采用：

```text
T5：OV2640 实时画面
ESP32：旋钮、敲击与四项控制事件
Mac：桥接、麦克风、WebM 和本地记录
```

这条路线隔离了 T5 板上尚未验证的音频、屏幕、触摸和复用引脚。原理图带来的新增机会放入路演后评估：

1. T5 麦克风 + TF 卡做脱离 Mac 的本地录像。
2. GPIO8 用户键和触摸屏作为简化交互入口。
3. 板载 RGB、扬声器和屏幕反馈设备状态。
4. 电池管理支持便携形态。
5. SH3001、温度传感器、LoRa 进入特定创作场景实验。

任何一项升级都需要单独的驱动示例、实板日志和连续运行测试，不能从原理图直接升级为“已实现”。

## 8. 第一次实板验收必须回填

- [ ] 核心模组屏蔽罩完整丝印；是否明确写 T5-E1/T5-E1-IPEX。
- [ ] 主板正反面高清照片；LoRa、温度传感器、屏幕、触摸、麦克风、功放是否实装。
- [ ] TuyaTool 烧录成功截图。
- [ ] `460800` 完整启动日志。
- [ ] OV2640 识别信息、获得的 IP、`/stream` 和 `/snapshot`。
- [ ] 连续出流 10 分钟结果。
- [ ] display/touch/audio/SDIO 是否出现错误。

