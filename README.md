# Whereami

[简体中文](/README-zh.md) | English

---

**Test your geographic knowledge in a real-time, competitive, multiplayer duel!**

**Whereami** is a free and open-source geography guessing game inspired by GeoGuessr. Dive into a random location on Google Street View and challenge your friends or other players online to a battle of wits. Pinpoint your location on the map, and may the most accurate explorer win!

This project is built with Node.js, Express, and Socket.IO to create a fast-paced, real-time dueling experience.

## Play It Online

[简体中文](https://cn.akioi.me)(current unavailable) | [English](https://www.akioi.me)

### [We will create a community soon]()

## Support

Support us on https://sponsor.murasame-chan.me/.

## Core Features

Whereami Duel is packed with features designed for competitive play:

  * **Real-Time Multiplayer Duels**: Face off against another player in a 5-round match. Both players see the same locations, and the one with the highest total score wins.
  * **Elo Rating System**: Every rated match affects your personal Elo rating. Track your progress, climb the ranks, and prove your skill. Your rating and peak rating are displayed on your profile.
  * **Detailed Player Profiles**: Check out your personal dashboard with stats like total wins, losses, draws, and win percentage. View your complete match history and analyze your performance.
  * **Dynamic Leaderboard**: See how you stack up against the competition on the global leaderboard, ranked by Elo rating.
  * **Live Game Interface**: Experience a seamless game with a full-screen Street View, an interactive guessing map, and real-time updates on your opponent's status.
  * **Open Source & Self-Hostable**: Free to use, modify, and host on your own server.

## Acknowledgements

- [Google Maps API](https://developers.google.com/maps)
- [MariaDB](https://mariadb.org/)
- [Express.js](https://expressjs.com/)
- [Semantic UI](https://semantic-ui.com/)
- [Socket.IO](https://socket.io/)
- [Nunjucks](https://github.com/mozilla/nunjucks)
- [Bcrypt.js](https://github.com/kelektiv/node.bcrypt.js)
- All contributors who helped bring this project to life!

## Getting Started

You can run your own instance of Whereami. Here’s how:

### Pre-requisites

  * [Node.js](https://nodejs.org/) (v16.x or later)
  * [NPM](https://www.npmjs.com/)
  * [MariaDB](https://mariadb.org/) or a compatible database.

### 1. Clone the Repository

```bash
git clone https://github.com/whereami-dev/whereami.git
cd whereami
```

### 2. Install Dependencies

```bash
npm install
```

This will install all the necessary packages listed in `package.json`, including Express, Socket.IO, and the MySQL2 driver.

### 3. Set Up Your Environment

Create a `.env` file in the root of the project. This file will store your secret keys and database credentials. The server requires the following variables:

```env
# Server Configuration
PORT=8888

# Database Connection (MySQL)
DB_HOST=localhost
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=whereami

# Session Secret
SESSION_SECRET=a_very_strong_secret_key_for_sessions

# Google Maps API Key
GOOGLE_MAPS_API_KEY=your_Maps_api_key_here
```

**Important**: You need a Google Maps API key with the Street View Static API, Geocoding API, and Maps JavaScript API enabled.

### 4. Set Up the Database

You need to create the necessary tables in your MySQL database. Connect to your database and run SQL statements in `plugin/create_database.sql` to create the required tables.

### 5. Run the Server

For development with automatic restarting:

```bash
npm run dev
```

For production:

```bash
npm start
```

Open <http://localhost:8888> (or your specified port) in your browser to start playing!

## Contributing

Contributions make the open-source community an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also simply open an issue with the tag "enhancement". Don't forget to give the project a star! Thanks again!

1.  **Fork** the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a **Pull Request**

## License

Distributed under the GNU General Public License v3.0. See `LICENSE` file for more information.
