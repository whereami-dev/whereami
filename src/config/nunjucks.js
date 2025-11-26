const nunjucks = require('nunjucks');

/**
 * Configure Nunjucks template engine
 * @param {Express} app - Express application
 * @returns {Environment} Nunjucks environment
 */
function configureNunjucks(app) {
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

  return nunjucksEnv;
}

module.exports = {
  configureNunjucks
};
