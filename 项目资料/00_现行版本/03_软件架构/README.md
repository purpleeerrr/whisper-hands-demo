# Whisper Hands 软件架构

本目录是“模板选择 → 过程收件箱 → 用户确认记录 → 模板化主动回顾”的可实施架构骨架。

入口：

- [技术规格](./docs/technical-spec.md)
- [事件协议](./contracts/device-event.schema.json)
- [SQLite 数据结构](./storage/schema.sql)
- [核心领域模型](./backend/app/domain/models.py)
- [端口接口](./backend/app/ports.py)
- [记录流程](./backend/app/services/capture.py)
- [主动召回流程](./backend/app/services/recall.py)

架构原则：

1. 模板、设备、摄像头、麦克风和 AI 服务均可替换；
2. 原始过程素材、AI 候选、用户确认记录和公共参考资料严格分开；
3. 原始记录先保存，AI 失败不会导致数据丢失；
4. 所有主动回顾都有可解释的模板触发原因；
5. 本地单用户、SQLite、无需账号即可完成演示。
