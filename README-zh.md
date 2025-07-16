# Whereami

简体中文 | [English](/README.md)

---

**在实时、竞技、多人对决中测试你的地理知识！**

**Whereami** 是一款免费开源的、灵感来源于图寻的地理猜谜游戏。沉浸在随机的 Google 街景视图中，向你的朋友或在线玩家发起一场智慧对决。在地图上精准定位你的位置，愿最准确的探索者获胜！

本项目基于 Node.js, Express 和 Socket.IO 构建，旨在创造快节奏的实时对战体验。

### [在线玩](https://www.akioi.me/)

### [即将建立社区]()

## 支持

请在 <https://sponsor.murasame-chan.me/> 支持我们的开发。

## 核心功能

Whereami 专为竞技设计，包含以下核心功能：

  * **实时多人对战**: 与另一名玩家进行 5 回合的较量。双方玩家看到相同的地点，总分最高者获胜。
  * **ELO 等级分系统**: 每场计分对战都会影响你的个人 ELO 等级分。追踪你的进度，提升排名，证明你的实力。你的当前等级分和历史最高分都会在个人资料中显示。
  * **详细玩家资料**: 查看你的个人数据面板，包含总胜场、负场、平局和胜率等统计数据。查阅完整的对战历史并分析你的表现。
  * **动态排行榜**: 在全球排行榜上，根据 ELO 等级分查看你与其他玩家的排名情况。
  * **实时游戏界面**: 体验无缝衔接的游戏过程，包括全屏街景视图、互动式猜测地图以及对手状态的实时更新。
  * **开源 & 可自托管**: 免费使用、修改并部署在你自己的服务器上。

## 致谢

- [Google Maps API](https://developers.google.com/maps)
- [MariaDB](https://mariadb.org/)
- [Express.js](https://expressjs.com/)
- [Semantic UI](https://semantic-ui.com/)
- [Socket.IO](https://socket.io/)
- [Nunjucks](https://github.com/mozilla/nunjucks)
- [Bcrypt.js](https://github.com/kelektiv/node.bcrypt.js)
- 所有帮助本项目成功落地的贡献者们！

## 快速开始

你可以运行你自己的 Whereami 实例。步骤如下：

### 先决条件

  * [Node.js](https://nodejs.org/) (v16.x 或更高版本)
  * [NPM](https://www.npmjs.com/)
  * [MariaDB](https://mariadb.org/) 或兼容的数据库。

### 1. 克隆仓库

```bash
git clone https://github.com/whereami-dev/whereami.git
cd whereami
```

### 2. 安装依赖

```bash
npm install
```

这将安装 `package.json` 中列出的所有必要包，包括 Express, Socket.IO 和 MySQL2 驱动。

### 3. 配置环境变量

在项目根目录创建一个 `.env` 文件。此文件用于存储你的密钥和数据库凭证。服务器需要以下变量：

```env
# 服务器配置
PORT=8888

# 数据库连接 (MySQL)
DB_HOST=localhost
DB_USER=你的数据库用户名
DB_PASSWORD=你的数据库密码
DB_NAME=whereami

# 会话密钥
SESSION_SECRET=一个非常强的会话密钥

# Google Maps API 密钥
GOOGLE_MAPS_API_KEY=你的_Maps_API_密钥
```

**重要提示**: 你需要一个启用了 **Street View Static API (街景静态API)**, **Geocoding API (地理编码API)** 和 **Maps JavaScript API (地图 JavaScript API)** 的 Google Maps API 密钥。

### 4. 初始化数据库

你需要在 MySQL 数据库中创建必要的表。连接到你的数据库并运行 `plugin/create_database.sql` 文件中的 SQL 语句来创建所需的表结构。

### 5. 启动服务器

开发模式 (支持热重启):

```bash
npm run dev
```

生产模式:

```bash
npm start
```

在浏览器中打开 <http://localhost:8888> (或你指定的端口) 即可开始游戏！

## 参与贡献

贡献让开源社区成为一个学习、启发和创造的绝佳之地。你的任何贡献都将**受到极大的赞赏**。

如果你有改进本项目的建议，欢迎 Fork 项目仓库并创建一个 Pull Request。你也可以直接创建一个带有 "enhancement" (功能增强) 标签的 Issue。别忘了给项目点个 Star！再次感谢！

1.  **Fork** 本项目仓库
2.  创建你的功能分支 (`git checkout -b feature/你的超棒功能`)
3.  提交你的更改 (`git commit -m '添加了某个超棒功能'`)
4.  推送分支到远程仓库 (`git push origin feature/你的超棒功能`)
5.  提交 **Pull Request**

## 许可证

根据 GNU General Public License v3.0 (GNU 通用公共许可证 v3.0) 分发。更多信息请参阅 `LICENSE` 文件。
