const axios = require('axios');

const BASE_URL = 'http://localhost:4000/api';

async function runTest3() {
  console.log('\n🔥 TEST 3: Onboarding Masivo (Migraciones Multi-Tenant Concurrentes) 🔥');
  console.log('Simulando 10 negocios registrándose exactamente al mismo tiempo...');
  
  const randomStr = Math.random().toString(36).substring(7);
  
  // 10 es un número razonable para testear el pool de conexiones (que típicamente es de 10)
  // Si las transacciones o migraciones no liberan las conexiones rápido, esto provocará un timeout.
  const promises = Array.from({ length: 10 }).map((_, i) => {
    const payload = {
      name: `Owner ${i}`,
      email: `owner_${i}_${randomStr}@test.com`,
      password: 'password123',
      businessName: `Business ${i} ${randomStr}`,
      acceptTerms: true,
      plan: 'pro'
    };
    return axios.post(`${BASE_URL}/auth/register`, payload)
      .then(res => ({ success: true, email: payload.email }))
      .catch(err => ({ success: false, error: err.response?.data?.error || err.message }));
  });

  const results = await Promise.all(promises);
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  console.log('Resultados del Test 3:');
  console.log(`✅ Negocios registrados y BDs creadas exitosamente: ${successCount} de 10`);
  console.log(`❌ Negocios fallidos: ${failCount}`);

  if (failCount > 0) {
    console.log('Ejemplo de error:', results.find(r => !r.success).error);
    console.log('⚠️ ALERTA: Hubo problemas al aprovisionar las bases de datos concurrentemente (posible agotamiento del pool o interbloqueo en creación de BDs).');
  } else {
    console.log('🏆 ¡PRUEBA SUPERADA! El pool de conexiones y el migrador aislaron y crearon las 10 BDs simultáneamente sin asfixiarse.');
  }
}

runTest3().catch(console.error);
