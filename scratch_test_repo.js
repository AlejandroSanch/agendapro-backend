
const { listProducts } = require('./src/data/repositories/product.repository');
const { ensureControlDatabaseAndPool } = require('./src/data/db');

async function testRepo() {
  await ensureControlDatabaseAndPool();
  // Get verifier@example.com user ID
  // From previous check, it was user011
  const userId = 'user011';
  const products = await listProducts(userId);
  console.log('Products from Repo:');
  console.log(JSON.stringify(products, null, 2));
  process.exit(0);
}

testRepo().catch(err => {
  console.error(err);
  process.exit(1);
});
