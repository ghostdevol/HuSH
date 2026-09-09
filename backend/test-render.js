import { getToken } from '@vercel/connect';

async function testRenderConnection() {
  const token = await getToken('amber-castle'); // your connection name

  const res = await fetch('https://api.render.com/v1/services', {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json();
  console.log(data);
}

testRenderConnection();
