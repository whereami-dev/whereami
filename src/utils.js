// Calculate distance between two coordinates using Haversine formula
function calculateDistance(lat1, lng1, lat2, lng2) {
  // If any coordinate is null or undefined (no guess made), return -1 for invalid distance
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

// Calculate score based on distance
function calculateScore(distance) {
  // If distance is -1 (invalid), return 0 points
  if (distance === -1 || distance === null || distance === undefined) {
    return 0;
  }
  
  const maxDistance = 20037.5; // Half of Earth's circumference
  return Math.round(5000 * Math.exp(-10 * (distance / maxDistance)));
}

// Rating color system
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

// Helper function to get user color
async function getUserColor(uid, pool) {
  if (!uid) return null;
  let connection;
  try {
    connection = await pool.getConnection();
    const [rows] = await connection.execute(
      'SELECT elo_rating FROM users WHERE uid = ?',
      [uid]
    );
    return rows.length > 0 ? getColorByRating(rows[0].elo_rating) : null;
  } catch (error) {
    console.error('Failed to get user color:', error);
    return null;
  } finally {
    if (connection) connection.release();
  }
}

// Generate UUID v4
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
  getUserColor,
  generateUUID
};
