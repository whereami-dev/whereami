const nunjucks = require('nunjucks');
const moment = require('moment-timezone');

// Auth middleware
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

// Configure Nunjucks template engine
function configureTemplateEngine(app) {
  app.set('view engine', 'njk');
  const nunjucksEnv = nunjucks.configure('views', {
    autoescape: true,
    express: app,
    watch: true
  });

  // Add custom filters
  nunjucksEnv.addFilter('round', function(num, digits) {
    if (num === null || num === undefined) return 'N/A';
    return parseFloat(num).toFixed(digits || 2);
  });

  nunjucksEnv.addFilter('abs', function(num) {
    return Math.abs(num);
  });

  nunjucksEnv.addFilter('format', function(num, format) {
    if (num === null || num === undefined) return 'N/A';
    if (format && format.includes('.4f')) {
      return parseFloat(num).toFixed(4);
    } else if (format && format.includes('.2f')) {
      return parseFloat(num).toFixed(2);
    }
    return num.toString();
  });

  // Make moment available in templates
  app.locals.moment = moment;

  return nunjucksEnv;
}

module.exports = {
  requireAuth,
  configureTemplateEngine
};
