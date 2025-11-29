const express = require('express');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const { generateUUID } = require('../utils/helpers');

const router = express.Router();

/**
 * Setup auth routes
 * @param {Pool} pool - Database connection pool
 * @returns {Router} Express router
 */
function setupAuthRoutes(pool) {
  // Root route
  router.get('/', (req, res) => {
    console.log(`🏠 Root route accessed by: ${req.session.user?.username || 'Anonymous'}`);
    
    if (req.session.user) {
      console.log(`✅ User logged in: ${req.session.user.username} (UID: ${req.session.user.uid})`);
      res.redirect('/lobby');
    } else {
      console.log(`🔑 No user session, redirecting to auth`);
      res.redirect('/auth');
    }
  });

  // Auth page
  router.get('/auth', (req, res) => {
    console.log(`🔑 Auth page accessed`);
    
    if (req.session.user) {
      console.log(`✅ User already logged in: ${req.session.user.username}, redirecting to lobby`);
      return res.redirect('/lobby');
    }
    
    res.render('auth.njk', { 
      title: 'Whereami - Login',
      error: req.query.error === 'banned' ? 'Account has been banned' : req.session.error,
      success: req.session.success
    });
    delete req.session.error;
    delete req.session.success;
  });

  // Login
  router.post('/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      
      console.log(`🔑 Login attempt for: ${username}`);
      
      if (!username) {
        req.session.error = 'Username is required';
        return res.redirect('/auth');
      }
      
      const connection = await pool.getConnection();
      const [rows] = await connection.execute(
        'SELECT * FROM users WHERE username = ? OR email = ?',
        [username, username]
      );
      connection.release();
      
      if (rows.length === 0) {
        console.log(`❌ User not found: ${username}`);
        req.session.error = 'User not found';
        return res.redirect('/auth');
      }
      
      const user = rows[0];
      
      if (user.user_type === 'Banned') {
        console.log(`❌ Banned user login attempt: ${username}`);
        req.session.error = 'Account has been banned';
        return res.redirect('/auth');
      }
      
      if (user.password_hash && password) {
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
          console.log(`❌ Invalid password for: ${username}`);
          req.session.error = 'Invalid password';
          return res.redirect('/auth');
        }
      } else if (user.password_hash && !password) {
        req.session.error = 'Password required';
        return res.redirect('/auth');
      }
      
      req.session.user = {
        uid: user.uid,
        id: user.id,
        username: user.username,
        email: user.email,
        userType: user.user_type,
        anonymous: user.is_anonymous
      };
      
      // Update last active
      const updateConnection = await pool.getConnection();
      await updateConnection.execute(
        'UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE uid = ?',
        [user.uid]
      );
      updateConnection.release();
      
      console.log(`✅ User logged in: ${user.username} (UID: ${user.uid}, Type: ${user.user_type})`);
      res.redirect('/lobby');
    } catch (error) {
      console.error('❌ Login error:', error);
      req.session.error = 'Login failed';
      res.redirect('/auth');
    }
  });

  // Register
  router.post('/auth/register', async (req, res) => {
    let connection;
    try {
      const { username, email, password } = req.body;
      console.log(`👤 Registration attempt for: ${username} from IP: ${req.ip}`);

      if (!username || !email || !password) {
        req.session.error = 'All fields are required';
        return res.redirect('/auth');
      }

      connection = await pool.getConnection();
      await connection.beginTransaction();

      // Check if username or email already exists
      const [existingUsers] = await connection.execute(
        'SELECT uid FROM users WHERE username = ? OR email = ? FOR UPDATE',
        [username, email]
      );

      if (existingUsers.length > 0) {
        await connection.rollback();
        connection.release();
        console.log('❌ Registration failed: Username or email already exists.');
        req.session.error = 'Username or email already exists';
        return res.redirect('/auth');
      }

      // Insert new user
      const userId = generateUUID();
      const hashedPassword = await bcrypt.hash(password, 10);

      const [result] = await connection.execute(
        'INSERT INTO users (id, username, email, password_hash, user_type, registered_at, elo_rating, peak_elo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [userId, username, email, hashedPassword, 'Normal', new Date(), 1500, 1500]
      );

      const uid = result.insertId;

      await connection.commit();

      req.session.user = {
        uid: uid,
        id: userId,
        username,
        email,
        userType: 'Normal',
        anonymous: false
      };

      const contentToAppend = `New user registered: ${username} (UID: ${uid}) from IP: ${req.ip}\n`;
      fs.appendFileSync('register-log.txt', contentToAppend);
      res.redirect('/lobby');

    } catch (error) {
      if (connection) {
        await connection.rollback();
      }
      console.error('❌ Registration error:', error);
      req.session.error = 'Registration failed';
      res.redirect('/auth');
    } finally {
      if (connection) {
        connection.release();
        console.log('🔗 Connection released.');
      }
    }
  });

  // Logout
  router.post('/logout', (req, res) => {
    const username = req.session.user?.username;
    req.session.destroy();
    console.log(`🚪 User logged out: ${username}`);
    res.redirect('/auth');
  });

  return router;
}

module.exports = { setupAuthRoutes };
