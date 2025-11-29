/**
 * Authentication middleware
 * Checks if user is logged in and not banned
 */
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/auth');
  }
  if (req.session.user.userType === 'Banned') {
    req.session.destroy();
    return res.redirect('/auth?error=banned');
  }
  next();
}

module.exports = {
  requireAuth
};
