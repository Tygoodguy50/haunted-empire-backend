// Automated test for tier-based resource limits
const axios = require('axios');

const API_URL = 'http://localhost:3002';
const userId = 'testuser1';

async function testApiCallLimit() {
  let lastStatus = null;
  for (let i = 1; i <= 105; i++) {
    try {
      const res = await axios.post(`${API_URL}/billing/pay`, {
        userId,
        amount: 1000,
        currency: 'usd',
        source: 'tok_visa',
        description: `Test charge ${i}`
      });
      lastStatus = res.status;
      if (i % 10 === 0) console.log(`API call ${i}: success`);
    } catch (err) {
      lastStatus = err.response?.status;
      console.log(`API call ${i}: failed - ${err.response?.data?.error}`);
      if (lastStatus === 403) {
        console.log('API call limit exceeded as expected.');
        break;
      }
    }
  }
}

async function testLoreDropLimit() {
  for (let i = 1; i <= 15; i++) {
    try {
      const res = await axios.post(`${API_URL}/lore-drop`, {
        userId
      });
      if (i % 2 === 0) console.log(`Lore drop ${i}: success`);
    } catch (err) {
      console.log(`Lore drop ${i}: failed - ${err.response?.data?.error}`);
      if (err.response?.status === 403) {
        console.log('Lore drop limit exceeded as expected.');
        break;
      }
    }
  }
}

(async () => {
  console.log('Testing API call limit...');
  await testApiCallLimit();
  console.log('Testing lore drop limit...');
  await testLoreDropLimit();
})();
