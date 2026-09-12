# 本项目 Agent 规则

本文件适用于本仓库及其子目录，不修改其他项目或全局 Git 配置。

## GitHub 账号与远端

- 本项目固定使用 GitHub 账号 **`aisukora0712u`** 进行认证和远端写操作。
- 固定仓库：`https://github.com/aisukora0712u/ASCL_Lv1-GameFramework-for-Unity`。
- `origin` 的 fetch / push 地址应为：
  `https://aisukora0712u@github.com/aisukora0712u/ASCL_Lv1-GameFramework-for-Unity.git`。
- 用户已明确授权将本项目源码和任务修改同步到上述**公开仓库**。任务要求同步远端时，
  可向此目的地推送相关提交，无需再次确认账号、目的地或公开属性。
- 推送前检查当前分支、提交范围和 `origin` 地址。默认推送当前任务分支；合并到主分支、
  强制推送或更换远端不包含在普通同步操作中。
- 优先使用本地 Git CLI 与该账号的现有凭据。若 GitHub 连接器登录的是其他账号，
  不得用其执行本项目的远端写操作；不能因连接器账号不同而改用其他账号或仓库。
- GitHub 认证账号与提交作者信息不同；不要为切换认证账号而擅自改写提交作者或历史。
- 不在仓库中记录令牌、密码等凭据。实际工具审批若阻断操作，应如实报告，不绕过限制。
