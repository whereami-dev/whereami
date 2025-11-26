// Utility helper functions

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - First latitude
 * @param {number} lng1 - First longitude
 * @param {number} lat2 - Second latitude
 * @param {number} lng2 - Second longitude
 * @returns {number} Distance in kilometers, or -1 if coordinates are invalid
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
  // If any coordinate is null or undefined (no guess), return -1 for invalid distance
  if (lat1 === null || lng1 === null || lat2 === null || lng2 === null ||
      lat1 === undefined || lng1 === undefined || lat2 === undefined || lng2 === undefined) {
    return -1;
  }
  
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Calculate score based on distance
 * @param {number} distance - Distance in kilometers
 * @returns {number} Score (0-5000 points)
 */
function calculateScore(distance) {
  // If distance is -1 (invalid), return 0 points
  if (distance === -1 || distance === null || distance === undefined) {
    return 0;
  }
  
  const maxDistance = 20037.5; // Half of Earth's circumference
  return Math.round(5000 * Math.exp(-10 * (distance / maxDistance)));
}

/**
 * Get color class based on ELO rating
 * @param {string|number} str_rating - Rating value
 * @returns {string} CSS class name for the rating color
 */
function getColorByRating(str_rating) {
  const rating = parseInt(str_rating);
  if (rating < 1250) return 'grey-rating';
  else if (rating < 1350) return 'green-rating';
  else if (rating < 1450) return 'cyan-rating';
  else if (rating < 1550) return 'blue-rating';
  else if (rating < 1650) return 'yellow-rating';
  else if (rating < 1750) return 'orange-rating';
  else if (rating < 1850) return 'red-rating';
  else if (rating < 1950) return 'nutella';
  else if (rating < 2050) return 'tourist';
  else return 'rainbow';
}

/**
 * Generate a UUID v4 string
 * @returns {string} UUID string
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

module.exports = {
  calculateDistance,
  calculateScore,
  getColorByRating,
  generateUUID
};
