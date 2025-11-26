const axios = require('axios');

async function generateValidStreetViewLocation() {
  const maxAttempts = 50;
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    console.log(`\n--- [Attempt ${attempts}] ---`);

    try {
      // 1. Generate random coordinates
      const lat = Math.random() * 180 - 90;
      const lng = Math.random() * 360 - 180;
      if (lat < -80) {
        // Avoid incorrect street views
        continue;
      }

      // 2. Validate location using Street View Metadata API
      let streetViewUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&radius=50000&key=${process.env.GOOGLE_MAPS_API_KEY}`;
      
      if (Math.random() < 0.75) { // 75% probability for outdoor street views
        streetViewUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&radius=50000&source=outdoor&key=${process.env.GOOGLE_MAPS_API_KEY}`;
      }

      const svResponse = await axios.get(streetViewUrl);
      if (svResponse.data.status !== 'OK') {
        console.log(`❌ No street view at: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
        continue;
      }
      const location = svResponse.data.location;
      const streetViewUrl2 = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${location.lat},${location.lng}&radius=1&key=${process.env.GOOGLE_MAPS_API_KEY}`;
      const svResponse2 = await axios.get(streetViewUrl2);
      if (svResponse2.data.status !== 'OK') {
        // Use fallback location
        return {
          lat: 39.0194608,
          lng: 125.75355107
        };
      }
      
      console.log(`✅ Valid street view panorama found at: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`);

      // 3. Use Geocoding API to get country code
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${location.lat},${location.lng}&key=${process.env.GOOGLE_MAPS_API_KEY}&result_type=country`;
      
      const geoResponse = await axios.get(geocodeUrl);

      let countryCode = null;
      if (geoResponse.data.status === 'OK' && geoResponse.data.results.length > 0) {
        const addressComponents = geoResponse.data.results[0].address_components;
        const countryComponent = addressComponents.find(c => c.types.includes('country'));
        if (countryComponent) {
          countryCode = countryComponent.short_name;
        }
      }

      if (!countryCode) {
        console.log(`⚠️ Could not determine country for the location. Skipping.`);
        continue;
      }

      console.log(`🌍 Country identified as: ${countryCode}`);

      // 4. Reselect logic to maintain geographic balance
      const randomChance = Math.random();
      let shouldReselect = false;

      if ((countryCode === 'US' || countryCode === 'CA') && randomChance < 0.30) {
        console.log(`🎲 Reselecting due to 30% chance for ${countryCode}.`);
        shouldReselect = true;
      } else if (countryCode === 'RU' && randomChance < 0.50) {
        console.log(`🎲 Reselecting due to 50% chance for ${countryCode}.`);
        shouldReselect = true;
      } else if ((countryCode === 'AU' || countryCode === 'BR') && randomChance < 0.20) {
        console.log(`🎲 Reselecting due to 20% chance for ${countryCode}.`);
        shouldReselect = true;
      }

      if (shouldReselect) {
        continue;
      }

      // 5. All checks passed, return final result
      console.log(`🎉 Success! Selected location in ${countryCode}.`);
      return {
        lat: location.lat,
        lng: location.lng
      };

    } catch (error) {
      if (error.response) {
        console.error(`Error with API request: ${error.response.status} ${error.response.data.error_message || error.response.statusText}`);
      } else {
        console.error(`An unexpected error occurred:`, error.message);
      }
    }
  }

  // If max attempts reached, return fallback location
  console.log('⚠️ Reached max attempts. Using fallback location: Pyongyang, North Korea.');
  return {
    lat: 39.0194608,
    lng: 125.75355107
  };
}

module.exports = {
  generateValidStreetViewLocation
};
